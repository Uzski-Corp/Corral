/**
 * Every way an API call can fail, as data. `op` is the request that failed ("GET /api/v1/auth/me"),
 * so an error carries its own context the way a wrapped Go error does.
 */
export type ApiError =
  | { readonly kind: "unauthorized"; readonly op: string; readonly status: 401; readonly message: string }
  | { readonly kind: "forbidden"; readonly op: string; readonly status: 403; readonly message: string }
  | { readonly kind: "unavailable"; readonly op: string; readonly status: 502 | 503 | 504; readonly message: string }
  | { readonly kind: "http"; readonly op: string; readonly status: number; readonly message: string }
  | { readonly kind: "invalid_response"; readonly op: string; readonly status: number; readonly message: string }
  | { readonly kind: "timeout"; readonly op: string; readonly timeoutMs: number; readonly message: string }
  | { readonly kind: "network"; readonly op: string; readonly message: string }
  | { readonly kind: "aborted"; readonly op: string; readonly message: string };

export type ApiErrorKind = ApiError["kind"];

/** FastAPI puts a string in `detail`, or a list of validation errors with `msg`. */
export function detailMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("detail" in body)) return undefined;
  const detail = (body as { detail: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (typeof d === "object" && d !== null && "msg" in d ? String((d as { msg: unknown }).msg) : undefined))
      .filter((m): m is string => !!m);
    return msgs.length ? msgs.join("; ") : undefined;
  }
  return undefined;
}

export function httpError(op: string, status: number, body: unknown): ApiError {
  const message = detailMessage(body) ?? `HTTP ${status}`;
  if (status === 401) return { kind: "unauthorized", op, status, message };
  if (status === 403) return { kind: "forbidden", op, status, message };
  if (status === 502 || status === 503 || status === 504) return { kind: "unavailable", op, status, message };
  return { kind: "http", op, status, message };
}

/** One line for logs: "GET /api/v1/auth/me: timeout: timed out after 10000ms". */
export function describeApiError(e: ApiError): string {
  return `${e.op}: ${e.kind}: ${e.message}`;
}

/** Failures worth retrying later without asking the user to do anything. */
export function isTransient(e: ApiError): boolean {
  return e.kind === "timeout" || e.kind === "network" || e.kind === "unavailable";
}
