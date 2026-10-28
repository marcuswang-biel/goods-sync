// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexErrorCode } from '@goods/shared/convex-error';
import { APP_ERROR_CODES } from '@goods/shared/error-codes';
import { describe, expect, it } from 'vitest';

import { convexTest, signIn } from '../../test/harness';
import { api } from '../_generated/api';
import schema from '../schema';

const modules = import.meta.glob(['../**/*.ts', '../**/*.js', '!../**/*.d.ts', '!../**/*.test.ts']);

async function codeOf(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return convexErrorCode(error);
	}
	throw new Error('expected the call to fail');
}

const today = '2026-10-28';

async function shelf(
	t: ReturnType<typeof convexTest>,
	ownerId: string,
	roommateId: string,
	kind: 'household' | 'office',
) {
	return await t.run(async (ctx) => {
		const spaceId = await ctx.db.insert('spaces', {
			name: kind === 'office' ? '公司茶水間' : '我的合租房',
			kind,
			createdBy: ownerId,
			budgetCents: kind === 'office' ? 80_000 : null,
			createdAt: Date.now(),
		});
		await ctx.db.insert('memberships', {
			spaceId,
			userId: ownerId,
			role: 'admin',
			label: '凱',
		});
		if (roommateId !== ownerId) {
			await ctx.db.insert('memberships', {
				spaceId,
				userId: roommateId,
				role: 'member',
				label: '阿澄',
			});
		}
		const itemId = await ctx.db.insert('items', {
			spaceId,
			name: '咖啡豆',
			category: 'coffee',
			unit: 'bag',
			openingQuantity: 1,
			quantity: 1,
			safetyQuantity: 2,
			expiresOn: '2026-11-18',
			shelf: 'tearoom',
			version: 0,
			createdBy: ownerId,
		});
		return { spaceId, itemId };
	});
}

describe('stock', () => {
	it('rejects anonymous callers', async () => {
		const t = convexTest(schema, modules);
		expect(await codeOf(t.query(api.spaces.listMine, {}))).toBe(APP_ERROR_CODES.unauthenticated);
	});

	it('hides a space from someone who is not a member', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const bob = await signIn(t, 'bob@example.com');
		const { spaceId } = await shelf(t, alice.userId, alice.userId, 'household');

		expect(await codeOf(bob.as.query(api.stock.board, { spaceId, today }))).toBe(
			APP_ERROR_CODES.notFound,
		);
		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items[0]).toMatchObject({
			name: '咖啡豆',
			quantity: 1,
			supply: 'low',
			shortfall: 1,
		});
	});

	it('lets the earlier offline consume keep the last bag', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const bob = await signIn(t, 'bob@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, bob.userId, 'office');

		const bobSync = await bob.as.mutation(api.stock.sync, {
			spaceId,
			itemId,
			ops: [
				{
					clientMutationId: 'bob-take',
					kind: 'consume',
					quantity: 1,
					occurredAt: 200,
					causalParentClientId: null,
					observedVersion: 0,
				},
			],
		});
		expect(bobSync).toMatchObject({
			quantity: 0,
			results: [{ clientMutationId: 'bob-take', outcome: 'applied', rejectionCode: null }],
		});

		const aliceSync = await alice.as.mutation(api.stock.sync, {
			spaceId,
			itemId,
			ops: [
				{
					clientMutationId: 'alice-take',
					kind: 'consume',
					quantity: 1,
					occurredAt: 100,
					causalParentClientId: null,
					observedVersion: 0,
				},
			],
		});
		expect(aliceSync.quantity).toBe(0);
		expect(aliceSync.results).toEqual([
			{ clientMutationId: 'alice-take', outcome: 'applied', rejectionCode: null },
		]);

		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items[0]?.quantity).toBe(0);
		expect(board.movements.map((movement) => [movement.actorLabel, movement.outcome])).toEqual([
			['阿澄', 'rejected'],
			['凱', 'applied'],
		]);
	});
});

describe('shelf', () => {
	it('places a new good with its unit, safety line, and expiry', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId } = await shelf(t, alice.userId, alice.userId, 'household');

		await alice.as.mutation(api.stock.create, {
			spaceId,
			name: '  梳打餅  ',
			category: 'snack',
			unit: 'slab',
			quantity: 2,
			safetyQuantity: 1,
			expiresOn: '2026-12-01',
			shelf: 'cupboard',
		});

		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items.find((item) => item.name === '梳打餅')).toMatchObject({
			unit: 'slab',
			quantity: 2,
			safetyQuantity: 1,
			expiresOn: '2026-12-01',
			category: 'snack',
		});

		expect(
			await codeOf(
				alice.as.mutation(api.stock.create, {
					spaceId,
					name: '過期日期',
					category: 'dairy',
					unit: 'carton',
					quantity: 1,
					safetyQuantity: 1,
					expiresOn: '2026-02-31',
					shelf: 'fridge',
				}),
			),
		).toBe(APP_ERROR_CODES.stockInvalid);
	});
});

describe('purchases', () => {
	it('splits a household line and restocks the linked item', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const bob = await signIn(t, 'bob@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, bob.userId, 'household');

		const added = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'line-milk',
					name: '  全脂牛奶  ',
					quantity: 2,
					estimatedCents: 4_800,
					linkedItemId: itemId,
					occurredAt: 10,
				},
			],
		});
		expect(added).toEqual([
			{ clientMutationId: 'line-milk', outcome: 'applied', rejectionCode: null },
		]);

		const bought = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-milk',
					lineClientMutationId: 'line-milk',
					occurredAt: 20,
				},
			],
		});
		expect(bought[0]?.outcome).toBe('applied');

		const list = await bob.as.query(api.purchases.list, { spaceId });
		expect(list.lines[0]).toMatchObject({
			status: 'bought',
			name: '全脂牛奶',
			perPersonCents: 2_400,
			remainderCents: 0,
		});
		const board = await bob.as.query(api.stock.board, { spaceId, today });
		expect(board.items[0]?.quantity).toBe(3);
	});

	it('refuses an office line the department budget cannot cover', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId, 'office');
		await t.run(async (ctx) => {
			await ctx.db.patch('spaces', spaceId, { budgetCents: 100 });
		});

		await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'line-coffee',
					name: '咖啡豆',
					quantity: 2,
					estimatedCents: 200,
					linkedItemId: itemId,
					occurredAt: 10,
				},
			],
		});
		const bought = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-coffee',
					lineClientMutationId: 'line-coffee',
					occurredAt: 20,
				},
			],
		});
		expect(bought[0]).toMatchObject({ outcome: 'rejected', rejectionCode: 'BUDGET_EXCEEDED' });
		const list = await alice.as.query(api.purchases.list, { spaceId });
		expect(list.budgetCents).toBe(100);
		expect(list.lines[0]?.status).toBe('open');
		expect(list.lines[0]?.fitsBudget).toBe(false);
	});

	it('stocks an unlinked purchase onto an existing shelf item', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId, 'household');

		await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'line-beans',
					name: '咖啡豆',
					quantity: 2,
					estimatedCents: 1_200,
					linkedItemId: null,
					occurredAt: 10,
				},
				{
					tag: 'buy',
					clientMutationId: 'buy-beans',
					lineClientMutationId: 'line-beans',
					occurredAt: 20,
				},
			],
		});

		const received = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'receive',
					mode: 'existing',
					clientMutationId: 'receive-beans',
					lineClientMutationId: 'line-beans',
					occurredAt: 30,
					itemId,
				},
			],
		});
		expect(received[0]).toMatchObject({ outcome: 'applied', rejectionCode: null });

		const again = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'receive',
					mode: 'existing',
					clientMutationId: 'receive-beans-again',
					lineClientMutationId: 'line-beans',
					occurredAt: 40,
					itemId,
				},
			],
		});
		expect(again[0]?.outcome).toBe('duplicate');

		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items.find((item) => item._id === itemId)?.quantity).toBe(3);
	});

	it('opens a new shelf item from a bought line', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId } = await shelf(t, alice.userId, alice.userId, 'household');

		await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'line-soda',
					name: '梳打水',
					quantity: 4,
					estimatedCents: 2_000,
					linkedItemId: null,
					occurredAt: 10,
				},
				{
					tag: 'buy',
					clientMutationId: 'buy-soda',
					lineClientMutationId: 'line-soda',
					occurredAt: 20,
				},
				{
					tag: 'receive',
					mode: 'new',
					clientMutationId: 'receive-soda',
					lineClientMutationId: 'line-soda',
					occurredAt: 30,
					category: 'drink',
					unit: 'can',
					safetyQuantity: 2,
					expiresOn: '2026-12-01',
					shelf: 'fridge',
				},
			],
		});

		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items.find((item) => item.name === '梳打水')).toMatchObject({
			quantity: 4,
			unit: 'can',
			category: 'drink',
			safetyQuantity: 2,
		});
		const list = await alice.as.query(api.purchases.list, { spaceId });
		expect(list.lines[0]?.linkedItemId).not.toBeNull();
	});
});

describe('viewer', () => {
	it('returns null when signed out and the token claims when signed in', async () => {
		const t = convexTest(schema, modules);
		expect(await t.query(api.viewer.get, {})).toBeNull();
		const alice = await signIn(t, 'alice@example.com');
		expect(await alice.as.query(api.viewer.get, {})).toMatchObject({
			subject: alice.userId,
			email: 'alice@example.com',
		});
	});
});
