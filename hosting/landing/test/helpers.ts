import { FakeD1 } from "./d1";
import type { WaitlistEnv } from "../src/waitlist";

export const ORIGIN = "https://corral.uzskicorp.agency";
export const URL_ = `${ORIGIN}/api/waitlist`;

export function makeEnv(salt?: string): { db: FakeD1; env: WaitlistEnv } {
  const db = new FakeD1();
  return { db, env: { WAITLIST_DB: db.asD1(), ...(salt ? { IP_HASH_SALT: salt } : {}) } };
}

type Opts = { ip?: string | null; country?: unknown; cf?: boolean; headers?: Record<string, string>; method?: string };

function withCf(request: Request, opts: Opts): Request {
  if (opts.cf === false) return request;
  Object.defineProperty(request, "cf", { value: { country: "country" in opts ? opts.country : "KE" } });
  return request;
}

function baseHeaders(opts: Opts, type: string): Record<string, string> {
  const headers: Record<string, string> = { "content-type": type, ...opts.headers };
  if (opts.ip !== null) headers["cf-connecting-ip"] = opts.ip ?? "203.0.113.7";
  return headers;
}

export function postJson(body: unknown, opts: Opts = {}): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return withCf(new Request(URL_, { method: "POST", headers: baseHeaders(opts, "application/json"), body: raw }), opts);
}

export function postForm(fields: Record<string, string>, opts: Opts = {}): Request {
  const body = new URLSearchParams(fields).toString();
  return withCf(
    new Request(URL_, { method: "POST", headers: baseHeaders(opts, "application/x-www-form-urlencoded"), body }),
    opts,
  );
}

/** A body that arrives as a stream with no content-length (chunked), so only the streaming cap can stop it. */
export function streamed(bytes: number, type = "application/json", chunk = 512): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const size = Math.min(chunk, bytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
  return new Request(URL_, {
    method: "POST",
    headers: { "content-type": type, "cf-connecting-ip": "203.0.113.7" },
    body,
    // @ts-expect-error undici needs duplex for stream bodies; the Workers type doesn't declare it
    duplex: "half",
  });
}

export async function body(res: Response): Promise<unknown> {
  return JSON.parse(await res.text());
}
