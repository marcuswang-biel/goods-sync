import { Effect, Schema } from 'effect';

import { InvalidStock } from './errors';

const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80));

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

const PurchaseAddOperation = Schema.Struct({
	tag: Schema.Literals(['purchase-add']),
	clientMutationId: Id,
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(99)),
	estimatedCents: Schema.Int.check(Schema.isGreaterThan(0)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

const PurchaseBuyOperation = Schema.Struct({
	tag: Schema.Literals(['purchase-buy']),
	clientMutationId: Id,
	lineClientMutationId: Id,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

export const OfflineOperation = Schema.Union([
	MovementOperation,
	PurchaseAddOperation,
	PurchaseBuyOperation,
]);

export type OfflineOperation = typeof OfflineOperation.Type;

const Queue = Schema.Array(OfflineOperation);

const MovementRequest = Schema.Struct({
	clientMutationId: Id,
	itemId: Id,
	kind: Schema.Literals(['consume', 'restock']),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
	observedVersion: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});

const PurchaseAddRequest = Schema.Struct({
	clientMutationId: Id,
	name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(99)),
	estimatedCents: Schema.Int.check(Schema.isGreaterThan(0)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

const PurchaseBuyRequest = Schema.Struct({
	clientMutationId: Id,
	lineClientMutationId: Id,
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
});

const IdList = Schema.Array(Id);

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
