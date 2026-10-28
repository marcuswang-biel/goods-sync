import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { InvalidStock } from './errors';
import { mergeStockLog, type MovementDraft } from './merge-stock-log';

const movement = (
	patch: Partial<MovementDraft> & Pick<MovementDraft, 'clientMutationId'>,
): MovementDraft => ({
	kind: 'consume',
	quantity: 1,
	occurredAt: 1,
	causalParentClientId: null,
	...patch,
});

describe('mergeStockLog', () => {
	it.effect('gives the last unit to the earlier timestamp, whatever the array order', () =>
		Effect.gen(function* () {
			const fold = yield* mergeStockLog({
				openingQuantity: 1,
				movements: [
					movement({ clientMutationId: 'late', occurredAt: 200 }),
					movement({ clientMutationId: 'early', occurredAt: 100 }),
				],
			});
			expect(fold.quantity).toBe(0);
			expect(fold.version).toBe(1);
			expect(fold.outcomes).toEqual([
				{
					clientMutationId: 'early',
					outcome: 'applied',
					rejectionCode: null,
					quantityAfter: 0,
				},
				{
					clientMutationId: 'late',
					outcome: 'rejected',
					rejectionCode: 'INSUFFICIENT_STOCK',
					quantityAfter: 0,
				},
			]);
		}),
	);

	it.effect('replays so an earlier consume rejects one that was already applied', () =>
		Effect.gen(function* () {
			const first = yield* mergeStockLog({
				openingQuantity: 1,
				movements: [movement({ clientMutationId: 'bob', occurredAt: 200 })],
			});
			expect(first.outcomes[0]?.outcome).toBe('applied');

			const replay = yield* mergeStockLog({
				openingQuantity: 1,
				movements: [
					movement({ clientMutationId: 'bob', occurredAt: 200 }),
					movement({ clientMutationId: 'alice', occurredAt: 100 }),
				],
			});
			expect(replay.quantity).toBe(0);
			expect(replay.outcomes.map((outcome) => [outcome.clientMutationId, outcome.outcome])).toEqual(
				[
					['alice', 'applied'],
					['bob', 'rejected'],
				],
			);
		}),
	);

	it.effect('places a causal child after its parent even when the child timestamp is earlier', () =>
		Effect.gen(function* () {
			const fold = yield* mergeStockLog({
				openingQuantity: 1,
				movements: [
					movement({ clientMutationId: 'second', occurredAt: 50, causalParentClientId: 'first' }),
					movement({ clientMutationId: 'first', occurredAt: 300 }),
				],
			});
			expect(fold.outcomes.map((outcome) => outcome.clientMutationId)).toEqual(['first', 'second']);
			expect(fold.outcomes[1]?.rejectionCode).toBe('INSUFFICIENT_STOCK');
		}),
	);

	it.effect('applies a restock before a later consume', () =>
		Effect.gen(function* () {
			const fold = yield* mergeStockLog({
				openingQuantity: 0,
				movements: [
					movement({ clientMutationId: 'take', kind: 'consume', occurredAt: 200 }),
					movement({ clientMutationId: 'buy', kind: 'restock', quantity: 2, occurredAt: 100 }),
				],
			});
			expect(fold.quantity).toBe(1);
			expect(fold.version).toBe(2);
			expect(fold.outcomes.every((outcome) => outcome.outcome === 'applied')).toBe(true);
		}),
	);

	it.effect('rejects a causal cycle without changing the quantity', () =>
		Effect.gen(function* () {
			const fold = yield* mergeStockLog({
				openingQuantity: 3,
				movements: [
					movement({ clientMutationId: 'a', causalParentClientId: 'b' }),
					movement({ clientMutationId: 'b', causalParentClientId: 'a' }),
				],
			});
			expect(fold.quantity).toBe(3);
			expect(fold.version).toBe(0);
			expect(fold.outcomes.map((outcome) => outcome.rejectionCode)).toEqual([
				'CAUSAL_CYCLE',
				'CAUSAL_CYCLE',
			]);
		}),
	);

	it.effect('fails when the same client id appears twice', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				mergeStockLog({
					openingQuantity: 1,
					movements: [
						movement({ clientMutationId: 'same' }),
						movement({ clientMutationId: 'same' }),
					],
				}),
			);
			expect(error).toBeInstanceOf(InvalidStock);
		}),
	);
});
