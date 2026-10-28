import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit } from 'effect';

import { draftShelfItem } from './shelf-item';

describe('shelf item', () => {
	it.effect('trims the name and keeps a real expiry', () =>
		Effect.gen(function* () {
			const draft = yield* draftShelfItem({
				name: '  梳打餅  ',
				category: 'snack',
				unit: 'slab',
				quantity: 2,
				safetyQuantity: 1,
				expiresOn: '2026-12-01',
				shelf: 'cupboard',
			});
			expect(draft.name).toBe('梳打餅');
			expect(draft.unit).toBe('slab');
		}),
	);

	it.effect('rejects a calendar day that does not exist', () =>
		Effect.gen(function* () {
			const exit = yield* Effect.exit(
				draftShelfItem({
					name: '牛奶',
					category: 'dairy',
					unit: 'carton',
					quantity: 1,
					safetyQuantity: 1,
					expiresOn: '2026-02-31',
					shelf: 'fridge',
				}),
			);
			expect(Exit.isFailure(exit)).toBe(true);
			if (Exit.isFailure(exit)) {
				expect(exit.cause.toString()).toContain('InvalidStock');
			}
		}),
	);
});
