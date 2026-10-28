import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/** English codes; clients translate the label. */
export const spaceKindValidator = v.union(
	v.literal('household'),
	v.literal('partners'),
	v.literal('office'),
);

export const memberRoleValidator = v.union(v.literal('admin'), v.literal('member'));

export const itemCategoryValidator = v.union(
	v.literal('snack'),
	v.literal('coffee'),
	v.literal('tissue'),
	v.literal('dairy'),
	v.literal('fresh'),
	v.literal('paper'),
	v.literal('seasoning'),
	v.literal('supply'),
	v.literal('drink'),
	v.literal('staple'),
	v.literal('fruit'),
	v.literal('frozen'),
	v.literal('care'),
);

export const itemUnitValidator = v.union(
	v.literal('carton'),
	v.literal('slab'),
	v.literal('bag'),
	v.literal('roll'),
	v.literal('bottle'),
	v.literal('ream'),
	v.literal('can'),
	v.literal('piece'),
);

export const shelfValidator = v.union(
	v.literal('fridge'),
	v.literal('tearoom'),
	v.literal('washroom'),
	v.literal('sink'),
	v.literal('cupboard'),
	v.literal('printroom'),
);

export const freshnessValidator = v.union(
	v.literal('undated'),
	v.literal('ok'),
	v.literal('soon'),
	v.literal('expired'),
);

export const supplyValidator = v.union(v.literal('ok'), v.literal('low'), v.literal('out'));

export const movementKindValidator = v.union(v.literal('consume'), v.literal('restock'));

export const outcomeValidator = v.union(v.literal('applied'), v.literal('rejected'));

export const rejectionCodeValidator = v.union(
	v.literal('INSUFFICIENT_STOCK'),
	v.literal('CAUSAL_CYCLE'),
	v.null(),
);

export const purchaseStatusValidator = v.union(v.literal('open'), v.literal('bought'));

export default defineSchema({
	/**
	 * A shared place: a flat, a couple's home, or an office tea room.
	 * Access is membership, checked on every read and write. `createdBy` is the
	 * auth subject of the person who opened it.
	 */
	spaces: defineTable({
		name: v.string(),
		kind: spaceKindValidator,
		createdBy: v.string(),
		budgetCents: v.union(v.number(), v.null()),
		createdAt: v.number(),
	}).index('by_createdAt', ['createdAt']),

	memberships: defineTable({
		spaceId: v.id('spaces'),
		userId: v.string(),
		role: memberRoleValidator,
		label: v.string(),
	})
		.index('by_user', ['userId'])
		.index('by_space', ['spaceId'])
		.index('by_space_and_user', ['spaceId', 'userId']),

	/**
	 * One public good on a shelf. `openingQuantity` is the fold's start;
	 * `quantity` is the cache of replaying every movement. Do not write
	 * `quantity` except from that fold.
	 */
	items: defineTable({
		spaceId: v.id('spaces'),
		name: v.string(),
		category: itemCategoryValidator,
		unit: itemUnitValidator,
		openingQuantity: v.number(),
		quantity: v.number(),
		safetyQuantity: v.number(),
		expiresOn: v.union(v.string(), v.null()),
		shelf: shelfValidator,
		version: v.number(),
		createdBy: v.string(),
	}).index('by_space', ['spaceId']),

	movements: defineTable({
		spaceId: v.id('spaces'),
		itemId: v.id('items'),
		clientMutationId: v.string(),
		kind: movementKindValidator,
		quantity: v.number(),
		actorId: v.string(),
		observedVersion: v.number(),
		occurredAt: v.number(),
		causalParentClientId: v.union(v.string(), v.null()),
		outcome: outcomeValidator,
		rejectionCode: rejectionCodeValidator,
	})
		.index('by_item', ['itemId'])
		.index('by_item_and_client', ['itemId', 'clientMutationId']),

	purchaseLines: defineTable({
		spaceId: v.id('spaces'),
		clientMutationId: v.string(),
		name: v.string(),
		quantity: v.number(),
		estimatedCents: v.number(),
		linkedItemId: v.union(v.id('items'), v.null()),
		status: purchaseStatusValidator,
		createdBy: v.string(),
		createdAt: v.number(),
		boughtBy: v.union(v.string(), v.null()),
		boughtAt: v.union(v.number(), v.null()),
		perPersonCents: v.union(v.number(), v.null()),
		remainderCents: v.union(v.number(), v.null()),
		departmentChargeCents: v.union(v.number(), v.null()),
	})
		.index('by_space', ['spaceId'])
		.index('by_space_and_client', ['spaceId', 'clientMutationId']),
});
