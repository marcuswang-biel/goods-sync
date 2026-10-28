import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';

import { query } from './_generated/server';
import { internalMutation } from './functions';
import { requireUserId } from './lib/identity';
import {
	itemCategoryValidator,
	itemUnitValidator,
	shelfValidator,
	spaceKindValidator,
} from './schema';

const spaceSummary = v.object({
	_id: v.id('spaces'),
	name: v.string(),
	kind: spaceKindValidator,
	budgetCents: v.union(v.number(), v.null()),
	createdAt: v.number(),
});

/** Spaces the signed-in user belongs to, oldest first. */
export const listMine = query({
	args: {},
	returns: v.array(spaceSummary),
	handler: async (ctx) => {
		const userId = await requireUserId(ctx);
		const memberships = await ctx.db
			.query('memberships')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.collect();
		const spaces = [];
		for (const membership of memberships) {
			const space = await ctx.db.get('spaces', membership.spaceId);
			if (!space) continue;
			spaces.push({
				_id: space._id,
				name: space.name,
				kind: space.kind,
				budgetCents: space.budgetCents,
				createdAt: space.createdAt,
			});
		}
		spaces.sort((left, right) => left.createdAt - right.createdAt);
		return spaces;
	},
});

function isoOffset(days: number): string {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
		.toISOString()
		.slice(0, 10);
}

type SeedItem = {
	readonly name: string;
	readonly category: typeof itemCategoryValidator.type;
	readonly unit: typeof itemUnitValidator.type;
	readonly quantity: number;
	readonly safetyQuantity: number;
	readonly expiresInDays: number | null;
	readonly shelf: typeof shelfValidator.type;
};

/** Dev seed: one flat and one tea room, shared by the two demo accounts. */
export const seedDemo = internalMutation({
	args: { devUserId: v.string(), roommateUserId: v.string() },
	returns: v.number(),
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('memberships')
			.withIndex('by_user', (q) => q.eq('userId', args.devUserId))
			.first();
		if (existing) return 0;

		const now = Date.now();
		const householdId = await ctx.db.insert('spaces', {
			name: '我的合租房',
			kind: 'household',
			createdBy: args.devUserId,
			budgetCents: null,
			createdAt: now,
		});
		const officeId = await ctx.db.insert('spaces', {
			name: '公司茶水間',
			kind: 'office',
			createdBy: args.devUserId,
			budgetCents: 80_000,
			createdAt: now + 1,
		});

		const members: ReadonlyArray<{
			spaceId: Id<'spaces'>;
			userId: string;
			role: 'admin' | 'member';
			label: string;
		}> = [
			{ spaceId: householdId, userId: args.devUserId, role: 'admin', label: '凱' },
			{ spaceId: householdId, userId: args.roommateUserId, role: 'member', label: '阿澄' },
			{ spaceId: officeId, userId: args.devUserId, role: 'admin', label: '凱' },
			{ spaceId: officeId, userId: args.roommateUserId, role: 'member', label: '阿澄' },
		];
		for (const member of members) {
			await ctx.db.insert('memberships', member);
		}

		const householdItems: readonly SeedItem[] = [
			{
				name: '全脂牛奶',
				category: 'dairy',
				unit: 'carton',
				quantity: 1,
				safetyQuantity: 2,
				expiresInDays: 1,
				shelf: 'fridge',
			},
			{
				name: '豆漿',
				category: 'fresh',
				unit: 'carton',
				quantity: 2,
				safetyQuantity: 1,
				expiresInDays: 0,
				shelf: 'fridge',
			},
			{
				name: '衛生紙',
				category: 'tissue',
				unit: 'roll',
				quantity: 8,
				safetyQuantity: 4,
				expiresInDays: null,
				shelf: 'washroom',
			},
			{
				name: '洗潔精',
				category: 'supply',
				unit: 'bottle',
				quantity: 1,
				safetyQuantity: 1,
				expiresInDays: 40,
				shelf: 'sink',
			},
			{
				name: '醬油',
				category: 'seasoning',
				unit: 'bottle',
				quantity: 0,
				safetyQuantity: 1,
				expiresInDays: null,
				shelf: 'cupboard',
			},
		];
		const officeItems: readonly SeedItem[] = [
			{
				name: '咖啡豆',
				category: 'coffee',
				unit: 'bag',
				quantity: 1,
				safetyQuantity: 2,
				expiresInDays: 21,
				shelf: 'tearoom',
			},
			{
				name: '奶油餅乾',
				category: 'snack',
				unit: 'bag',
				quantity: 3,
				safetyQuantity: 1,
				expiresInDays: 2,
				shelf: 'tearoom',
			},
			{
				name: '打印紙',
				category: 'paper',
				unit: 'ream',
				quantity: 5,
				safetyQuantity: 2,
				expiresInDays: null,
				shelf: 'printroom',
			},
			{
				name: '鮮奶',
				category: 'dairy',
				unit: 'carton',
				quantity: 2,
				safetyQuantity: 2,
				expiresInDays: 1,
				shelf: 'fridge',
			},
		];

		const inserted = new Map<string, Id<'items'>>();
		const writeItems = async (spaceId: Id<'spaces'>, items: readonly SeedItem[]) => {
			for (const item of items) {
				const id = await ctx.db.insert('items', {
					spaceId,
					name: item.name,
					category: item.category,
					unit: item.unit,
					openingQuantity: item.quantity,
					quantity: item.quantity,
					safetyQuantity: item.safetyQuantity,
					expiresOn: item.expiresInDays === null ? null : isoOffset(item.expiresInDays),
					shelf: item.shelf,
					version: 0,
					createdBy: args.devUserId,
				});
				inserted.set(`${spaceId}:${item.name}`, id);
			}
		};
		await writeItems(householdId, householdItems);
		await writeItems(officeId, officeItems);

		const milk = inserted.get(`${householdId}:全脂牛奶`);
		const soy = inserted.get(`${householdId}:醬油`);
		const coffee = inserted.get(`${officeId}:咖啡豆`);
		if (milk === undefined || soy === undefined || coffee === undefined) return 2;

		await ctx.db.insert('purchaseLines', {
			spaceId: householdId,
			clientMutationId: 'seed-milk',
			name: '全脂牛奶',
			quantity: 2,
			estimatedCents: 4_800,
			linkedItemId: milk,
			status: 'open',
			createdBy: args.devUserId,
			createdAt: now,
			boughtBy: null,
			boughtAt: null,
			perPersonCents: null,
			remainderCents: null,
			departmentChargeCents: null,
		});
		await ctx.db.insert('purchaseLines', {
			spaceId: householdId,
			clientMutationId: 'seed-soy',
			name: '醬油',
			quantity: 1,
			estimatedCents: 1_800,
			linkedItemId: soy,
			status: 'open',
			createdBy: args.devUserId,
			createdAt: now + 1,
			boughtBy: null,
			boughtAt: null,
			perPersonCents: null,
			remainderCents: null,
			departmentChargeCents: null,
		});
		await ctx.db.insert('purchaseLines', {
			spaceId: officeId,
			clientMutationId: 'seed-coffee',
			name: '咖啡豆',
			quantity: 2,
			estimatedCents: 12_400,
			linkedItemId: coffee,
			status: 'open',
			createdBy: args.devUserId,
			createdAt: now,
			boughtBy: null,
			boughtAt: null,
			perPersonCents: null,
			remainderCents: null,
			departmentChargeCents: null,
		});
		return 2;
	},
});
