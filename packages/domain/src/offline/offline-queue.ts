import { Effect, Schema } from 'effect';

import { InvalidStock } from '../stock/errors';

/** Shared id shape for queued operations and the shelf items they name. */
const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80));

/** A take or restock waiting on the phone. */
const MovementOperation = Schema.Struct({
	tag: Schema.Literals(['movement']),
	clientMutationId: Id,
	itemId: Id,
	kind: Schema.Literals(['consume', 'restock']),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
	observedVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	causalParentClientId: Schema.NullOr(Id),
});

/** A shop line typed in the aisle, still only on the phone. */
const PurchaseAddOperation = Schema.Struct({
	tag: Schema.Literals(['purchase-add']),
	clientMutationId: Id,
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(99)),
	estimatedCents: Schema.Int.check(Schema.isGreaterThan(0)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** A "bought it" check waiting to be sent. `lineClientMutationId` names the trip. */
const PurchaseBuyOperation = Schema.Struct({
	tag: Schema.Literals(['purchase-buy']),
	clientMutationId: Id,
	lineClientMutationId: Id,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

const Category = Schema.Literals([
	'snack',
	'coffee',
	'tissue',
	'dairy',
	'fresh',
	'paper',
	'seasoning',
	'supply',
	'drink',
	'staple',
	'fruit',
	'frozen',
	'care',
]);

const Unit = Schema.Literals(['carton', 'slab', 'bag', 'roll', 'bottle', 'ream', 'can', 'piece']);

const ShelfPlace = Schema.Literals([
	'fridge',
	'tearoom',
	'washroom',
	'sink',
	'cupboard',
	'printroom',
]);

const StockCount = Schema.Int.check(
	Schema.isGreaterThanOrEqualTo(0),
	Schema.isLessThanOrEqualTo(999),
);

const BuyCount = Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(99));

/** A good typed on the phone before the shelf has it. */
const ItemCreateOperation = Schema.Struct({
	tag: Schema.Literals(['item-create']),
	clientMutationId: Id,
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	category: Category,
	unit: Unit,
	quantity: StockCount,
	safetyQuantity: StockCount,
	expiresOn: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
	shelf: ShelfPlace,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** A delete waiting until the phone can reach the shelf. */
const ItemRemoveOperation = Schema.Struct({
	tag: Schema.Literals(['item-remove']),
	clientMutationId: Id,
	itemId: Id,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** One trip of existing goods and a single total, still only on the phone. */
const PurchaseTripOperation = Schema.Struct({
	tag: Schema.Literals(['purchase-trip']),
	clientMutationId: Id,
	totalCents: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000_000)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
	items: Schema.Array(
		Schema.Struct({
			itemId: Id,
			quantity: BuyCount,
		}),
	).check(Schema.isMinLength(1), Schema.isMaxLength(40)),
});

/** A quantity edit on an open trip, still only on the phone. */
const PurchaseQuantityOperation = Schema.Struct({
	tag: Schema.Literals(['purchase-quantity']),
	clientMutationId: Id,
	purchaseItemId: Id,
	quantity: BuyCount,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** Anything the phone may store while it cannot reach the server. */
export const OfflineOperation = Schema.Union([
	MovementOperation,
	PurchaseAddOperation,
	PurchaseBuyOperation,
	ItemCreateOperation,
	ItemRemoveOperation,
	PurchaseTripOperation,
	PurchaseQuantityOperation,
]);

/** A validated offline operation. */
export type OfflineOperation = typeof OfflineOperation.Type;

/** The stored list of offline operations. */
const Queue = Schema.Array(OfflineOperation);

/** A take the phone wants to append. The causal parent is filled in by the queue. */
const MovementRequest = Schema.Struct({
	clientMutationId: Id,
	itemId: Id,
	kind: Schema.Literals(['consume', 'restock']),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
	observedVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

/** A shop line the phone wants to append. */
const PurchaseAddRequest = Schema.Struct({
	clientMutationId: Id,
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(99)),
	estimatedCents: Schema.Int.check(Schema.isGreaterThan(0)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** A "bought it" check the phone wants to append. */
const PurchaseBuyRequest = Schema.Struct({
	clientMutationId: Id,
	lineClientMutationId: Id,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

/** Client ids the server has already answered. */
const IdList = Schema.Array(Id);

/** Reads a stored queue. A bad payload is a stock error, not a thrown exception. */
function decodeQueue(queue: unknown) {
	return Schema.decodeUnknownEffect(Queue)(queue).pipe(
		Effect.mapError((error) => new InvalidStock({ reason: error.message })),
	);
}

/**
 * Appends a consume or restock. The causal parent is the previous queued
 * change for the same item, so a phone that is offline still records that
 * "the second take happened after the first" before either reaches the server.
 */
export const enqueueMovement = (queue: unknown, request: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const incoming = yield* Schema.decodeUnknownEffect(MovementRequest)(request).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		if (current.some((operation) => operation.clientMutationId === incoming.clientMutationId)) {
			return current;
		}
		let parent: string | null = null;
		for (const operation of current) {
			if (operation.tag === 'movement' && operation.itemId === incoming.itemId) {
				parent = operation.clientMutationId;
			}
		}
		const next: OfflineOperation = {
			tag: 'movement',
			...incoming,
			causalParentClientId: parent,
		};
		return [...current, next];
	});

/** Appends a shopping line typed in the aisle. */
export const enqueuePurchaseAdd = (queue: unknown, request: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const incoming = yield* Schema.decodeUnknownEffect(PurchaseAddRequest)(request).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		if (current.some((operation) => operation.clientMutationId === incoming.clientMutationId)) {
			return current;
		}
		const next: OfflineOperation = { tag: 'purchase-add', ...incoming };
		return [...current, next];
	});

const ItemCreateRequest = Schema.Struct({
	clientMutationId: Id,
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	category: Category,
	unit: Unit,
	quantity: StockCount,
	safetyQuantity: StockCount,
	expiresOn: Schema.NullOr(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/))),
	shelf: ShelfPlace,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

const ItemRemoveRequest = Schema.Struct({
	clientMutationId: Id,
	itemId: Id,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

const PurchaseTripRequest = Schema.Struct({
	clientMutationId: Id,
	totalCents: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000_000)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
	items: Schema.Array(
		Schema.Struct({
			itemId: Id,
			quantity: BuyCount,
		}),
	).check(Schema.isMinLength(1), Schema.isMaxLength(40)),
});

const PurchaseQuantityRequest = Schema.Struct({
	clientMutationId: Id,
	purchaseItemId: Id,
	quantity: BuyCount,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

function append(current: readonly OfflineOperation[], next: OfflineOperation) {
	if (current.some((operation) => operation.clientMutationId === next.clientMutationId)) {
		return current;
	}
	return [...current, next];
}

/** Appends a good the phone could not place yet. */
export const enqueueItemCreate = (queue: unknown, request: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const incoming = yield* Schema.decodeUnknownEffect(ItemCreateRequest)(request).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		return append(current, { tag: 'item-create', ...incoming });
	});

/** Appends a delete the phone could not send yet. */
export const enqueueItemRemove = (queue: unknown, request: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const incoming = yield* Schema.decodeUnknownEffect(ItemRemoveRequest)(request).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		return append(current, { tag: 'item-remove', ...incoming });
	});

/** Appends one shopping trip the phone could not send yet. */
export const enqueuePurchaseTrip = (queue: unknown, request: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const incoming = yield* Schema.decodeUnknownEffect(PurchaseTripRequest)(request).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		return append(current, { tag: 'purchase-trip', ...incoming });
	});

/** Appends a quantity change the phone could not send yet. */
export const enqueuePurchaseQuantity = (queue: unknown, request: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const incoming = yield* Schema.decodeUnknownEffect(PurchaseQuantityRequest)(request).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		return append(current, { tag: 'purchase-quantity', ...incoming });
	});

/** Appends a "bought it" check. The line may itself still be only on this phone. */
export const enqueuePurchaseBuy = (queue: unknown, request: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const incoming = yield* Schema.decodeUnknownEffect(PurchaseBuyRequest)(request).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		if (current.some((operation) => operation.clientMutationId === incoming.clientMutationId)) {
			return current;
		}
		const next: OfflineOperation = { tag: 'purchase-buy', ...incoming };
		return [...current, next];
	});

/** Drops operations the server has accepted or rejected, matched by client id. */
export const dropSynced = (queue: unknown, appliedIds: unknown) =>
	Effect.gen(function* () {
		const current = yield* decodeQueue(queue);
		const ids = yield* Schema.decodeUnknownEffect(IdList)(appliedIds).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		const applied = new Set(ids);
		return current.filter((operation) => !applied.has(operation.clientMutationId));
	});
