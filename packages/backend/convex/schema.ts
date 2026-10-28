import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

/** Legacy home/office codes. Optional, and cleared by `clearSpaceKind`. */
export const spaceKindValidator = v.union(
	v.literal('household'),
	v.literal('partners'),
	v.literal('office'),
);

/** Who a member is inside a place. */
export const memberRoleValidator = v.union(v.literal('admin'), v.literal('member'));

/** What kind of good this is. Clients translate the label. */
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

/** How the quantity is counted. Clients translate the label. */
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

/** Where the good sits. Clients translate the label. */
export const shelfValidator = v.union(
	v.literal('fridge'),
	v.literal('tearoom'),
	v.literal('washroom'),
	v.literal('sink'),
	v.literal('cupboard'),
	v.literal('printroom'),
);

/** Stored copy of the domain freshness classification. */
export const freshnessValidator = v.union(
	v.literal('undated'),
	v.literal('ok'),
	v.literal('soon'),
	v.literal('expired'),
);

/** Stored copy of the domain supply classification. */
export const supplyValidator = v.union(v.literal('ok'), v.literal('low'), v.literal('out'));

/** A take that removes stock, or a buy that puts it back. */
export const movementKindValidator = v.union(v.literal('consume'), v.literal('restock'));

/** Whether a take was applied or rejected by the fold. */
export const outcomeValidator = v.union(v.literal('applied'), v.literal('rejected'));

/** Why a take was rejected. Null when it was applied. */
export const rejectionCodeValidator = v.union(
	v.literal('INSUFFICIENT_STOCK'),
	v.literal('CAUSAL_CYCLE'),
	v.null(),
);

/** A trip still being shopped, or one already checked off. */
export const purchaseStatusValidator = v.union(v.literal('open'), v.literal('bought'));

export default defineSchema({
	/**
	 * Membership boundary for one shared shelf. Not a home or an office.
	 * `kind` is optional only so older rows still validate until
	 * `clearSpaceKind` removes it.
	 */
	spaces: defineTable({
		name: v.string(),
		kind: v.optional(spaceKindValidator),
		createdBy: v.string(),
		createdAt: v.number(),
	}).index('by_createdAt', ['createdAt']),

	/** A person in a place. `userId` is the auth subject. */
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

	/** One take. Replayed in order to produce `items.quantity`. */
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

	/** One shopping trip. The money is a single total, not a price per good. */
	purchases: defineTable({
		spaceId: v.id('spaces'),
		clientMutationId: v.string(),
		totalCents: v.number(),
		status: purchaseStatusValidator,
		createdBy: v.string(),
		createdAt: v.number(),
		boughtBy: v.union(v.string(), v.null()),
		boughtAt: v.union(v.number(), v.null()),
	})
		.index('by_space', ['spaceId'])
		.index('by_space_and_client', ['spaceId', 'clientMutationId']),

	/** A good on a trip. `itemId` is null after that good is deleted; the name stays. */
	purchaseItems: defineTable({
		purchaseId: v.id('purchases'),
		spaceId: v.id('spaces'),
		itemId: v.union(v.id('items'), v.null()),
		name: v.string(),
		unit: v.union(itemUnitValidator, v.null()),
		quantity: v.number(),
	})
		.index('by_purchase', ['purchaseId'])
		.index('by_space', ['spaceId']),

	/**
	 * Previous shape: one good and its own price. Kept so `foldPurchaseLines`
	 * can copy rows into `purchases`. Drop it in a later deploy, after that
	 * fold has run.
	 */
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
	})
		.index('by_space', ['spaceId'])
		.index('by_space_and_client', ['spaceId', 'clientMutationId']),
});
