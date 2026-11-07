import { createReplyApi } from "./replies";
import { getConfig, type ClientConfig } from "../config";
import { createApiClient } from "./client";
import { createAuthApi, type AuthApi } from "./auth";
import { createKbApi, type KbApi } from "./kb";
import { createLeadsApi, type LeadsApi } from "./leads";
import { createWorkspaceApi, type WorkspaceApi } from "./workspace";
import { createInboxApi, type InboxApi } from "./inbox";
import { createSequencesApi, type SequencesApi } from "./sequences";
import { createDiscoveryApi, type DiscoveryApi } from "./discovery";
import { createIntegrationsApi, type IntegrationsApi } from "./integrations";
import { createDevelopersApi, type DevelopersApi } from "./developers";
import { createBillingApi, type BillingApi } from "./billing";

export * from "./client";
export * from "./errors";
export * from "./auth";
export * from "./kb";
export * from "./leads";
export * from "./workspace";
export * from "./inbox";
export * from "./sequences";
export * from "./discovery";
export * from "./integrations";
export * from "./developers";
export * from "./billing";

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

const clientFor = (config: ClientConfig, fetchImpl?: typeof fetch) =>
  createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl });

export function inboxApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): InboxApi {
  return createInboxApi(clientFor(config, fetchImpl));
}

export function sequencesApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): SequencesApi {
  return createSequencesApi(clientFor(config, fetchImpl));
}

export function discoveryApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): DiscoveryApi {
  return createDiscoveryApi(clientFor(config, fetchImpl));
}

export function integrationsApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): IntegrationsApi {
  return createIntegrationsApi(clientFor(config, fetchImpl));
}

export function developersApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): DevelopersApi {
  return createDevelopersApi(clientFor(config, fetchImpl));
}

export function billingApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): BillingApi {
  return createBillingApi(clientFor(config, fetchImpl));
}

export function replyApiFor(config: ClientConfig = getConfig()) { return createReplyApi(clientFor(config)); }
