import { describe, expect, it } from 'vitest';

import { clientId } from './ids';

describe('clientId', () => {
	it('keeps the prefix and stays inside the queue id limit', () => {
		const id = clientId('take');
		expect(id.startsWith('take-')).toBe(true);
		expect(id.length).toBeLessThanOrEqual(80);
	});
});
