import { describe, expect, it } from 'vitest';

import { CATEGORY_LABELS, SHELF_LABELS, UNIT_LABELS } from './labels';

describe('labels', () => {
	it('gives every stored code a Chinese label', () => {
		for (const label of [
			...Object.values(UNIT_LABELS),
			...Object.values(SHELF_LABELS),
			...Object.values(CATEGORY_LABELS),
		]) {
			expect(label.trim().length).toBeGreaterThan(0);
		}
		expect(UNIT_LABELS.bag).toBe('包');
		expect(SHELF_LABELS.fridge).toBe('冰箱');
		expect(CATEGORY_LABELS.coffee).toBe('咖啡');
	});
});
