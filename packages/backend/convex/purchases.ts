import {
	chargeDepartmentBudget,
	draftPurchase,
	draftShelfItem,
	quoteEqualSplit,
	type PurchaseError,
	type StockError,
} from '@goods/domain/stock';
import { APP_ERROR_CODES, type AppErrorData } from '@goods/shared/error-codes';
import { ConvexError, v } from 'convex/values';
import { Cause, Effect, Exit } from 'effect';

import type { Id } from './_generated/dataModel';

import { query, type MutationCtx } from './_generated/server';
import { mutation } from './functions';
import { applyStockOps } from './lib/applyStock';
import { notFound, requireSpaceMember } from './lib/spaceAccess';
import {
	itemCategoryValidator,
	itemUnitValidator,
	purchaseStatusValidator,
	shelfValidator,
} from './schema';

const lineView = v.object({
	_id: v.id('purchaseLines'),
	clientMutationId: v.string(),
	name: v.string(),
	quantity: v.number(),
	estimatedCents: v.number(),
	linkedItemId: v.union(v.id('items'), v.null()),
	status: purchaseStatusValidator,
	perPersonCents: v.union(v.number(), v.null()),
	remainderCents: v.union(v.number(), v.null()),
	departmentChargeCents: v.union(v.number(), v.null()),
	fitsBudget: v.boolean(),
});

const opResult = v.object({
	clientMutationId: v.string(),
	outcome: v.union(v.literal('applied'), v.literal('rejected'), v.literal('duplicate')),
	rejectionCode: v.union(
		v.literal('PURCHASE_INVALID'),
		v.literal('BUDGET_EXCEEDED'),
		v.literal('NOT_FOUND'),
		v.null(),
	),
});

function purchaseCode(error: PurchaseError): 'PURCHASE_INVALID' | 'BUDGET_EXCEEDED' {
	return error._tag === 'BudgetExceeded' ? 'BUDGET_EXCEEDED' : 'PURCHASE_INVALID';
}

function isPurchaseError<A extends object>(value: A | PurchaseError): value is PurchaseError {
	return '_tag' in value;
}

function isStockError<A extends object>(value: A | StockError): value is StockError {
	return '_tag' in value && value._tag === 'InvalidStock';
}

async function runShelf<A>(program: Effect.Effect<A, StockError>): Promise<A | StockError> {
	const exit = await Effect.runPromiseExit(program);
	if (Exit.isSuccess(exit)) return exit.value;
	const failure = Cause.findErrorOption(exit.cause);
	if (failure._tag === 'Some') return failure.value;
	throw Cause.squash(exit.cause);
}

async function runPurchase<A>(
	program: Effect.Effect<A, PurchaseError>,
): Promise<A | PurchaseError> {
	const exit = await Effect.runPromiseExit(program);
	if (Exit.isSuccess(exit)) return exit.value;
	const failure = Cause.findErrorOption(exit.cause);
	if (failure._tag === 'Some') return failure.value;
	throw Cause.squash(exit.cause);
}

/** Open and bought lines, with the split or budget preview the screen prints. */
export const list = query({
	args: { spaceId: v.id('spaces') },
	returns: v.object({
		kind: v.union(v.literal('household'), v.literal('partners'), v.literal('office')),
		memberCount: v.number(),
		budgetCents: v.union(v.number(), v.null()),
		lines: v.array(lineView),
	}),
	handler: async (ctx, args) => {
		const { space } = await requireSpaceMember(ctx, args.spaceId);
		const members = await ctx.db
			.query('memberships')
			.withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
			.collect();
		const stored = await ctx.db
			.query('purchaseLines')
			.withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
			.collect();
		stored.sort((left, right) => left.createdAt - right.createdAt);

		const lines = [];
		for (const line of stored) {
			let perPersonCents = line.perPersonCents;
			let remainderCents = line.remainderCents;
			let departmentChargeCents = line.departmentChargeCents;
			let fitsBudget = true;

			if (line.status === 'open' && space.kind === 'office') {
				departmentChargeCents = line.estimatedCents;
				if (space.budgetCents === null) {
					fitsBudget = false;
				} else {
					const charged = await runPurchase(
						chargeDepartmentBudget({
							remainingCents: space.budgetCents,
							chargeCents: line.estimatedCents,
						}),
					);
					fitsBudget = !isPurchaseError(charged);
				}
			} else if (line.status === 'open') {
				const quoted = await runPurchase(
					quoteEqualSplit({ totalCents: line.estimatedCents, memberCount: members.length }),
				);
				if (!isPurchaseError(quoted)) {
					perPersonCents = quoted.perPersonCents;
					remainderCents = quoted.remainderCents;
				}
			}

			lines.push({
				_id: line._id,
				clientMutationId: line.clientMutationId,
				name: line.name,
				quantity: line.quantity,
				estimatedCents: line.estimatedCents,
				linkedItemId: line.linkedItemId,
				status: line.status,
				perPersonCents,
				remainderCents,
				departmentChargeCents,
				fitsBudget,
			});
		}

		return {
			kind: space.kind,
			memberCount: members.length,
			budgetCents: space.budgetCents,
			lines,
		};
	},
});

async function restockLinked(
	ctx: MutationCtx,
	spaceId: Id<'spaces'>,
	linkedItemId: Id<'items'> | null,
	actorId: string,
	clientMutationId: string,
	quantity: number,
	occurredAt: number,
) {
	if (linkedItemId === null) return;
	const item = await ctx.db.get('items', linkedItemId);
	if (!item || item.spaceId !== spaceId) throw notFound('Item not found.');
	await applyStockOps(ctx, linkedItemId, actorId, [
		{
			clientMutationId: `${clientMutationId}:restock`,
			kind: 'restock',
			quantity,
			occurredAt,
			causalParentClientId: null,
			observedVersion: item.version,
		},
	]);
}

/**
 * Sync shopping-list edits. Adds land first, then checks, so a line typed in
 * the aisle can be ticked in the same flush. Office lines that do not fit the
 * budget stay open.
 */
export const sync = mutation({
	args: {
		spaceId: v.id('spaces'),
		ops: v.array(
			v.union(
				v.object({
					tag: v.literal('add'),
					clientMutationId: v.string(),
					name: v.string(),
					quantity: v.number(),
					estimatedCents: v.number(),
					linkedItemId: v.union(v.id('items'), v.null()),
					occurredAt: v.number(),
				}),
				v.object({
					tag: v.literal('buy'),
					clientMutationId: v.string(),
					lineClientMutationId: v.string(),
					occurredAt: v.number(),
				}),
				v.object({
					tag: v.literal('receive'),
					mode: v.literal('existing'),
					clientMutationId: v.string(),
					lineClientMutationId: v.string(),
					occurredAt: v.number(),
					itemId: v.id('items'),
				}),
				v.object({
					tag: v.literal('receive'),
					mode: v.literal('new'),
					clientMutationId: v.string(),
					lineClientMutationId: v.string(),
					occurredAt: v.number(),
					category: itemCategoryValidator,
					unit: itemUnitValidator,
					safetyQuantity: v.number(),
					expiresOn: v.union(v.string(), v.null()),
					shelf: shelfValidator,
				}),
			),
		),
	},
	returns: v.array(opResult),
	handler: async (ctx, args) => {
		const { userId, space } = await requireSpaceMember(ctx, args.spaceId);
		if (args.ops.length > 40) {
			throw new ConvexError<AppErrorData>({
				code: APP_ERROR_CODES.purchaseInvalid,
				message: 'Too many operations in one sync.',
			});
		}

		const results: Array<{
			clientMutationId: string;
			outcome: 'applied' | 'rejected' | 'duplicate';
			rejectionCode: 'PURCHASE_INVALID' | 'BUDGET_EXCEEDED' | 'NOT_FOUND' | null;
		}> = [];

		const adds = args.ops.filter((operation) => operation.tag === 'add');
		const buys = args.ops
			.filter((operation) => operation.tag === 'buy')
			.slice()
			.sort((left, right) => left.occurredAt - right.occurredAt);

		for (const operation of adds) {
			const existing = await ctx.db
				.query('purchaseLines')
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
				draftPurchase({
					name: operation.name,
					quantity: operation.quantity,
					estimatedCents: operation.estimatedCents,
				}),
			);
			if (isPurchaseError(drafted)) {
				results.push({
					clientMutationId: operation.clientMutationId,
					outcome: 'rejected',
					rejectionCode: purchaseCode(drafted),
				});
				continue;
			}
			if (operation.linkedItemId !== null) {
				const linked = await ctx.db.get('items', operation.linkedItemId);
				if (!linked || linked.spaceId !== args.spaceId) {
					results.push({
						clientMutationId: operation.clientMutationId,
						outcome: 'rejected',
						rejectionCode: 'NOT_FOUND',
					});
					continue;
				}
			}
			await ctx.db.insert('purchaseLines', {
				spaceId: args.spaceId,
				clientMutationId: operation.clientMutationId,
				name: drafted.name,
				quantity: drafted.quantity,
				estimatedCents: drafted.estimatedCents,
				linkedItemId: operation.linkedItemId,
				status: 'open',
				createdBy: userId,
				createdAt: operation.occurredAt,
				boughtBy: null,
				boughtAt: null,
				perPersonCents: null,
				remainderCents: null,
				departmentChargeCents: null,
			});
			results.push({
				clientMutationId: operation.clientMutationId,
				outcome: 'applied',
				rejectionCode: null,
			});
		}

		const members = await ctx.db
			.query('memberships')
			.withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
			.collect();

		for (const operation of buys) {
			const line = await ctx.db
				.query('purchaseLines')
				.withIndex('by_space_and_client', (q) =>
					q.eq('spaceId', args.spaceId).eq('clientMutationId', operation.lineClientMutationId),
				)
				.unique();
			if (!line) {
				results.push({
					clientMutationId: operation.clientMutationId,
					outcome: 'rejected',
					rejectionCode: 'NOT_FOUND',
				});
				continue;
			}
			if (line.status === 'bought') {
				results.push({
					clientMutationId: operation.clientMutationId,
					outcome: 'duplicate',
					rejectionCode: null,
				});
				continue;
			}

			if (space.kind === 'office') {
				const remaining = (await ctx.db.get('spaces', args.spaceId))?.budgetCents;
				if (remaining === null || remaining === undefined) {
					results.push({
						clientMutationId: operation.clientMutationId,
						outcome: 'rejected',
						rejectionCode: 'BUDGET_EXCEEDED',
					});
					continue;
				}
				const charged = await runPurchase(
					chargeDepartmentBudget({ remainingCents: remaining, chargeCents: line.estimatedCents }),
				);
				if (isPurchaseError(charged)) {
					results.push({
						clientMutationId: operation.clientMutationId,
						outcome: 'rejected',
						rejectionCode: purchaseCode(charged),
					});
					continue;
				}
				await ctx.db.patch('spaces', args.spaceId, { budgetCents: charged.remainingCents });
				await restockLinked(
					ctx,
					args.spaceId,
					line.linkedItemId,
					userId,
					operation.clientMutationId,
					line.quantity,
					operation.occurredAt,
				);
				await ctx.db.patch('purchaseLines', line._id, {
					status: 'bought',
					boughtBy: userId,
					boughtAt: operation.occurredAt,
					departmentChargeCents: line.estimatedCents,
				});
			} else {
				const quoted = await runPurchase(
					quoteEqualSplit({ totalCents: line.estimatedCents, memberCount: members.length }),
				);
				if (isPurchaseError(quoted)) {
					results.push({
						clientMutationId: operation.clientMutationId,
						outcome: 'rejected',
						rejectionCode: purchaseCode(quoted),
					});
					continue;
				}
				await restockLinked(
					ctx,
					args.spaceId,
					line.linkedItemId,
					userId,
					operation.clientMutationId,
					line.quantity,
					operation.occurredAt,
				);
				await ctx.db.patch('purchaseLines', line._id, {
					status: 'bought',
					boughtBy: userId,
					boughtAt: operation.occurredAt,
					perPersonCents: quoted.perPersonCents,
					remainderCents: quoted.remainderCents,
				});
			}
			results.push({
				clientMutationId: operation.clientMutationId,
				outcome: 'applied',
				rejectionCode: null,
			});
		}

		const receives = args.ops.filter((operation) => operation.tag === 'receive');
		for (const operation of receives) {
			const line = await ctx.db
				.query('purchaseLines')
				.withIndex('by_space_and_client', (q) =>
					q.eq('spaceId', args.spaceId).eq('clientMutationId', operation.lineClientMutationId),
				)
				.unique();
			if (!line || line.status !== 'bought') {
				results.push({
					clientMutationId: operation.clientMutationId,
					outcome: 'rejected',
					rejectionCode: line ? 'PURCHASE_INVALID' : 'NOT_FOUND',
				});
				continue;
			}
			if (line.linkedItemId !== null) {
				results.push({
					clientMutationId: operation.clientMutationId,
					outcome: 'duplicate',
					rejectionCode: null,
				});
				continue;
			}

			let itemId: Id<'items'>;
			if (operation.mode === 'existing') {
				const item = await ctx.db.get('items', operation.itemId);
				if (!item || item.spaceId !== args.spaceId) {
					results.push({
						clientMutationId: operation.clientMutationId,
						outcome: 'rejected',
						rejectionCode: 'NOT_FOUND',
					});
					continue;
				}
				itemId = item._id;
				await restockLinked(
					ctx,
					args.spaceId,
					itemId,
					userId,
					operation.clientMutationId,
					line.quantity,
					operation.occurredAt,
				);
			} else {
				const drafted = await runShelf(
					draftShelfItem({
						name: line.name,
						category: operation.category,
						unit: operation.unit,
						quantity: line.quantity,
						safetyQuantity: operation.safetyQuantity,
						expiresOn: operation.expiresOn,
						shelf: operation.shelf,
					}),
				);
				if (isStockError(drafted)) {
					results.push({
						clientMutationId: operation.clientMutationId,
						outcome: 'rejected',
						rejectionCode: 'PURCHASE_INVALID',
					});
					continue;
				}
				itemId = await ctx.db.insert('items', {
					spaceId: args.spaceId,
					name: drafted.name,
					category: drafted.category,
					unit: drafted.unit,
					openingQuantity: drafted.quantity,
					quantity: drafted.quantity,
					safetyQuantity: drafted.safetyQuantity,
					expiresOn: drafted.expiresOn,
					shelf: drafted.shelf,
					version: 0,
					createdBy: userId,
				});
			}
			await ctx.db.patch('purchaseLines', line._id, { linkedItemId: itemId });
			results.push({
				clientMutationId: operation.clientMutationId,
				outcome: 'applied',
				rejectionCode: null,
			});
		}

		return results;
	},
});
