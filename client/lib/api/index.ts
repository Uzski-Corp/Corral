import { getConfig, type ClientConfig } from "../config";
import { createApiClient } from "./client";
import { createAuthApi, type AuthApi } from "./auth";
import { createKbApi, type KbApi } from "./kb";
import { createLeadsApi, type LeadsApi } from "./leads";
import { createWorkspaceApi, type WorkspaceApi } from "./workspace";

export * from "./client";
export * from "./errors";
export * from "./auth";
export * from "./kb";
export * from "./leads";
export * from "./workspace";

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

/** The signed-in workspace (onboarding profile, logo, site read). */
export function workspaceApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): WorkspaceApi {
  return createWorkspaceApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl }));
}
