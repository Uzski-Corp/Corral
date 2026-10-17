import { vi } from "vitest";
import { FakeD1 } from "./d1";
import type { PricingEnv } from "../src/pricing-intent";

export const ORIGIN = "https://corral.uzskicorp.agency";
export const PRICING_URL = `${ORIGIN}/api/pricing-intent`;
export const GOOD = { fullName: "Wanjiru Kamau", industry: "agriculture-food", email: "Wanjiru@Acme.co", phone: "+254 712 345 678", source: "hero" };

export function makeEnv(extra: Partial<PricingEnv> = {}): { db: FakeD1; env: PricingEnv } {
  const db = new FakeD1();
  return { db, env: { WAITLIST_DB: db.asD1(), PRICING_INTENT_ENABLED: "1", ...extra } };
}

type Opts = { ip?: string | null; country?: unknown; cf?: boolean; headers?: Record<string, string>; method?: string; type?: string };

export function post(body: unknown, opts: Opts = {}): Request {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const headers: Record<string, string> = { "content-type": opts.type ?? "application/json", ...opts.headers };
  if (opts.ip !== null) headers["cf-connecting-ip"] = opts.ip ?? "203.0.113.7";
  const request = new Request(PRICING_URL, { method: opts.method ?? "POST", headers, ...(opts.method === "GET" ? {} : { body: raw }) });
  if (opts.cf !== false) Object.defineProperty(request, "cf", { value: { country: "country" in opts ? opts.country : "KE" } });
  return request;
}

export function streamed(bytes: number, chunk = 512): Request {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= bytes) return controller.close();
      const size = Math.min(chunk, bytes - sent);
      sent += size;
      controller.enqueue(new Uint8Array(size).fill(0x61));
    },
  });
  return new Request(PRICING_URL, {
    method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" }, body,
    // @ts-expect-error undici needs duplex for stream bodies; the Workers type doesn't declare it
    duplex: "half",
  });
}

export const text = async (res: Response) => JSON.parse(await res.text()) as Record<string, string>;

/** ctx whose waitUntil promises can be awaited, so the email step has finished before assertions. */
export function makeCtx() {
  const pending: Promise<unknown>[] = [];
  return { ctx: { waitUntil: (p: Promise<unknown>) => { pending.push(p); } }, settle: () => Promise.all(pending) };
}

export const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
