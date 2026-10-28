/**
 * Migrations
 *
 * The active post-deploy queue. Completed migrations are removed from `runAll` once
 * they are confirmed done on prod; their source stays in git history.
 *
 * Usage:
 * - Run all: pnpm exec convex run migrations:runAll
 * - Run single: pnpm exec convex run migrations:run '{"fn": "migrations:<name>"}'
 * - On release, `runAll` is invoked automatically by the deploy-convex CI job.
 *
 * Add a migration:
 *
 *   export const backfillClaimCurrency_20270101 = migrations.define({
 *     table: 'claims',
 *     migrateOne: async (_ctx, claim) => (claim.currency ? undefined : { currency: 'HKD' }),
 *   });
 *
 * then append `internal.migrations.backfillClaimCurrency_20270101` to `releaseQueue`.
 * Migrations must be idempotent: `runAll` re-runs on every release, and the
 * component skips a migration that already completed.
 */

import { type MigrationFunctionReference, Migrations } from '@convex-dev/migrations';
import { v } from 'convex/values';

import type { DataModel, Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

import { components, internal } from './_generated/api';
import { internalMutation } from './functions';
import schema from './schema';

// Backfills write through the trigger-wrapped builder, so re-touching a row is
// all it takes to (re)build state that hangs off that table.
export const migrations = new Migrations<DataModel, typeof schema>(components.migrations, {
	internalMutation,
	schema,
});

/** Post-deploy queue, oldest first. Remove an entry once prod reports it done. */
const releaseQueue: MigrationFunctionReference[] = [];

/**
 * Runs `releaseQueue` serially. Not `migrations.runner(releaseQueue)`: the runner
 * rejects an empty series, and the queue is empty most of the time.
 */
export const runAll = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		await ctx.runMutation(internal.migrations.foldPurchaseLines, {});
		if (releaseQueue.length > 0) {
			await migrations.runSerially(ctx, releaseQueue);
		}
		return null;
	},
});

/** Copies one old purchase line onto a trip, keeping the shelf unit when the good still exists. */
async function copyLine(ctx: MutationCtx, purchaseId: Id<'purchases'>, line: Doc<'purchaseLines'>) {
	let unit: Doc<'items'>['unit'] | null = null;
	if (line.linkedItemId !== null) {
		const item = await ctx.db.get('items', line.linkedItemId);
		if (item && item.spaceId === line.spaceId) unit = item.unit;
	}
	await ctx.db.insert('purchaseItems', {
		purchaseId,
		spaceId: line.spaceId,
		itemId: line.linkedItemId,
		name: line.name,
		unit,
		quantity: line.quantity,
	});
}

/**
 * Copies the old one-good rows into purchases. Bought rows stay separate.
 * Open rows in the same space become one trip whose total is their sum.
 * Idempotent: a second run finds the copied client ids and skips them.
 */
export const foldPurchaseLines = internalMutation({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const lines = await ctx.db.query('purchaseLines').collect();
		const openBySpace = new Map<Id<'spaces'>, Doc<'purchaseLines'>[]>();
		for (const line of lines) {
			if (line.status === 'bought') {
				const existing = await ctx.db
					.query('purchases')
					.withIndex('by_space_and_client', (q) =>
						q.eq('spaceId', line.spaceId).eq('clientMutationId', line.clientMutationId),
					)
					.unique();
				if (existing) continue;
				const purchaseId = await ctx.db.insert('purchases', {
					spaceId: line.spaceId,
					clientMutationId: line.clientMutationId,
					totalCents: line.estimatedCents,
					status: 'bought',
					createdBy: line.createdBy,
					createdAt: line.createdAt,
					boughtBy: line.boughtBy,
					boughtAt: line.boughtAt,
				});
				await copyLine(ctx, purchaseId, line);
				continue;
			}
			const group = openBySpace.get(line.spaceId) ?? [];
			group.push(line);
			openBySpace.set(line.spaceId, group);
		}

		for (const [spaceId, group] of openBySpace) {
			const clientMutationId = `folded-open:${spaceId}`;
			const existing = await ctx.db
				.query('purchases')
				.withIndex('by_space_and_client', (q) =>
					q.eq('spaceId', spaceId).eq('clientMutationId', clientMutationId),
				)
				.unique();
			if (existing) continue;
			const totalCents = group.reduce((sum, line) => sum + line.estimatedCents, 0);
			const createdAt = Math.min(...group.map((line) => line.createdAt));
			const first = group[0];
			if (!first || totalCents <= 0) continue;
			const purchaseId = await ctx.db.insert('purchases', {
				spaceId,
				clientMutationId,
				totalCents,
				status: 'open',
				createdBy: first.createdBy,
				createdAt,
				boughtBy: null,
				boughtAt: null,
			});
			for (const line of group) await copyLine(ctx, purchaseId, line);
		}
		return null;
	},
});

/** Convex runner that applies `foldPurchaseLines` and anything later queued on `releaseQueue`. */
export const run = migrations.runner();
