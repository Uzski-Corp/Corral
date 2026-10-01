import { getConfig, type ClientConfig } from "../config";
import { createApiClient } from "./client";
import { createAuthApi, type AuthApi } from "./auth";
import { createKbApi, type KbApi } from "./kb";
import { createLeadsApi, type LeadsApi } from "./leads";

export * from "./client";
export * from "./errors";
export * from "./auth";
export * from "./kb";
export * from "./leads";

/** The auth API bound to this deploy's config. */
export function authApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): AuthApi {
  return createAuthApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl }));
}

/** The knowledge-base API bound to this deploy's config. */
export function kbApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): KbApi {
  return createKbApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl }));
}

/** The lead CRM API (companies, people, segments, imports) bound to this deploy's config. */
export function leadsApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): LeadsApi {
  return createLeadsApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl }));
}
