import {
	draftPurchaseBasket,
	draftPurchaseQuantity,
	type PurchaseBasket,
	type PurchaseError,
} from '@goods/domain/purchase';
import { APP_ERROR_CODES, type AppErrorData } from '@goods/shared/error-codes';
import { ConvexError, v } from 'convex/values';
import { Cause, Effect, Exit } from 'effect';

import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

import { query } from './_generated/server';
import { mutation } from './functions';
import { applyStockOps } from './lib/applyStock';
import { notFound, requireSpaceMember } from './lib/spaceAccess';
import { itemUnitValidator, purchaseStatusValidator } from './schema';

/** One line as the purchase list returns it. The item id is null after the good is deleted. */
const itemView = v.object({
	_id: v.id('purchaseItems'),
	itemId: v.union(v.id('items'), v.null()),
	name: v.string(),
	unit: v.union(itemUnitValidator, v.null()),
	quantity: v.number(),
});

/** One trip as the purchase list returns it, with its lines. */
const purchaseView = v.object({
	_id: v.id('purchases'),
	clientMutationId: v.string(),
	totalCents: v.number(),
	status: purchaseStatusValidator,
	items: v.array(itemView),
});

/** Outcome of one add or buy in a sync batch. */
const opResult = v.object({
	clientMutationId: v.string(),
	outcome: v.union(v.literal('applied'), v.literal('rejected'), v.literal('duplicate')),
	rejectionCode: v.union(v.literal('PURCHASE_INVALID'), v.literal('NOT_FOUND'), v.null()),
});

/** Same shape as `opResult`, for the handler's local array. */
type OpResult = {
	clientMutationId: string;
	outcome: 'applied' | 'rejected' | 'duplicate';
	rejectionCode: 'PURCHASE_INVALID' | 'NOT_FOUND' | null;
};

/** True for a tagged purchase failure. A validated quantity is a number and is not an error. */
function isPurchaseError(value: PurchaseBasket | PurchaseError | number): value is PurchaseError {
	return typeof value === 'object' && value !== null && '_tag' in value;
}

/** A sync row the client should show as rejected. */
function rejected(
	clientMutationId: string,
	rejectionCode: 'PURCHASE_INVALID' | 'NOT_FOUND',
): OpResult {
	return { clientMutationId, outcome: 'rejected', rejectionCode };
}

/** Runs a purchase Effect and returns its tagged error instead of throwing it. */
async function runPurchase<A>(
	program: Effect.Effect<A, PurchaseError>,
): Promise<A | PurchaseError> {
	const exit = await Effect.runPromiseExit(program);
	if (Exit.isSuccess(exit)) return exit.value;
	const failure = Cause.findErrorOption(exit.cause);
	if (failure._tag === 'Some') return failure.value;
	throw Cause.squash(exit.cause);
}

/** Open and bought trips. */
export const list = query({
	args: { spaceId: v.id('spaces') },
	returns: v.object({
		purchases: v.array(purchaseView),
	}),
	handler: async (ctx, args) => {
		await requireSpaceMember(ctx, args.spaceId);
		const stored = await ctx.db
			.query('purchases')
			.withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
			.collect();
		const ordered = stored.toSorted((left, right) => left.createdAt - right.createdAt);
		const goods = await ctx.db
			.query('purchaseItems')
			.withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
			.collect();

		const purchases = [];
		for (const purchase of ordered) {
			const items = goods
				.filter((good) => good.purchaseId === purchase._id)
				.toSorted((left, right) => left._creationTime - right._creationTime)
				.map((good) => ({
					_id: good._id,
					itemId: good.itemId,
					name: good.name,
					unit: good.unit,
					quantity: good.quantity,
				}));

			purchases.push({
				_id: purchase._id,
				clientMutationId: purchase.clientMutationId,
				totalCents: purchase.totalCents,
				status: purchase.status,
				items,
			});
		}

		return { purchases };
	},
});

/** Adds the bought quantity back onto a shelf item that is still linked. */
async function restockLinked(
	ctx: MutationCtx,
	spaceId: Id<'spaces'>,
	itemId: Id<'items'>,
	actorId: string,
	clientMutationId: string,
	quantity: number,
	occurredAt: number,
) {
	const item = await ctx.db.get('items', itemId);
	if (!item || item.spaceId !== spaceId) throw notFound('Item not found.');
	await applyStockOps(ctx, itemId, actorId, [
		{
			clientMutationId,
			kind: 'restock',
			quantity,
			occurredAt,
			causalParentClientId: null,
			observedVersion: item.version,
		},
	]);
}

/**
 * Sync shopping trips. An add stores many goods and one total. Checking it
 * off restocks every linked good.
 */
export const sync = mutation({
	args: {
		spaceId: v.id('spaces'),
		ops: v.array(
			v.union(
				v.object({
					tag: v.literal('add'),
					clientMutationId: v.string(),
					totalCents: v.number(),
					occurredAt: v.number(),
					items: v.array(
						v.object({
							itemId: v.id('items'),
							quantity: v.number(),
						}),
					),
				}),
				v.object({
					tag: v.literal('buy'),
					clientMutationId: v.string(),
					purchaseClientMutationId: v.string(),
					occurredAt: v.number(),
				}),
			),
		),
	},
	returns: v.array(opResult),
	handler: async (ctx, args) => {
		const { userId } = await requireSpaceMember(ctx, args.spaceId);
		if (args.ops.length > 40) {
			throw new ConvexError<AppErrorData>({
				code: APP_ERROR_CODES.purchaseInvalid,
				message: 'Too many operations in one sync.',
			});
		}

		const results: OpResult[] = [];
		const adds = args.ops.filter((operation) => operation.tag === 'add');
		const buys = args.ops
			.filter((operation) => operation.tag === 'buy')
			.toSorted((left, right) => left.occurredAt - right.occurredAt);

		for (const operation of adds) {
			const existing = await ctx.db
				.query('purchases')
				.withIndex('by_space_and_client', (q) =>
					q.eq('spaceId', args.spaceId).eq('clientMutationId', operation.clientMutationId),
				)
				.unique();
			if (existing) {
				results.push({
					clientMutationId: operation.clientMutationId,
					outcome: 'duplicate',
					rejectionCode: null,
				});
				continue;
			}

			const drafted = await runPurchase(
				draftPurchaseBasket({
					totalCents: operation.totalCents,
					items: operation.items.map((item) => ({
						itemId: item.itemId,
						quantity: item.quantity,
					})),
				}),
			);
			if (isPurchaseError(drafted)) {
				results.push(rejected(operation.clientMutationId, 'PURCHASE_INVALID'));
				continue;
			}

			const rows = [];
			let missing = false;
			for (const entry of drafted.items) {
				const source = operation.items.find((item) => item.itemId === entry.itemId);
				if (!source) {
					missing = true;
					break;
				}
				const item = await ctx.db.get('items', source.itemId);
				if (!item || item.spaceId !== args.spaceId) {
					missing = true;
					break;
				}
				rows.push({ item, quantity: entry.quantity });
			}
			if (missing) {
				results.push(rejected(operation.clientMutationId, 'NOT_FOUND'));
				continue;
			}

			const purchaseId = await ctx.db.insert('purchases', {
				spaceId: args.spaceId,
				clientMutationId: operation.clientMutationId,
				totalCents: drafted.totalCents,
				status: 'open',
				createdBy: userId,
				createdAt: operation.occurredAt,
				boughtBy: null,
				boughtAt: null,
			});
			for (const row of rows) {
				await ctx.db.insert('purchaseItems', {
					purchaseId,
					spaceId: args.spaceId,
					itemId: row.item._id,
					name: row.item.name,
					unit: row.item.unit,
					quantity: row.quantity,
				});
			}
			results.push({
				clientMutationId: operation.clientMutationId,
				outcome: 'applied',
				rejectionCode: null,
			});
		}

		for (const operation of buys) {
			const purchase = await ctx.db
				.query('purchases')
				.withIndex('by_space_and_client', (q) =>
					q.eq('spaceId', args.spaceId).eq('clientMutationId', operation.purchaseClientMutationId),
				)
				.unique();
			if (!purchase) {
				results.push(rejected(operation.clientMutationId, 'NOT_FOUND'));
				continue;
			}
			if (purchase.status === 'bought') {
				results.push({
					clientMutationId: operation.clientMutationId,
					outcome: 'duplicate',
					rejectionCode: null,
				});
				continue;
			}

			const goods = await ctx.db
				.query('purchaseItems')
				.withIndex('by_purchase', (q) => q.eq('purchaseId', purchase._id))
				.collect();
			const linked = [];
			let missing = false;
			for (const good of goods) {
				if (good.itemId === null) continue;
				const item = await ctx.db.get('items', good.itemId);
				if (!item || item.spaceId !== args.spaceId) {
					missing = true;
					break;
				}
				linked.push({ itemId: good.itemId, quantity: good.quantity, goodId: good._id });
			}
			if (missing) {
				results.push(rejected(operation.clientMutationId, 'NOT_FOUND'));
				continue;
			}

			for (const good of linked) {
				await restockLinked(
					ctx,
					args.spaceId,
					good.itemId,
					userId,
					`${operation.clientMutationId}:${good.goodId}`,
					good.quantity,
					operation.occurredAt,
				);
			}
			await ctx.db.patch('purchases', purchase._id, {
				status: 'bought',
				boughtBy: userId,
				boughtAt: operation.occurredAt,
			});
			results.push({
				clientMutationId: operation.clientMutationId,
				outcome: 'applied',
				rejectionCode: null,
			});
		}

		return results;
	},
});

/** Change how many to buy on an open trip. A bought trip keeps its quantity. */
export const setQuantity = mutation({
	args: {
		spaceId: v.id('spaces'),
		purchaseItemId: v.id('purchaseItems'),
		quantity: v.number(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireSpaceMember(ctx, args.spaceId);
		const drafted = await runPurchase(draftPurchaseQuantity(args.quantity));
		if (isPurchaseError(drafted)) {
			throw new ConvexError<AppErrorData>({
				code: APP_ERROR_CODES.purchaseInvalid,
				message: 'Buy a whole number from 1 to 99.',
			});
		}
		const row = await ctx.db.get('purchaseItems', args.purchaseItemId);
		if (!row || row.spaceId !== args.spaceId) throw notFound('Purchase item not found.');
		const purchase = await ctx.db.get('purchases', row.purchaseId);
		if (!purchase || purchase.spaceId !== args.spaceId) throw notFound('Purchase not found.');
		if (purchase.status !== 'open') {
			throw new ConvexError<AppErrorData>({
				code: APP_ERROR_CODES.purchaseInvalid,
				message: 'This trip is already bought.',
			});
		}
		await ctx.db.patch('purchaseItems', row._id, { quantity: drafted });
		return null;
	},
});
