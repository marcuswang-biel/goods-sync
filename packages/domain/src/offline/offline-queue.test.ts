import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import {
	dropSynced,
	enqueueItemCreate,
	enqueueItemRemove,
	enqueueMovement,
	enqueuePurchaseAdd,
	enqueuePurchaseBuy,
	enqueuePurchaseQuantity,
	enqueuePurchaseTrip,
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

	it.effect('keeps a shelf edit until its id is cleared', () =>
		Effect.gen(function* () {
			const created = yield* enqueueItemCreate([], {
				clientMutationId: 'new-milk',
				name: '牛奶',
				category: 'dairy',
				unit: 'carton',
				quantity: 2,
				safetyQuantity: 1,
				expiresOn: null,
				shelf: 'fridge',
				occurredAt: 10,
			});
			const removed = yield* enqueueItemRemove(created, {
				clientMutationId: 'drop-milk',
				itemId: 'milk',
				occurredAt: 11,
			});
			const trip = yield* enqueuePurchaseTrip(removed, {
				clientMutationId: 'trip',
				totalCents: 1_800,
				occurredAt: 12,
				items: [{ itemId: 'milk', quantity: 2 }],
			});
			const quantity = yield* enqueuePurchaseQuantity(trip, {
				clientMutationId: 'qty',
				purchaseItemId: 'line',
				quantity: 3,
				occurredAt: 13,
			});
			const again = yield* enqueueItemCreate(quantity, {
				clientMutationId: 'new-milk',
				name: '牛奶',
				category: 'dairy',
				unit: 'carton',
				quantity: 2,
				safetyQuantity: 1,
				expiresOn: null,
				shelf: 'fridge',
				occurredAt: 14,
			});
			expect(again.map((operation) => operation.tag)).toEqual([
				'item-create',
				'item-remove',
				'purchase-trip',
				'purchase-quantity',
			]);
			const remaining = yield* dropSynced(again, ['new-milk', 'qty']);
			expect(remaining.map((operation) => operation.tag)).toEqual(['item-remove', 'purchase-trip']);
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
