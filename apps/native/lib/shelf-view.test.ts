import { describe, expect, it } from 'vitest';

import {
	filterByName,
	groupByShelf,
	parseExpiry,
	parseStockCount,
	shelfEmptyMessage,
	todayIso,
} from './shelf-view';

describe('todayIso', () => {
	it('reads the UTC day', () => {
		expect(todayIso(new Date('2026-10-28T16:00:00.000Z'))).toBe('2026-10-28');
	});
});

describe('filterByName', () => {
	const items = [{ name: '咖啡豆' }, { name: '牛奶' }];

	it('keeps every good when the query is blank', () => {
		expect(filterByName(items, '  ')).toEqual(items);
	});

	it('matches part of the name without caring about case', () => {
		expect(filterByName([{ name: 'Coffee' }, { name: '牛奶' }], 'cof')).toEqual([
			{ name: 'Coffee' },
		]);
	});
});

describe('shelfEmptyMessage', () => {
	it('distinguishes an empty shelf from a search miss', () => {
		expect(shelfEmptyMessage('')).toBe('還沒有物資。');
		expect(shelfEmptyMessage('zzz')).toBe('沒有符合的物資。');
	});
});

describe('parseStockCount', () => {
	it('accepts 0 through 999', () => {
		expect(parseStockCount('0')).toBe(0);
		expect(parseStockCount('999')).toBe(999);
		expect(parseStockCount('1.5')).toBeNull();
		expect(parseStockCount('1000')).toBeNull();
	});
});

describe('parseExpiry', () => {
	it('allows a blank date and rejects a day that does not exist', () => {
		expect(parseExpiry('')).toEqual({ ok: true, value: null });
		expect(parseExpiry('2026-12-01')).toEqual({ ok: true, value: '2026-12-01' });
		expect(parseExpiry('2026-02-31')).toEqual({ ok: false });
	});
});

describe('groupByShelf', () => {
	it('keeps the first location a good was seen in', () => {
		const groups = groupByShelf([
			{ name: '牛奶', shelf: 'fridge' as const },
			{ name: '咖啡', shelf: 'tearoom' as const },
			{ name: '優格', shelf: 'fridge' as const },
		]);
		expect(groups.map((group) => group.title)).toEqual(['冰箱', '茶水間層架']);
		expect(groups[0]?.items.map((item) => item.name)).toEqual(['牛奶', '優格']);
	});
});
