import { describe, expect, it } from '@effect/vitest';

import { addIsoDays, isRealIsoDate } from './calendar';

describe('isRealIsoDate', () => {
	it('accepts a real day and rejects a day the month does not have', () => {
		expect(isRealIsoDate('2026-02-28')).toBe(true);
		expect(isRealIsoDate('2024-02-29')).toBe(true);
		expect(isRealIsoDate('2026-02-29')).toBe(false);
		expect(isRealIsoDate('2026-02-31')).toBe(false);
		expect(isRealIsoDate('2026-13-01')).toBe(false);
		expect(isRealIsoDate('28-02-2026')).toBe(false);
	});
});

describe('addIsoDays', () => {
	it('crosses a month and a year', () => {
		expect(addIsoDays('2026-10-28', 3)).toBe('2026-10-31');
		expect(addIsoDays('2026-10-30', 3)).toBe('2026-11-02');
		expect(addIsoDays('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('leaves a string that is not a date unchanged', () => {
		expect(addIsoDays('tomorrow', 1)).toBe('tomorrow');
	});
});
