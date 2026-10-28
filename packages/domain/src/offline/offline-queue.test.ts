import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import {
	dropSynced,
	enqueueMovement,
	enqueuePurchaseAdd,
	enqueuePurchaseBuy,
} from './offline-queue';

describe('offline queue', () => {
	it.effect('chains a second take of the same item behind the first', () =>
		Effect.gen(function* () {
			const first = yield* enqueueMovement([], {
				clientMutationId: 'a',
				itemId: 'milk',
				kind: 'consume',
				quantity: 1,
				occurredAt: 10,
				observedVersion: 4,
			});
			const second = yield* enqueueMovement(first, {
				clientMutationId: 'b',
				itemId: 'milk',
				kind: 'consume',
				quantity: 1,
				occurredAt: 20,
				observedVersion: 4,
			});
			expect(second[1]).toMatchObject({
				tag: 'movement',
				clientMutationId: 'b',
				causalParentClientId: 'a',
			});
		}),
	);

	it.effect('keeps a purchase add and its check, then drops both once they sync', () =>
		Effect.gen(function* () {
			const added = yield* enqueuePurchaseAdd([], {
				clientMutationId: 'line',
				name: '醬油',
				quantity: 1,
				estimatedCents: 1_800,
				occurredAt: 10,
			});
			const bought = yield* enqueuePurchaseBuy(added, {
				clientMutationId: 'buy',
				lineClientMutationId: 'line',
				occurredAt: 20,
			});
			const remaining = yield* dropSynced(bought, ['line', 'buy']);
			expect(remaining).toEqual([]);
		}),
	);
});
