import { getConfig, type ClientConfig } from "../config";
import { createApiClient } from "./client";
import { createAuthApi, type AuthApi } from "./auth";

export * from "./client";
export * from "./errors";
export * from "./auth";

/** The auth API bound to this deploy's config. */
export function authApiFor(config: ClientConfig = getConfig(), fetchImpl?: typeof fetch): AuthApi {
  return createAuthApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs, fetch: fetchImpl }));
}
