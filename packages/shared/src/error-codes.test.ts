import { describe, expect, it } from 'vitest';

import { APP_ERROR_CODES, isAppErrorCode } from './error-codes';

describe('isAppErrorCode', () => {
	it('accepts the codes this app throws and rejects anything else', () => {
		expect(isAppErrorCode(APP_ERROR_CODES.notFound)).toBe(true);
		expect(isAppErrorCode(APP_ERROR_CODES.stockInvalid)).toBe(true);
		expect(isAppErrorCode(APP_ERROR_CODES.purchaseInvalid)).toBe(true);
		expect(isAppErrorCode('NOPE')).toBe(false);
		expect(isAppErrorCode(null)).toBe(false);
	});
});
