/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as alerts from "../alerts.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as benchmarks from "../benchmarks.js";
import type * as campaigns from "../campaigns.js";
import type * as cohorts from "../cohorts.js";
import type * as connectors_attentive from "../connectors/attentive.js";
import type * as connectors_helpers from "../connectors/helpers.js";
import type * as connectors_omnisend from "../connectors/omnisend.js";
import type * as connectors_postscript from "../connectors/postscript.js";
import type * as connectors_sendlane from "../connectors/sendlane.js";
import type * as connectors_yotpo from "../connectors/yotpo.js";
import type * as crons from "../crons.js";
import type * as dataSources from "../dataSources.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as integrations_adapter from "../integrations/adapter.js";
import type * as klaviyo from "../klaviyo.js";
import type * as lib_metrics from "../lib/metrics.js";
import type * as lib_password from "../lib/password.js";
import type * as oauth from "../oauth.js";
import type * as orgs from "../orgs.js";
import type * as reports from "../reports.js";
import type * as shares from "../shares.js";
import type * as subscribers from "../subscribers.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  alerts: typeof alerts;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  benchmarks: typeof benchmarks;
  campaigns: typeof campaigns;
  cohorts: typeof cohorts;
  "connectors/attentive": typeof connectors_attentive;
  "connectors/helpers": typeof connectors_helpers;
  "connectors/omnisend": typeof connectors_omnisend;
  "connectors/postscript": typeof connectors_postscript;
  "connectors/sendlane": typeof connectors_sendlane;
  "connectors/yotpo": typeof connectors_yotpo;
  crons: typeof crons;
  dataSources: typeof dataSources;
  http: typeof http;
  integrations: typeof integrations;
  "integrations/adapter": typeof integrations_adapter;
  klaviyo: typeof klaviyo;
  "lib/metrics": typeof lib_metrics;
  "lib/password": typeof lib_password;
  oauth: typeof oauth;
  orgs: typeof orgs;
  reports: typeof reports;
  shares: typeof shares;
  subscribers: typeof subscribers;
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

export declare const components: {};
