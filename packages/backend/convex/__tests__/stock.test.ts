// @vitest-environment edge-runtime
/// <reference types="vite/client" />

import { convexErrorCode } from '@goods/shared/convex-error';
import { APP_ERROR_CODES } from '@goods/shared/error-codes';
import { describe, expect, it } from 'vitest';

import { convexTest, signIn } from '../../test/harness';
import { api, internal } from '../_generated/api';
import schema from '../schema';

/** Convex modules the stock tests load. Tests themselves are excluded. */
const modules = import.meta.glob(['../**/*.ts', '../**/*.js', '!../**/*.d.ts', '!../**/*.test.ts']);

/** Reads the app error code from a call that is expected to throw. */
async function codeOf(promise: Promise<unknown>) {
	try {
		await promise;
	} catch (error) {
		return convexErrorCode(error);
	}
	throw new Error('expected the call to fail');
}

/** Fixed day the stock tests classify against. */
const today = '2026-10-28';

/** Inserts one shelf and its members, and returns the ids the stock tests use. */
async function shelf(t: ReturnType<typeof convexTest>, ownerId: string, roommateId: string) {
	return await t.run(async (ctx) => {
		const spaceId = await ctx.db.insert('spaces', {
			name: '貨架',
			createdBy: ownerId,
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
		expect(await codeOf(t.mutation(api.spaces.ensureMine, {}))).toBe(
			APP_ERROR_CODES.unauthenticated,
		);
	});

	it('opens one empty shelf for a new account', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');

		const first = await alice.as.mutation(api.spaces.ensureMine, {});
		const second = await alice.as.mutation(api.spaces.ensureMine, {});
		const mine = await alice.as.query(api.spaces.listMine, {});

		expect(second).toBe(first);
		expect(mine).toMatchObject([{ _id: first, name: '貨架' }]);

		const bob = await signIn(t, 'bob@example.com');
		const bobs = await bob.as.mutation(api.spaces.ensureMine, {});
		expect(bobs).not.toBe(first);
		expect(await codeOf(bob.as.query(api.stock.board, { spaceId: first, today }))).toBe(
			APP_ERROR_CODES.notFound,
		);
		const board = await alice.as.query(api.stock.board, { spaceId: first, today });
		expect(board.items).toEqual([]);
	});

	it('hides the shelf from someone who is not a member', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const bob = await signIn(t, 'bob@example.com');
		const { spaceId } = await shelf(t, alice.userId, alice.userId);

		expect(await codeOf(bob.as.query(api.stock.board, { spaceId, today }))).toBe(
			APP_ERROR_CODES.notFound,
		);
		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items[0]).toMatchObject({
			name: '咖啡豆',
			quantity: 1,
			supply: 'low',
		});
	});

	it('lets the earlier offline consume keep the last bag', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const bob = await signIn(t, 'bob@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, bob.userId);

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
		const { spaceId } = await shelf(t, alice.userId, alice.userId);

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
	it('records one total and restocks every good', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const bob = await signIn(t, 'bob@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, bob.userId);
		const tissueId = await t.run(async (ctx) =>
			ctx.db.insert('items', {
				spaceId,
				name: '衛生紙',
				category: 'tissue',
				unit: 'roll',
				openingQuantity: 0,
				quantity: 0,
				safetyQuantity: 4,
				expiresOn: null,
				shelf: 'washroom',
				version: 0,
				createdBy: alice.userId,
			}),
		);

		const added = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'trip-1',
					totalCents: 6_600,
					occurredAt: 10,
					items: [
						{ itemId, quantity: 2 },
						{ itemId: tissueId, quantity: 4 },
					],
				},
			],
		});
		expect(added).toEqual([
			{ clientMutationId: 'trip-1', outcome: 'applied', rejectionCode: null },
		]);

		const bought = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-1',
					purchaseClientMutationId: 'trip-1',
					occurredAt: 20,
				},
			],
		});
		expect(bought[0]?.outcome).toBe('applied');

		const again = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-1-again',
					purchaseClientMutationId: 'trip-1',
					occurredAt: 30,
				},
			],
		});
		expect(again[0]?.outcome).toBe('duplicate');

		const list = await bob.as.query(api.purchases.list, { spaceId });
		expect(list.purchases[0]).toMatchObject({
			status: 'bought',
			totalCents: 6_600,
		});
		expect(list.purchases[0]?.items).toEqual([
			expect.objectContaining({ name: '咖啡豆', quantity: 2, unit: 'bag' }),
			expect.objectContaining({ name: '衛生紙', quantity: 4, unit: 'roll' }),
		]);
		const board = await bob.as.query(api.stock.board, { spaceId, today });
		expect(board.items.find((item) => item._id === itemId)?.quantity).toBe(3);
		expect(board.items.find((item) => item._id === tissueId)?.quantity).toBe(4);
	});

	it('records a total and restocks the shelf', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId);

		await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'trip-coffee',
					totalCents: 200,
					occurredAt: 10,
					items: [{ itemId, quantity: 2 }],
				},
			],
		});
		const bought = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-coffee',
					purchaseClientMutationId: 'trip-coffee',
					occurredAt: 20,
				},
			],
		});
		expect(bought[0]).toMatchObject({ outcome: 'applied', rejectionCode: null });
		const list = await alice.as.query(api.purchases.list, { spaceId });
		expect(list.purchases[0]).toMatchObject({
			status: 'bought',
			totalCents: 200,
		});
		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items[0]?.quantity).toBe(3);
	});

	it('folds open per-good lines into one purchase', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId);
		await t.run(async (ctx) => {
			await ctx.db.insert('purchaseLines', {
				spaceId,
				clientMutationId: 'old-milk',
				name: '全脂牛奶',
				quantity: 2,
				estimatedCents: 4_800,
				linkedItemId: itemId,
				status: 'open',
				createdBy: alice.userId,
				createdAt: 10,
				boughtBy: null,
				boughtAt: null,
			});
			await ctx.db.insert('purchaseLines', {
				spaceId,
				clientMutationId: 'old-soy',
				name: '醬油',
				quantity: 1,
				estimatedCents: 1_800,
				linkedItemId: null,
				status: 'open',
				createdBy: alice.userId,
				createdAt: 11,
				boughtBy: null,
				boughtAt: null,
			});
		});

		await t.mutation(internal.migrations.foldPurchaseLines, {});
		await t.mutation(internal.migrations.foldPurchaseLines, {});

		const list = await alice.as.query(api.purchases.list, { spaceId });
		expect(list.purchases).toHaveLength(1);
		expect(list.purchases[0]).toMatchObject({ status: 'open', totalCents: 6_600 });
		expect(list.purchases[0]?.items).toEqual([
			expect.objectContaining({ name: '全脂牛奶', quantity: 2, itemId }),
			expect.objectContaining({ name: '醬油', quantity: 1, itemId: null }),
		]);
	});
});

describe('stock.remove', () => {
	it('drops the good and its takes, and keeps the purchase name', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const stranger = await signIn(t, 'cara@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId);
		await t.run(async (ctx) => {
			await ctx.db.insert('movements', {
				spaceId,
				itemId,
				clientMutationId: 'take-1',
				kind: 'consume',
				quantity: 1,
				actorId: alice.userId,
				observedVersion: 0,
				occurredAt: 20,
				causalParentClientId: null,
				outcome: 'applied',
				rejectionCode: null,
			});
			const purchaseId = await ctx.db.insert('purchases', {
				spaceId,
				clientMutationId: 'trip-1',
				totalCents: 4_800,
				status: 'open',
				createdBy: alice.userId,
				createdAt: 10,
				boughtBy: null,
				boughtAt: null,
			});
			await ctx.db.insert('purchaseItems', {
				purchaseId,
				spaceId,
				itemId,
				name: '咖啡豆',
				unit: 'bag',
				quantity: 1,
			});
		});

		expect(await codeOf(stranger.as.mutation(api.stock.remove, { spaceId, itemId }))).toBe(
			APP_ERROR_CODES.notFound,
		);

		expect(await alice.as.mutation(api.stock.remove, { spaceId, itemId })).toBeNull();
		const board = await alice.as.query(api.stock.board, { spaceId, today });
		expect(board.items).toEqual([]);
		expect(board.movements).toEqual([]);

		const list = await alice.as.query(api.purchases.list, { spaceId });
		expect(list.purchases[0]?.items).toEqual([
			expect.objectContaining({ name: '咖啡豆', itemId: null, quantity: 1 }),
		]);
		const bought = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-1',
					purchaseClientMutationId: 'trip-1',
					occurredAt: 30,
				},
			],
		});
		expect(bought[0]).toMatchObject({ outcome: 'applied', rejectionCode: null });
	});
});

describe('purchases.setQuantity', () => {
	it('changes an open line and refuses a bought trip or a bad number', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const stranger = await signIn(t, 'cara@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId);

		await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'trip-qty',
					totalCents: 200,
					occurredAt: 10,
					items: [{ itemId, quantity: 2 }],
				},
			],
		});
		const open = await alice.as.query(api.purchases.list, { spaceId });
		const lineId = open.purchases[0]?.items[0]?._id;
		if (lineId === undefined) throw new Error('expected a purchase line');

		expect(
			await codeOf(
				stranger.as.mutation(api.purchases.setQuantity, {
					spaceId,
					purchaseItemId: lineId,
					quantity: 3,
				}),
			),
		).toBe(APP_ERROR_CODES.notFound);
		expect(
			await codeOf(
				alice.as.mutation(api.purchases.setQuantity, {
					spaceId,
					purchaseItemId: lineId,
					quantity: 0,
				}),
			),
		).toBe(APP_ERROR_CODES.purchaseInvalid);

		expect(
			await alice.as.mutation(api.purchases.setQuantity, {
				spaceId,
				purchaseItemId: lineId,
				quantity: 5,
			}),
		).toBeNull();
		const changed = await alice.as.query(api.purchases.list, { spaceId });
		expect(changed.purchases[0]?.items[0]?.quantity).toBe(5);

		await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-qty',
					purchaseClientMutationId: 'trip-qty',
					occurredAt: 20,
				},
			],
		});
		expect(
			await codeOf(
				alice.as.mutation(api.purchases.setQuantity, {
					spaceId,
					purchaseItemId: lineId,
					quantity: 4,
				}),
			),
		).toBe(APP_ERROR_CODES.purchaseInvalid);
	});
});

describe('purchase rejections', () => {
	it('rejects a free trip, a missing good, and a second copy of the same trip', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId);

		const rejected = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'free',
					totalCents: 0,
					occurredAt: 1,
					items: [{ itemId, quantity: 1 }],
				},
			],
		});
		expect(rejected[0]).toMatchObject({ outcome: 'rejected', rejectionCode: 'PURCHASE_INVALID' });

		const added = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'trip-copy',
					totalCents: 100,
					occurredAt: 2,
					items: [{ itemId, quantity: 1 }],
				},
			],
		});
		expect(added[0]?.outcome).toBe('applied');
		const copy = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'add',
					clientMutationId: 'trip-copy',
					totalCents: 100,
					occurredAt: 3,
					items: [{ itemId, quantity: 1 }],
				},
			],
		});
		expect(copy[0]?.outcome).toBe('duplicate');

		const missing = await alice.as.mutation(api.purchases.sync, {
			spaceId,
			ops: [
				{
					tag: 'buy',
					clientMutationId: 'buy-missing',
					purchaseClientMutationId: 'no-such-trip',
					occurredAt: 4,
				},
			],
		});
		expect(missing[0]).toMatchObject({ outcome: 'rejected', rejectionCode: 'NOT_FOUND' });

		const tooMany = Array.from({ length: 41 }, (_, index) => ({
			tag: 'buy' as const,
			clientMutationId: `bulk-${index}`,
			purchaseClientMutationId: 'no-such-trip',
			occurredAt: index,
		}));
		expect(await codeOf(alice.as.mutation(api.purchases.sync, { spaceId, ops: tooMany }))).toBe(
			APP_ERROR_CODES.purchaseInvalid,
		);
	});
});

describe('stock.sync limits', () => {
	it('rejects a missing good and a batch that is too large', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const bob = await signIn(t, 'bob@example.com');
		const mine = await shelf(t, alice.userId, alice.userId);
		const theirs = await shelf(t, bob.userId, bob.userId);
		const take = {
			clientMutationId: 'take-1',
			kind: 'consume' as const,
			quantity: 1,
			occurredAt: 1,
			causalParentClientId: null,
			observedVersion: 0,
		};

		expect(
			await codeOf(
				alice.as.mutation(api.stock.sync, {
					spaceId: mine.spaceId,
					itemId: theirs.itemId,
					ops: [take],
				}),
			),
		).toBe(APP_ERROR_CODES.notFound);

		const ops = Array.from({ length: 41 }, (_, index) => ({
			...take,
			clientMutationId: `take-${index}`,
			occurredAt: index,
		}));
		expect(
			await codeOf(
				alice.as.mutation(api.stock.sync, {
					spaceId: mine.spaceId,
					itemId: mine.itemId,
					ops,
				}),
			),
		).toBe(APP_ERROR_CODES.stockInvalid);
	});
});

describe('clearSpaceKind', () => {
	it('drops the old home and office field and leaves a shelf that has none', async () => {
		const t = convexTest(schema, modules);
		const ids = await t.run(async (ctx) => {
			const office = await ctx.db.insert('spaces', {
				name: '貨架',
				kind: 'office',
				createdBy: 'someone',
				createdAt: 1,
			});
			const plain = await ctx.db.insert('spaces', {
				name: '貨架',
				createdBy: 'someone',
				createdAt: 2,
			});
			return { office, plain };
		});

		expect(await t.mutation(internal.migrations.clearSpaceKind, {})).toBeNull();
		expect(await t.mutation(internal.migrations.clearSpaceKind, {})).toBeNull();

		const stored = await t.run(async (ctx) => {
			const office = await ctx.db.get('spaces', ids.office);
			const plain = await ctx.db.get('spaces', ids.plain);
			return { office: office?.kind, plain: plain?.kind };
		});
		expect(stored).toEqual({ office: undefined, plain: undefined });
	});
});

describe('foldPurchaseLines bought rows', () => {
	it('keeps a bought line as its own trip', async () => {
		const t = convexTest(schema, modules);
		const alice = await signIn(t, 'alice@example.com');
		const { spaceId, itemId } = await shelf(t, alice.userId, alice.userId);
		await t.run(async (ctx) => {
			await ctx.db.insert('purchaseLines', {
				spaceId,
				clientMutationId: 'old-bought',
				name: '咖啡豆',
				quantity: 1,
				estimatedCents: 2_400,
				linkedItemId: itemId,
				status: 'bought',
				createdBy: alice.userId,
				createdAt: 5,
				boughtBy: alice.userId,
				boughtAt: 6,
			});
		});

		await t.mutation(internal.migrations.foldPurchaseLines, {});
		await t.mutation(internal.migrations.foldPurchaseLines, {});

		const list = await alice.as.query(api.purchases.list, { spaceId });
		expect(list.purchases).toHaveLength(1);
		expect(list.purchases[0]).toMatchObject({
			status: 'bought',
			totalCents: 2_400,
			clientMutationId: 'old-bought',
		});
		expect(list.purchases[0]?.items).toEqual([
			expect.objectContaining({ name: '咖啡豆', quantity: 1, itemId, unit: 'bag' }),
		]);
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
