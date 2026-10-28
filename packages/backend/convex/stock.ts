import {
	assessStock,
	draftShelfItem,
	StockPolicyLive,
	type StockAssessment,
	type StockError,
} from '@goods/domain/stock';
import { APP_ERROR_CODES, type AppErrorData } from '@goods/shared/error-codes';
import { ConvexError, v } from 'convex/values';
import { Cause, Effect, Exit } from 'effect';

import { query } from './_generated/server';
import { mutation } from './functions';
import { applyStockOps } from './lib/applyStock';
import { notFound, requireSpaceMember } from './lib/spaceAccess';
import {
	freshnessValidator,
	itemCategoryValidator,
	itemUnitValidator,
	movementKindValidator,
	outcomeValidator,
	rejectionCodeValidator,
	shelfValidator,
	spaceKindValidator,
	supplyValidator,
} from './schema';

const itemView = v.object({
	_id: v.id('items'),
	name: v.string(),
	category: itemCategoryValidator,
	unit: itemUnitValidator,
	quantity: v.number(),
	safetyQuantity: v.number(),
	expiresOn: v.union(v.string(), v.null()),
	shelf: shelfValidator,
	version: v.number(),
	freshness: freshnessValidator,
	supply: supplyValidator,
	shortfall: v.number(),
});

const movementView = v.object({
	_id: v.id('movements'),
	itemId: v.id('items'),
	itemName: v.string(),
	unit: itemUnitValidator,
	kind: movementKindValidator,
	quantity: v.number(),
	actorLabel: v.string(),
	occurredAt: v.number(),
	outcome: outcomeValidator,
	rejectionCode: rejectionCodeValidator,
});

function throwAssessment(error: StockError): never {
	throw new ConvexError<AppErrorData>({
		code: APP_ERROR_CODES.stockInvalid,
		message: error.reason,
	});
}

/** The shelf, who shares it, and the latest takes — the live board both clients render. */
export const board = query({
	args: { spaceId: v.id('spaces'), today: v.string() },
	returns: v.object({
		space: v.object({
			_id: v.id('spaces'),
			name: v.string(),
			kind: spaceKindValidator,
			budgetCents: v.union(v.number(), v.null()),
		}),
		memberCount: v.number(),
		members: v.array(v.object({ userId: v.string(), label: v.string() })),
		items: v.array(itemView),
		movements: v.array(movementView),
	}),
	handler: async (ctx, args) => {
		const { space } = await requireSpaceMember(ctx, args.spaceId);
		const members = await ctx.db
			.query('memberships')
			.withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
			.collect();
		const labelByUser = new Map(members.map((member) => [member.userId, member.label]));
		const stored = await ctx.db
			.query('items')
			.withIndex('by_space', (q) => q.eq('spaceId', args.spaceId))
			.collect();

		const items = [];
		for (const item of stored) {
			const exit = await Effect.runPromiseExit(
				assessStock({
					quantity: item.quantity,
					safetyQuantity: item.safetyQuantity,
					expiresOn: item.expiresOn,
					today: args.today,
				}).pipe(Effect.provide(StockPolicyLive)),
			);
			if (Exit.isFailure(exit)) {
				const failure = Cause.findErrorOption(exit.cause);
				if (failure._tag === 'Some') throwAssessment(failure.value);
				throw Cause.squash(exit.cause);
			}
			const assessment: StockAssessment = exit.value;
			items.push({
				_id: item._id,
				name: item.name,
				category: item.category,
				unit: item.unit,
				quantity: item.quantity,
				safetyQuantity: item.safetyQuantity,
				expiresOn: item.expiresOn,
				shelf: item.shelf,
				version: item.version,
				freshness: assessment.freshness,
				supply: assessment.supply,
				shortfall: assessment.shortfall,
			});
		}

		const movements = [];
		for (const item of stored) {
			const rows = await ctx.db
				.query('movements')
				.withIndex('by_item', (q) => q.eq('itemId', item._id))
				.collect();
			for (const row of rows) {
				movements.push({
					_id: row._id,
					itemId: item._id,
					itemName: item.name,
					unit: item.unit,
					kind: row.kind,
					quantity: row.quantity,
					actorLabel: labelByUser.get(row.actorId) ?? '—',
					occurredAt: row.occurredAt,
					outcome: row.outcome,
					rejectionCode: row.rejectionCode,
				});
			}
		}
		movements.sort((left, right) => right.occurredAt - left.occurredAt);

		return {
			space: {
				_id: space._id,
				name: space.name,
				kind: space.kind,
				budgetCents: space.budgetCents,
			},
			memberCount: members.length,
			members: members.map((member) => ({ userId: member.userId, label: member.label })),
			items,
			movements: movements.slice(0, 8),
		};
	},
});

const syncResult = v.object({
	clientMutationId: v.string(),
	outcome: outcomeValidator,
	rejectionCode: rejectionCodeValidator,
});

/**
 * Sync one item's offline (or live) takes. The fold replays the whole log, so
 * an earlier consume that arrives second can reject the one already stored.
 */
export const sync = mutation({
	args: {
		spaceId: v.id('spaces'),
		itemId: v.id('items'),
		ops: v.array(
			v.object({
				clientMutationId: v.string(),
				kind: movementKindValidator,
				quantity: v.number(),
				occurredAt: v.number(),
				causalParentClientId: v.union(v.string(), v.null()),
				observedVersion: v.number(),
			}),
		),
	},
	returns: v.object({
		quantity: v.number(),
		version: v.number(),
		results: v.array(syncResult),
	}),
	handler: async (ctx, args) => {
		const { userId } = await requireSpaceMember(ctx, args.spaceId);
		if (args.ops.length > 40) {
			throw new ConvexError<AppErrorData>({
				code: APP_ERROR_CODES.stockInvalid,
				message: 'Too many operations in one sync.',
			});
		}
		const item = await ctx.db.get('items', args.itemId);
		if (!item || item.spaceId !== args.spaceId) throw notFound('Item not found.');

		const fold = await applyStockOps(ctx, args.itemId, userId, args.ops);
		const wanted = new Set(args.ops.map((operation) => operation.clientMutationId));
		return {
			quantity: fold.quantity,
			version: fold.version,
			results: fold.outcomes
				.filter((outcome) => wanted.has(outcome.clientMutationId))
				.map((outcome) => ({
					clientMutationId: outcome.clientMutationId,
					outcome: outcome.outcome,
					rejectionCode: outcome.rejectionCode,
				})),
		};
	},
});

/** Places a new good on the shelf. Quantity starts the fold; later takes replay from it. */
export const create = mutation({
	args: {
		spaceId: v.id('spaces'),
		name: v.string(),
		category: itemCategoryValidator,
		unit: itemUnitValidator,
		quantity: v.number(),
		safetyQuantity: v.number(),
		expiresOn: v.union(v.string(), v.null()),
		shelf: shelfValidator,
	},
	returns: v.id('items'),
	handler: async (ctx, args) => {
		const { userId } = await requireSpaceMember(ctx, args.spaceId);
		const exit = await Effect.runPromiseExit(
			draftShelfItem({
				name: args.name,
				category: args.category,
				unit: args.unit,
				quantity: args.quantity,
				safetyQuantity: args.safetyQuantity,
				expiresOn: args.expiresOn,
				shelf: args.shelf,
			}),
		);
		if (Exit.isFailure(exit)) {
			const failure = Cause.findErrorOption(exit.cause);
			if (failure._tag === 'Some') throwAssessment(failure.value);
			throw Cause.squash(exit.cause);
		}
		const drafted = exit.value;
		return await ctx.db.insert('items', {
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
	},
});
