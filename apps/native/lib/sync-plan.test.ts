import type { OfflineOperation } from '@goods/domain/offline';

import { describe, expect, it } from 'vitest';

import {
	buyBatch,
	flushNote,
	flushSteps,
	idsToClear,
	lastQueuedMovement,
	movementBatches,
} from './sync-plan';

const queue: OfflineOperation[] = [
	{
		tag: 'movement',
		clientMutationId: 'take-1',
		itemId: 'milk',
		kind: 'consume',
		quantity: 1,
		occurredAt: 10,
		observedVersion: 2,
		causalParentClientId: null,
	},
	{
		tag: 'movement',
		clientMutationId: 'take-2',
		itemId: 'milk',
		kind: 'consume',
		quantity: 1,
		occurredAt: 20,
		observedVersion: 2,
		causalParentClientId: 'take-1',
	},
	{
		tag: 'purchase-buy',
		clientMutationId: 'buy-1',
		lineClientMutationId: 'trip-1',
		occurredAt: 30,
	},
	{
		tag: 'purchase-add',
		clientMutationId: 'add-1',
		name: '醬油',
		quantity: 1,
		estimatedCents: 1_800,
		occurredAt: 5,
	},
];

describe('buyBatch', () => {
	it('sends only the checks, pointed at the trip id', () => {
		expect(buyBatch(queue)).toEqual([
			{
				tag: 'buy',
				clientMutationId: 'buy-1',
				purchaseClientMutationId: 'trip-1',
				occurredAt: 30,
			},
		]);
	});
});

describe('movementBatches', () => {
	it('keeps two takes of the same good in one batch, parent first', () => {
		expect(movementBatches(queue)).toEqual([
			{
				itemId: 'milk',
				ops: [
					{
						clientMutationId: 'take-1',
						kind: 'consume',
						quantity: 1,
						occurredAt: 10,
						causalParentClientId: null,
						observedVersion: 2,
					},
					{
						clientMutationId: 'take-2',
						kind: 'consume',
						quantity: 1,
						occurredAt: 20,
						causalParentClientId: 'take-1',
						observedVersion: 2,
					},
				],
			},
		]);
	});
});

describe('idsToClear', () => {
	it('drops applied and duplicate ids and keeps a rejection', () => {
		expect(
			idsToClear([
				{ clientMutationId: 'take-1', outcome: 'applied' },
				{ clientMutationId: 'take-2', outcome: 'rejected' },
				{ clientMutationId: 'buy-1', outcome: 'duplicate' },
			]),
		).toEqual(['take-1', 'buy-1']);
	});
});

describe('lastQueuedMovement', () => {
	it('points at the latest queued take of that good', () => {
		expect(lastQueuedMovement(queue, 'milk')).toBe('take-2');
		expect(lastQueuedMovement(queue, 'paper')).toBeNull();
	});
});

describe('flushSteps', () => {
	it('places goods before takes, and takes before deletes and purchases', () => {
		const steps = flushSteps([
			...queue,
			{
				tag: 'item-create',
				clientMutationId: 'create-1',
				name: '優格',
				category: 'dairy',
				unit: 'carton',
				quantity: 1,
				safetyQuantity: 1,
				expiresOn: null,
				shelf: 'fridge',
				occurredAt: 1,
			},
			{
				tag: 'item-remove',
				clientMutationId: 'remove-1',
				itemId: 'milk',
				occurredAt: 40,
			},
			{
				tag: 'purchase-trip',
				clientMutationId: 'trip-1',
				totalCents: 500,
				occurredAt: 41,
				items: [{ itemId: 'milk', quantity: 1 }],
			},
			{
				tag: 'purchase-quantity',
				clientMutationId: 'qty-1',
				purchaseItemId: 'line-1',
				quantity: 4,
				occurredAt: 42,
			},
		]);
		expect(steps.map((step) => step.tag)).toEqual([
			'item-create',
			'movements',
			'item-remove',
			'purchase-trip',
			'purchase-quantity',
			'purchase-buy',
		]);
	});
});

describe('flushNote', () => {
	it('says the queue is clear, or what is still on the phone', () => {
		expect(flushNote([], 2)).toBe('已合併。');
		expect(flushNote([{ tag: 'purchase-add' }], 0)).toBe('這些離線採購還不能送到貨架。');
		expect(flushNote([{ tag: 'movement' }], 1)).toBe('已合併。還有 1 筆留在手機上。');
	});
});
