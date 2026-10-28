import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';

import { query } from './_generated/server';
import { internalMutation } from './functions';
import { requireUserId } from './lib/identity';
import { itemCategoryValidator, itemUnitValidator, shelfValidator } from './schema';

/** The shared shelf this account belongs to, without its goods. */
const spaceSummary = v.object({
	_id: v.id('spaces'),
	name: v.string(),
	createdAt: v.number(),
});

/** Shelves the signed-in user belongs to, oldest first. */
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
				createdAt: space.createdAt,
			});
		}
		spaces.sort((left, right) => left.createdAt - right.createdAt);
		return spaces;
	},
});

/** Expiry date for the demo seed, `days` ahead of today in UTC. */
function isoOffset(days: number): string {
	const now = new Date();
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days))
		.toISOString()
		.slice(0, 10);
}

/** One demo good inserted with the shelf. */
type SeedItem = {
	readonly name: string;
	readonly category: typeof itemCategoryValidator.type;
	readonly unit: typeof itemUnitValidator.type;
	readonly quantity: number;
	readonly safetyQuantity: number;
	readonly expiresInDays: number | null;
	readonly shelf: typeof shelfValidator.type;
};

/** Dev seed: one shelf, shared by the two demo accounts. */
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
		const spaceId = await ctx.db.insert('spaces', {
			name: '貨架',
			createdBy: args.devUserId,
			createdAt: now,
		});

		const members: ReadonlyArray<{
			spaceId: Id<'spaces'>;
			userId: string;
			role: 'admin' | 'member';
			label: string;
		}> = [
			{ spaceId, userId: args.devUserId, role: 'admin', label: '凱' },
			{ spaceId, userId: args.roommateUserId, role: 'member', label: '阿澄' },
		];
		for (const member of members) {
			await ctx.db.insert('memberships', member);
		}

		const seededItems: readonly SeedItem[] = [
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
		await writeItems(spaceId, seededItems);

		const coffee = inserted.get(`${spaceId}:咖啡豆`);
		if (coffee === undefined) return 1;

		const purchaseId = await ctx.db.insert('purchases', {
			spaceId,
			clientMutationId: 'seed-shelf',
			totalCents: 12_400,
			status: 'open',
			createdBy: args.devUserId,
			createdAt: now,
			boughtBy: null,
			boughtAt: null,
		});
		await ctx.db.insert('purchaseItems', {
			purchaseId,
			spaceId,
			itemId: coffee,
			name: '咖啡豆',
			unit: 'bag',
			quantity: 2,
		});
		return 1;
	},
});
