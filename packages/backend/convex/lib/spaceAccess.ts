import { APP_ERROR_CODES, type AppErrorData } from '@goods/shared/error-codes';
import { ConvexError } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

import { requireUserId } from './identity';

export function notFound(message: string): ConvexError<AppErrorData> {
	return new ConvexError({ code: APP_ERROR_CODES.notFound, message });
}

/** The signed-in member of a space, or not-found when the space is missing or closed to them. */
export async function requireSpaceMember(ctx: QueryCtx, spaceId: Id<'spaces'>) {
	const userId = await requireUserId(ctx);
	const space = await ctx.db.get('spaces', spaceId);
	if (!space) throw notFound('Space not found.');
	const membership = await ctx.db
		.query('memberships')
		.withIndex('by_space_and_user', (q) => q.eq('spaceId', spaceId).eq('userId', userId))
		.unique();
	if (!membership) throw notFound('Space not found.');
	return { userId, space, membership };
}
