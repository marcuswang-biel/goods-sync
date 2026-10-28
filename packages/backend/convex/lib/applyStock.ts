import { mergeStockLog, type StockError, type StockFold } from '@goods/domain/stock';
import { APP_ERROR_CODES, type AppErrorData } from '@goods/shared/error-codes';
import { ConvexError } from 'convex/values';
import { Cause, Effect, Exit } from 'effect';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

import { notFound } from './spaceAccess';

export type IncomingMovement = {
	readonly clientMutationId: string;
	readonly kind: 'consume' | 'restock';
	readonly quantity: number;
	readonly occurredAt: number;
	readonly causalParentClientId: string | null;
	readonly observedVersion: number;
};

function throwStock(error: StockError): never {
	throw new ConvexError<AppErrorData>({
		code: APP_ERROR_CODES.stockInvalid,
		message: error.reason,
	});
}

/**
 * Folds one item's log, including `incoming`, and writes the cache back.
 * Existing rows are patched when a replay changes their outcome. The actor of
 * a new row is `actorId`; stored rows keep the person who synced them.
 */
export async function applyStockOps(
	ctx: MutationCtx,
	itemId: Id<'items'>,
	actorId: string,
	incoming: readonly IncomingMovement[],
): Promise<StockFold> {
	const item = await ctx.db.get('items', itemId);
	if (!item) throw notFound('Item not found.');

	const stored = await ctx.db
		.query('movements')
		.withIndex('by_item', (q) => q.eq('itemId', itemId))
		.collect();

	const known = new Set(stored.map((movement) => movement.clientMutationId));
	const movements = stored.map((movement) => ({
		clientMutationId: movement.clientMutationId,
		kind: movement.kind,
		quantity: movement.quantity,
		occurredAt: movement.occurredAt,
		causalParentClientId: movement.causalParentClientId,
	}));
	const fresh: IncomingMovement[] = [];
	for (const operation of incoming) {
		if (known.has(operation.clientMutationId)) continue;
		known.add(operation.clientMutationId);
		fresh.push(operation);
		movements.push({
			clientMutationId: operation.clientMutationId,
			kind: operation.kind,
			quantity: operation.quantity,
			occurredAt: operation.occurredAt,
			causalParentClientId: operation.causalParentClientId,
		});
	}

	const exit = await Effect.runPromiseExit(
		mergeStockLog({ openingQuantity: item.openingQuantity, movements }),
	);
	if (Exit.isFailure(exit)) {
		const failure = Cause.findErrorOption(exit.cause);
		if (failure._tag === 'Some') throwStock(failure.value);
		throw Cause.squash(exit.cause);
	}

	const fold = exit.value;
	const outcomeById = new Map(fold.outcomes.map((outcome) => [outcome.clientMutationId, outcome]));

	for (const movement of stored) {
		const outcome = outcomeById.get(movement.clientMutationId);
		if (outcome === undefined) continue;
		if (movement.outcome === outcome.outcome && movement.rejectionCode === outcome.rejectionCode) {
			continue;
		}
		await ctx.db.patch('movements', movement._id, {
			outcome: outcome.outcome,
			rejectionCode: outcome.rejectionCode,
		});
	}

	for (const operation of fresh) {
		const outcome = outcomeById.get(operation.clientMutationId);
		if (outcome === undefined) continue;
		await ctx.db.insert('movements', {
			spaceId: item.spaceId,
			itemId,
			clientMutationId: operation.clientMutationId,
			kind: operation.kind,
			quantity: operation.quantity,
			actorId,
			observedVersion: operation.observedVersion,
			occurredAt: operation.occurredAt,
			causalParentClientId: operation.causalParentClientId,
			outcome: outcome.outcome,
			rejectionCode: outcome.rejectionCode,
		});
	}

	if (item.quantity !== fold.quantity || item.version !== fold.version) {
		await ctx.db.patch('items', itemId, { quantity: fold.quantity, version: fold.version });
	}
	return fold;
}
