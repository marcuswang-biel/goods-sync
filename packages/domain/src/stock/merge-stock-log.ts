import { Effect, Schema } from 'effect';

import { InvalidStock } from './errors';

/**
 * One offline or online stock change. Order is not the array order: the fold
 * places a movement after its causal parent, and otherwise by `occurredAt`.
 * Two people who each took the last carton while offline therefore keep the
 * earlier timestamp, even if the later one reaches the server first.
 */
export const MovementDraft = Schema.Struct({
	clientMutationId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	kind: Schema.Literals(['consume', 'restock']),
	quantity: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10_000)),
	occurredAt: Schema.Int.check(Schema.isGreaterThan(0)),
	causalParentClientId: Schema.NullOr(
		Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
	),
});

export type MovementDraft = typeof MovementDraft.Type;

export type RejectionCode = 'INSUFFICIENT_STOCK' | 'CAUSAL_CYCLE';

export type StockOutcome = {
	readonly clientMutationId: string;
	readonly outcome: 'applied' | 'rejected';
	readonly rejectionCode: RejectionCode | null;
	readonly quantityAfter: number;
};

export type StockFold = {
	readonly quantity: number;
	readonly version: number;
	readonly outcomes: readonly StockOutcome[];
};

const LogInput = Schema.Struct({
	openingQuantity: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
	movements: Schema.Array(MovementDraft),
});

function compareMovement(left: MovementDraft, right: MovementDraft): number {
	if (left.occurredAt !== right.occurredAt) return left.occurredAt - right.occurredAt;
	if (left.clientMutationId < right.clientMutationId) return -1;
	if (left.clientMutationId > right.clientMutationId) return 1;
	return 0;
}

function fold(openingQuantity: number, movements: readonly MovementDraft[]): StockFold {
	const byId = new Map(movements.map((movement) => [movement.clientMutationId, movement]));
	const remaining = new Set(byId.keys());
	const outcomes: StockOutcome[] = [];
	let quantity = openingQuantity;
	let version = 0;

	while (remaining.size > 0) {
		const ready: MovementDraft[] = [];
		for (const id of remaining) {
			const movement = byId.get(id);
			if (movement === undefined) continue;
			const parent = movement.causalParentClientId;
			if (parent === null || !remaining.has(parent)) ready.push(movement);
		}

		if (ready.length === 0) {
			const stuck: MovementDraft[] = [];
			for (const id of remaining) {
				const movement = byId.get(id);
				if (movement !== undefined) stuck.push(movement);
			}
			stuck.sort(compareMovement);
			for (const movement of stuck) {
				outcomes.push({
					clientMutationId: movement.clientMutationId,
					outcome: 'rejected',
					rejectionCode: 'CAUSAL_CYCLE',
					quantityAfter: quantity,
				});
			}
			break;
		}

		ready.sort(compareMovement);
		const next = ready[0];
		if (next === undefined) break;
		remaining.delete(next.clientMutationId);

		if (next.kind === 'consume' && quantity < next.quantity) {
			outcomes.push({
				clientMutationId: next.clientMutationId,
				outcome: 'rejected',
				rejectionCode: 'INSUFFICIENT_STOCK',
				quantityAfter: quantity,
			});
			continue;
		}

		quantity = next.kind === 'restock' ? quantity + next.quantity : quantity - next.quantity;
		version += 1;
		outcomes.push({
			clientMutationId: next.clientMutationId,
			outcome: 'applied',
			rejectionCode: null,
			quantityAfter: quantity,
		});
	}

	return { quantity, version, outcomes };
}

/**
 * Replays the whole log from the item's opening quantity.
 *
 * Callers pass every movement already stored plus the ones just synced.
 * Replaying (instead of appending onto the cached quantity) is what lets an
 * earlier offline consume win after a later one has already been applied.
 */
export const mergeStockLog = (input: unknown) =>
	Effect.gen(function* () {
		const decoded = yield* Schema.decodeUnknownEffect(LogInput)(input).pipe(
			Effect.mapError((error) => new InvalidStock({ reason: error.message })),
		);
		const ids = decoded.movements.map((movement) => movement.clientMutationId);
		if (new Set(ids).size !== ids.length) {
			return yield* new InvalidStock({ reason: 'Duplicate client mutation id.' });
		}
		return fold(decoded.openingQuantity, decoded.movements);
	});
