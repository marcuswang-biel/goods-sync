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

/** Anything the phone may store while it cannot reach the server. */
export const OfflineOperation = Schema.Union([
	MovementOperation,
	PurchaseAddOperation,
	PurchaseBuyOperation,
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
