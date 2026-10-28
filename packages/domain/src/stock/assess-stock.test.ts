import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';

import { assessStock, compareUrgency, isAttention, type ShelfRow } from './assess-stock';
import { InvalidStock } from './errors';
import { stockPolicyLayer } from './stock-policy';

const policy = stockPolicyLayer({ soonDays: 3 });

const row = (patch: Partial<ShelfRow> & Pick<ShelfRow, 'name'>): ShelfRow => ({
	quantity: 1,
	freshness: 'ok',
	supply: 'ok',
	expiresOn: null,
	...patch,
});

describe('assessStock', () => {
	it.effect('marks a date inside the window as soon and a short shelf as low', () =>
		Effect.gen(function* () {
			const assessment = yield* assessStock({
				quantity: 1,
				safetyQuantity: 2,
				expiresOn: '2026-10-31',
				today: '2026-10-28',
			});
			expect(assessment).toEqual({ freshness: 'soon', supply: 'low', shortfall: 1 });
		}).pipe(Effect.provide(policy)),
	);

	it.effect('treats today as soon and the day after the window as ok', () =>
		Effect.gen(function* () {
			const today = yield* assessStock({
				quantity: 4,
				safetyQuantity: 1,
				expiresOn: '2026-10-28',
				today: '2026-10-28',
			});
			const later = yield* assessStock({
				quantity: 4,
				safetyQuantity: 1,
				expiresOn: '2026-11-01',
				today: '2026-10-28',
			});
			expect(today.freshness).toBe('soon');
			expect(later.freshness).toBe('ok');
			expect(later.shortfall).toBe(0);
		}).pipe(Effect.provide(policy)),
	);

	it.effect('marks a past date expired and a zero quantity out', () =>
		Effect.gen(function* () {
			const assessment = yield* assessStock({
				quantity: 0,
				safetyQuantity: 1,
				expiresOn: '2026-10-27',
				today: '2026-10-28',
			});
			expect(assessment).toEqual({ freshness: 'expired', supply: 'out', shortfall: 1 });
		}).pipe(Effect.provide(policy)),
	);

	it.effect('leaves an undated item undated', () =>
		Effect.gen(function* () {
			const assessment = yield* assessStock({
				quantity: 8,
				safetyQuantity: 4,
				expiresOn: null,
				today: '2026-10-28',
			});
			expect(assessment.freshness).toBe('undated');
			expect(assessment.supply).toBe('ok');
		}).pipe(Effect.provide(policy)),
	);

	it.effect('fails on a calendar day that does not exist', () =>
		Effect.gen(function* () {
			const error = yield* Effect.flip(
				assessStock({
					quantity: 1,
					safetyQuantity: 1,
					expiresOn: '2026-02-31',
					today: '2026-10-28',
				}),
			);
			expect(error).toBeInstanceOf(InvalidStock);
		}).pipe(Effect.provide(policy)),
	);
});

describe('compareUrgency', () => {
	it('puts an empty shelf ahead of a merely short one', () => {
		const empty = row({ name: '醬油', supply: 'out', quantity: 0 });
		const short = row({ name: '牛奶', supply: 'low', freshness: 'soon', expiresOn: '2026-10-29' });
		expect(isAttention(empty)).toBe(true);
		expect(compareUrgency(empty, short)).toBeLessThan(0);
		expect(isAttention(row({ name: '衛生紙' }))).toBe(false);
	});
});
