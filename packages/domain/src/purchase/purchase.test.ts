import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { draftPurchaseBasket, draftPurchaseQuantity, unitsToRestock } from './purchase';

describe('purchase rules', () => {
	it('buys the gap under the safety line, and one when stock is sitting on it', () => {
		expect(unitsToRestock(1, 2)).toBe(1);
		expect(unitsToRestock(0, 1)).toBe(1);
		expect(unitsToRestock(2, 2)).toBe(1);
		expect(unitsToRestock(6, 2)).toBe(0);
	});

	it.effect('accepts one total for several goods', () =>
		Effect.gen(function* () {
			const draft = yield* draftPurchaseBasket({
				totalCents: 6_600,
				items: [
					{ itemId: 'milk', quantity: 2 },
					{ itemId: 'soy', quantity: 1 },
				],
			});
			expect(draft.totalCents).toBe(6_600);
			expect(draft.items).toHaveLength(2);
		}),
	);

	it.effect('accepts a changed buy from 1 to 99', () =>
		Effect.gen(function* () {
			expect(yield* draftPurchaseQuantity(3)).toBe(3);
			const zero = yield* Effect.flip(draftPurchaseQuantity(0));
			const fraction = yield* Effect.flip(draftPurchaseQuantity(1.5));
			expect(zero._tag).toBe('InvalidPurchase');
			expect(fraction._tag).toBe('InvalidPurchase');
		}),
	);

	it.effect('accepts 99 and rejects 100', () =>
		Effect.gen(function* () {
			expect(yield* draftPurchaseQuantity(99)).toBe(99);
			const over = yield* Effect.flip(draftPurchaseQuantity(100));
			expect(over._tag).toBe('InvalidPurchase');
		}),
	);

	it.effect('rejects an empty trip and a zero total', () =>
		Effect.gen(function* () {
			const empty = yield* Effect.flip(draftPurchaseBasket({ totalCents: 100, items: [] }));
			const free = yield* Effect.flip(
				draftPurchaseBasket({
					totalCents: 0,
					items: [{ itemId: 'milk', quantity: 1 }],
				}),
			);
			expect(empty._tag).toBe('InvalidPurchase');
			expect(free._tag).toBe('InvalidPurchase');
		}),
	);

	it.effect('rejects a basket that lists the same good twice', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				draftPurchaseBasket({
					totalCents: 100,
					items: [
						{ itemId: 'milk', quantity: 1 },
						{ itemId: 'milk', quantity: 2 },
					],
				}),
			);
			expect(error._tag).toBe('InvalidPurchase');
		}),
	);
});
