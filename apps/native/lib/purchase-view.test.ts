import { describe, expect, it } from 'vitest';

import { parseBuy, shortfallRows } from './purchase-view';

describe('parseBuy', () => {
	it('allows 0 on a draft and requires at least 1 on a saved line', () => {
		expect(parseBuy('0', 0)).toBe(0);
		expect(parseBuy('0', 1)).toBeNull();
		expect(parseBuy('99')).toBe(99);
		expect(parseBuy('100')).toBeNull();
		expect(parseBuy('1.5')).toBeNull();
	});
});

describe('shortfallRows', () => {
	it('suggests a buy for a short good and marks one already on an open trip', () => {
		const rows = shortfallRows(
			[
				{ id: 'milk', name: '牛奶', unit: 'carton', quantity: 1, safetyQuantity: 3 },
				{ id: 'coffee', name: '咖啡豆', unit: 'bag', quantity: 8, safetyQuantity: 2 },
				{ id: 'paper', name: '紙', unit: 'ream', quantity: 0, safetyQuantity: 1 },
			],
			['milk'],
		);
		expect(rows.map((row) => row.id)).toEqual(['milk', 'paper']);
		expect(rows[0]).toMatchObject({ buy: 2, listed: true });
		expect(rows[1]).toMatchObject({ buy: 1, listed: false });
	});
});
