import { describe, expect, it } from 'vitest';

import { rejectionMessage, takeNote, appFailureText } from './messages';

describe('rejectionMessage', () => {
	it('names the known refusals and falls back otherwise', () => {
		expect(rejectionMessage('INSUFFICIENT_STOCK')).toBe('當時已經沒有這麼多了。');
		expect(rejectionMessage('NOT_FOUND')).toBe('找不到這一筆。');
		expect(rejectionMessage(null)).toBe('操作失敗，請再試一次。');
	});
});

describe('appFailureText', () => {
	it('reads the code off the thrown data', () => {
		expect(appFailureText({ data: { code: 'NOT_FOUND', message: 'Gone' } })).toBe('找不到這一筆。');
		expect(appFailureText(new Error('network'))).toBe('操作失敗，請再試一次。');
	});
});

describe('takeNote', () => {
	it('says the take landed, or why it did not', () => {
		expect(takeNote([{ outcome: 'applied', rejectionCode: null }])).toBe('已領用。');
		expect(takeNote([{ outcome: 'rejected', rejectionCode: 'INSUFFICIENT_STOCK' }])).toBe(
			'當時已經沒有這麼多了。',
		);
	});
});
