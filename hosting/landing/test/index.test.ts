import { describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import { localImagePath } from "../src/image";
import { ORIGIN, URL_, makeEnv, postJson } from "./helpers";

function setup() {
  const { db, env } = makeEnv();
  const assets = vi.fn(async (req: Request) => new Response(`asset:${new URL(req.url).pathname}${new URL(req.url).search}`));
  const full = { ...env, ASSETS: { fetch: assets } as unknown as Fetcher } satisfies Env;
  const waitUntil = vi.fn();
  const fetch = (req: Request, vars: Partial<Env> = {}) =>
    worker.fetch(req as Parameters<typeof worker.fetch>[0], { ...full, ...vars }, { waitUntil } as unknown as ExecutionContext);
  return { db, assets, fetch, waitUntil };
}

describe("localImagePath", () => {
  const at = (q: string) => new Request(`${ORIGIN}/_next/image${q}`);
  it("returns the local path for a /_next/image URL", () => {
    expect(localImagePath(at("?url=%2Fcorral%2For%2Fdusk.jpg&w=1920&q=75"))).toBe("/corral/or/dusk.jpg");
  });
  it("ignores other paths", () => {
    expect(localImagePath(new Request(`${ORIGIN}/corral/or/dusk.jpg?url=/x.png`))).toBeNull();
  });
  it.each([
    ["no url", ""],
    ["an empty url", "?url="],
    ["a relative url", "?url=corral.png"],
    ["a protocol-relative url", "?url=%2F%2Fevil.example%2Fx.png"],
    ["an absolute url", "?url=https%3A%2F%2Fevil.example%2Fx.png"],
    ["a backslash", "?url=%2F%5Cevil.example"],
    ["a traversal", "?url=%2Fcorral%2F..%2F..%2Fsecret"],
  ])("refuses %s", (_label, q) => {
    expect(localImagePath(at(q))).toBeNull();
  });
});

describe("worker.fetch", () => {
  it("serves everything else from ASSETS, untouched", async () => {
    const { assets, fetch } = setup();
    const req = new Request(`${ORIGIN}/v/1`);
    const res = await fetch(req);
    expect(await res.text()).toBe("asset:/v/1");
    expect(assets).toHaveBeenCalledWith(req);
  });

  it("rewrites /_next/image to the asset it points at", async () => {
    const { assets, fetch } = setup();
    const res = await fetch(new Request(`${ORIGIN}/_next/image?url=%2Fcorral%2For%2Fdusk.jpg&w=1920&q=75`));
    expect(await res.text()).toBe("asset:/corral/or/dusk.jpg");
    expect(assets).toHaveBeenCalledOnce();
  });

  it("passes a refused /_next/image straight to ASSETS", async () => {
    const { assets, fetch } = setup();
    const req = new Request(`${ORIGIN}/_next/image?url=%2F%2Fevil.example%2Fx.png`);
    await fetch(req);
    expect(assets).toHaveBeenCalledWith(req);
  });

  it("routes POST /api/waitlist to the waitlist, not ASSETS", async () => {
    const { db, assets, fetch } = setup();
    const res = await fetch(postJson({ email: "a@b.co", source: "v1" }));
    expect(res.status).toBe(201);
    expect(db.rows()).toHaveLength(1);
    expect(assets).not.toHaveBeenCalled();
  });

  it("answers other methods on /api/waitlist with 405", async () => {
    const { assets, fetch } = setup();
    const res = await fetch(new Request(URL_));
    expect(res.status).toBe(405);
    expect(assets).not.toHaveBeenCalled();
  });

  it("matches /api/waitlist with a query string", async () => {
    const { fetch } = setup();
    expect((await fetch(new Request(`${URL_}?x=1`))).status).toBe(405);
  });

  it("routes POST /api/pricing-intent to the pricing gate (404 while the flag is off), not ASSETS", async () => {
    const { db, assets, fetch, waitUntil } = setup();
    const ask = () => new Request(`${ORIGIN}/api/pricing-intent`, {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
      body: JSON.stringify({ fullName: "Wanjiru Kamau", industry: "other", otherText: "Beekeeping", email: "w@acme.co" }),
    });
    expect((await fetch(ask())).status).toBe(404);
    expect(db.intents()).toHaveLength(0);
    const res = await fetch(ask(), { PRICING_INTENT_ENABLED: "1" });
    expect(res.status).toBe(202);
    expect(db.intents()).toHaveLength(1);
    expect(waitUntil).toHaveBeenCalledOnce();
    expect(assets).not.toHaveBeenCalled();
  });

  it("leaves neighbouring /api paths to ASSETS", async () => {
    const { assets, fetch } = setup();
    await fetch(new Request(`${ORIGIN}/api/waitlist/extra`));
    await fetch(new Request(`${ORIGIN}/api/other`));
    await fetch(new Request(`${ORIGIN}/api/pricing-intent/extra`));
    expect(assets).toHaveBeenCalledTimes(3);
  });
});
