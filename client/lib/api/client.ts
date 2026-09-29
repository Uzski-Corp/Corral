/**
 * The typed fetch wrapper every API call goes through.
 *
 * - Sends cookies (`credentials: "include"`): the session is an HttpOnly cookie set by the API.
 * - Every call has a deadline (default from config) and honours a caller's AbortSignal.
 * - Never throws: returns Result<T, ApiError>, and the body is checked by a decoder, so a
 *   malformed response is an `invalid_response` error instead of a crash three screens later.
 */
import { err, ok, type Result } from "../result";
import { httpError, type ApiError } from "./errors";

export type Decoder<T> = (input: unknown) => Result<T, string>;
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type RequestOptions<T> = {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  decode: Decoder<T>;
};

export type ApiClient = {
  readonly baseUrl: string;
  url(path: string, query?: Record<string, string | undefined>): string;
  request<T>(path: string, options: RequestOptions<T>): Promise<Result<T, ApiError>>;
};

export type ApiClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetch?: typeof fetch;
};

function buildUrl(baseUrl: string, path: string, query?: Record<string, string | undefined>): string {
  if (!path.startsWith("/")) throw new TypeError(`API path must start with "/": ${path}`);
  const url = new URL(path, `${baseUrl}/`);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
}

async function readBody(res: Response): Promise<Result<unknown, string>> {
  if (res.status === 204 || res.status === 205) return ok(undefined);
  const text = await res.text();
  if (text === "") return ok(undefined);
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("json")) return ok(text);
  try {
    return ok(JSON.parse(text) as unknown);
  } catch (e) {
    return err(`body is not valid JSON (${e instanceof Error ? e.message : String(e)})`);
  }
}

export function createApiClient({ baseUrl, timeoutMs: defaultTimeout, fetch: fetchImpl }: ApiClientOptions): ApiClient {
  const base = baseUrl.replace(/\/+$/, "");
  const doFetch = fetchImpl ?? ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));

  async function request<T>(path: string, o: RequestOptions<T>): Promise<Result<T, ApiError>> {
    const method = o.method ?? "GET";
    const op = `${method} ${path}`;
    const timeoutMs = o.timeoutMs ?? defaultTimeout;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    if (o.signal?.aborted) controller.abort();
    else o.signal?.addEventListener("abort", onCallerAbort, { once: true });

    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (o.body !== undefined) headers["Content-Type"] = "application/json";
      let res: Response;
      try {
        res = await doFetch(buildUrl(base, path, o.query), {
          method,
          headers,
          body: o.body === undefined ? undefined : JSON.stringify(o.body),
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch (e) {
        if (timedOut) return err({ kind: "timeout", op, timeoutMs, message: `timed out after ${timeoutMs}ms` });
        if (controller.signal.aborted) return err({ kind: "aborted", op, message: "request was cancelled" });
        return err({ kind: "network", op, message: e instanceof Error ? e.message : String(e) });
      }

      let body: Result<unknown, string>;
      try {
        body = await readBody(res);
      } catch (e) {
        if (timedOut) return err({ kind: "timeout", op, timeoutMs, message: `timed out after ${timeoutMs}ms reading the body` });
        if (controller.signal.aborted) return err({ kind: "aborted", op, message: "request was cancelled" });
        return err({ kind: "network", op, message: e instanceof Error ? e.message : String(e) });
      }

      if (!res.ok) return err(httpError(op, res.status, body.ok ? body.value : undefined));
      if (!body.ok) return err({ kind: "invalid_response", op, status: res.status, message: body.error });
      const decoded = o.decode(body.value);
      if (!decoded.ok) return err({ kind: "invalid_response", op, status: res.status, message: decoded.error });
      return ok(decoded.value);
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  return { baseUrl: base, url: (path, query) => buildUrl(base, path, query), request };
}
