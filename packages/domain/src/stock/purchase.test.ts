import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { BudgetExceeded } from './errors';
import { chargeDepartmentBudget, draftPurchase, quoteEqualSplit, unitsToRestock } from './purchase';

describe('purchase rules', () => {
	it('buys the gap under the safety line, and one when stock is sitting on it', () => {
		expect(unitsToRestock(1, 2)).toBe(1);
		expect(unitsToRestock(0, 1)).toBe(1);
		expect(unitsToRestock(2, 2)).toBe(1);
		expect(unitsToRestock(6, 2)).toBe(0);
	});

	it.effect('splits 4800 cents across two people with nothing left over', () =>
		Effect.gen(function* () {
			const quote = yield* quoteEqualSplit({ totalCents: 4_800, memberCount: 2 });
			expect(quote).toEqual({ perPersonCents: 2_400, remainderCents: 0 });
			expect(quote.perPersonCents * 2 + quote.remainderCents).toBe(4_800);
		}),
	);

	it.effect('puts the leftover cents on the remainder', () =>
		Effect.gen(function* () {
			const quote = yield* quoteEqualSplit({ totalCents: 100, memberCount: 3 });
			expect(quote).toEqual({ perPersonCents: 33, remainderCents: 1 });
			expect(quote.perPersonCents * 3 + quote.remainderCents).toBe(100);
		}),
	);

	it.effect('trims a purchase name', () =>
		Effect.gen(function* () {
			const draft = yield* draftPurchase({
				name: '  咖啡豆  ',
				quantity: 2,
				estimatedCents: 12_400,
			});
			expect(draft.name).toBe('咖啡豆');
		}),
	);

	it.effect('charges the department budget', () =>
		Effect.gen(function* () {
			const charge = yield* chargeDepartmentBudget({
				remainingCents: 80_000,
				chargeCents: 12_400,
			});
			expect(charge.remainingCents).toBe(67_600);
		}),
	);

	it.effect('refuses a charge the budget cannot cover', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				chargeDepartmentBudget({ remainingCents: 100, chargeCents: 200 }),
			);
			expect(error).toBeInstanceOf(BudgetExceeded);
			expect(error).toMatchObject({ remainingCents: 100, chargeCents: 200 });
		}),
	);
});
