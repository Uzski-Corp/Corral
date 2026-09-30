import { getConfig, type ClientConfig } from "../config";
import { createApiClient } from "./client";
import { createAuthApi, type AuthApi } from "./auth";
import { createKbApi, type KbApi } from "./kb";

export * from "./client";
export * from "./errors";
export * from "./auth";
export * from "./kb";

/** The auth API bound to this deploy's config. */
export function authApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): AuthApi {
  return createAuthApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl }));
}

/** The knowledge-base API bound to this deploy's config. */
export function kbApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): KbApi {
  return createKbApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl }));
}
