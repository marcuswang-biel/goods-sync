/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as init from "../init.js";
import type * as lib_applyStock from "../lib/applyStock.js";
import type * as lib_identity from "../lib/identity.js";
import type * as lib_spaceAccess from "../lib/spaceAccess.js";
import type * as migrations from "../migrations.js";
import type * as purchases from "../purchases.js";
import type * as spaces from "../spaces.js";
import type * as stock from "../stock.js";
import type * as viewer from "../viewer.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  functions: typeof functions;
  http: typeof http;
  init: typeof init;
  "lib/applyStock": typeof lib_applyStock;
  "lib/identity": typeof lib_identity;
  "lib/spaceAccess": typeof lib_spaceAccess;
  migrations: typeof migrations;
  purchases: typeof purchases;
  spaces: typeof spaces;
  stock: typeof stock;
  viewer: typeof viewer;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
