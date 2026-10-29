import { describe, expect, it } from 'vitest';

import { dollarsToCents, formatCents } from './money';

describe('formatCents', () => {
	it('groups dollars and keeps two cents', () => {
		expect(formatCents(2_400)).toBe('HK$24.00');
		expect(formatCents(100_000)).toBe('HK$1,000.00');
		expect(formatCents(50)).toBe('HK$0.50');
		expect(formatCents(-50)).toBe('-HK$0.50');
	});
});

describe('dollarsToCents', () => {
	it('accepts a positive amount with at most two decimals', () => {
		expect(dollarsToCents('12.5')).toBe(1_250);
		expect(dollarsToCents(' 18 ')).toBe(1_800);
		expect(dollarsToCents('0')).toBeNull();
		expect(dollarsToCents('')).toBeNull();
		expect(dollarsToCents('12.345')).toBeNull();
		expect(dollarsToCents('100000.01')).toBeNull();
	});
});
