/**
 * Better Auth, running inside Convex through `@convex-dev/better-auth`.
 *
 * Web signs in with email + password through the `crossDomain` plugin (the web app
 * and the Convex site URL are different origins). Native uses the `expo` plugin and
 * Better Auth's Expo client (`apps/native/lib/auth-client.ts`). Both end up with a
 * Convex JWT whose `sub` is the Better Auth user id; domain code reads only that
 * (`lib/identity.ts`).
 */
import { expo } from '@better-auth/expo';
import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex, crossDomain } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth/minimal';
import { v } from 'convex/values';

import type { DataModel } from './_generated/dataModel';

import { components, internal } from './_generated/api';
import { internalAction } from './_generated/server';
import authConfig from './auth.config';

export const authComponent = createClient<DataModel>(components.betterAuth);

/** Must match `scheme` in apps/native/app.json. */
const DEFAULT_NATIVE_SCHEME = 'goods';

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	// SITE_URL accepts a comma-separated list so dev deployments can trust several
	// localhost ports (one per worktree) while prod keeps a single value. The first
	// entry is the canonical origin `crossDomain` redirects to.
	// String(...) keeps this file compilable from tsconfigs without Node env types.
	const siteUrls = String(process.env.SITE_URL ?? 'http://localhost:3001')
		.split(',')
		.map((url) => url.trim())
		.filter(Boolean);
	const nativeScheme = String(process.env.NATIVE_APP_SCHEME ?? DEFAULT_NATIVE_SCHEME);
	// Expo Go serves the app from exp://; only local dev deployments trust it.
	const devOrigins = process.env.CONVEX_DEBUG === 'true' ? ['exp://'] : [];

	return betterAuth({
		baseURL: process.env.CONVEX_SITE_URL,
		trustedOrigins: [...siteUrls, `${nativeScheme}://`, ...devOrigins],
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		plugins: [expo(), crossDomain({ siteUrl: siteUrls[0] }), convex({ authConfig })],
	});
};

/** Dev login written by `pnpm worktree:setup`. Local deployments only. */
export const DEV_USER = {
	email: 'dev@example.com',
	password: 'devpassword',
	name: '凱',
} as const;

/** Second demo account, so two people can take the last carton while offline. */
export const ROOMMATE_USER = {
	email: 'roommate@example.com',
	password: 'devpassword',
	name: '阿澄',
} as const;

type DevUserResult = { email: string; userId: string; created: boolean };
type DemoAccount = { readonly email: string; readonly password: string; readonly name: string };

/**
 * Idempotent dev-user seed, called by `init`. The caller checks CONVEX_DEBUG, which
 * only `worktree:setup` sets (on a local backend).
 */
export const ensureDevUserInternal = internalAction({
	args: {},
	returns: v.object({ email: v.string(), userId: v.string(), created: v.boolean() }),
	handler: async (ctx): Promise<DevUserResult> => {
		const ensure = async (account: DemoAccount) => {
			const existing = await ctx.runQuery(components.betterAuth.adapter.findOne, {
				model: 'user',
				where: [{ field: 'email', value: account.email }],
			});
			if (existing) {
				// SAFETY: the Better Auth component's `findOne` returns the stored user document.
				const userId = (existing as { _id: string })._id;
				return { userId, created: false };
			}
			const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
			const result = await auth.api.signUpEmail({ headers, body: account });
			return { userId: result.user.id, created: true };
		};

		const dev = await ensure(DEV_USER);
		const roommate = await ensure(ROOMMATE_USER);
		await ctx.runMutation(internal.spaces.seedDemo, {
			devUserId: dev.userId,
			roommateUserId: roommate.userId,
		});
		return { email: DEV_USER.email, userId: dev.userId, created: dev.created };
	},
});
