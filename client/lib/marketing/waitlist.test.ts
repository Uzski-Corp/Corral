import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "@/test/msw";
import { WAITLIST_ENDPOINT, WAITLIST_FRAGMENTS, isEmail, joinWaitlist } from "./waitlist";

const endpoint = () => new URL(WAITLIST_ENDPOINT, window.location.origin).toString();

describe("isEmail", () => {
  it.each(["a@b.co", "  first.last+tag@sub.example.co.ke  ", "wanjiru@kilima.co.ke"])("accepts %j", (v) => {
    expect(isEmail(v)).toBe(true);
  });
  it.each(["", "plain", "a@b", "a@b.c", "a b@c.co", "a@@b.co", "@b.co", "a@.co"])("rejects %j", (v) => {
    expect(isEmail(v)).toBe(false);
  });
});

describe("the contract constants", () => {
  it("posts to the Worker route and names the four no-script fragments", () => {
    expect(WAITLIST_ENDPOINT).toBe("/api/waitlist");
    expect(WAITLIST_FRAGMENTS).toEqual({
      joined: "waitlist-joined", exists: "waitlist-exists", invalid: "waitlist-invalid", error: "waitlist-error",
    });
  });
});

describe("joinWaitlist against the endpoint (mock off)", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_WAITLIST_MOCK", "0"));
  afterEach(() => vi.unstubAllEnvs());

  it("never calls the network for an invalid address", async () => {
    const hit = vi.fn();
    server.use(http.post(endpoint(), () => { hit(); return HttpResponse.json({}); }));
    expect(await joinWaitlist("nope", "v1")).toBe("invalid");
    expect(hit).not.toHaveBeenCalled();
  });

  it("posts trimmed JSON {email, source} with JSON headers", async () => {
    let seen: { body: unknown; type: string | null; accept: string | null } | undefined;
    server.use(http.post(endpoint(), async ({ request }) => {
      seen = { body: await request.json(), type: request.headers.get("content-type"), accept: request.headers.get("accept") };
      return HttpResponse.json({ status: "joined" }, { status: 201 });
    }));
    expect(await joinWaitlist("  Ada@B.co ", "v3")).toBe("joined");
    expect(seen).toEqual({ body: { email: "Ada@B.co", source: "v3" }, type: "application/json", accept: "application/json" });
  });

  it.each([
    ["201 joined", 201, { status: "joined" }, "joined"],
    ["200 exists", 200, { status: "exists" }, "exists"],
    ["200 without a status", 200, {}, "joined"],
    ["409", 409, { error: "exists" }, "exists"],
    ["400", 400, { error: "invalid_body" }, "invalid"],
    ["422", 422, { error: "invalid_email" }, "invalid"],
    ["429", 429, { error: "rate_limited" }, "error"],
    ["413", 413, { error: "payload_too_large" }, "error"],
    ["500", 500, { error: "server_error" }, "error"],
  ] as const)("maps %s to %s", async (_label, status, body, want) => {
    server.use(http.post(endpoint(), () => HttpResponse.json(body, { status })));
    expect(await joinWaitlist("a@b.co", "v1")).toBe(want);
  });

  it("reads a 2xx with a non-JSON body as joined", async () => {
    server.use(http.post(endpoint(), () => new HttpResponse("ok", { status: 201 })));
    expect(await joinWaitlist("a@b.co", "home")).toBe("joined");
  });

  it("maps a network failure to error", async () => {
    server.use(http.post(endpoint(), () => HttpResponse.error()));
    expect(await joinWaitlist("a@b.co", "v2")).toBe("error");
  });
});

describe("joinWaitlist with the dev mock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  const settle = async (p: Promise<unknown>) => { await vi.advanceTimersByTimeAsync(700); return p; };

  it("is on in development by default, waits 700ms and never touches the network", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_WAITLIST_MOCK", "");
    const spy = vi.spyOn(globalThis, "fetch");
    let done = false;
    const p = joinWaitlist("a@b.co", "v1").then((r) => { done = true; return r; });
    await vi.advanceTimersByTimeAsync(699);
    expect(done).toBe(false);
    expect(await settle(p)).toBe("joined");
    expect(spy).not.toHaveBeenCalled();
  });

  it("is forced on by NEXT_PUBLIC_WAITLIST_MOCK=1 outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_WAITLIST_MOCK", "1");
    expect(await settle(joinWaitlist("a@b.co", "v1"))).toBe("joined");
  });

  it("answers error for an address containing 'fail'", async () => {
    vi.stubEnv("NEXT_PUBLIC_WAITLIST_MOCK", "1");
    expect(await settle(joinWaitlist("will-fail@b.co", "v1"))).toBe("error");
  });

  it("answers exists for 'taken' and for an address already sent this session, in any case", async () => {
    vi.stubEnv("NEXT_PUBLIC_WAITLIST_MOCK", "1");
    expect(await settle(joinWaitlist("taken@b.co", "v1"))).toBe("exists");
    expect(await settle(joinWaitlist("ada@b.co", "v1"))).toBe("joined");
    expect(await settle(joinWaitlist("ADA@b.co", "v2"))).toBe("exists");
  });

  it("is off in a production build unless forced", async () => {
    vi.useRealTimers();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_WAITLIST_MOCK", "");
    server.use(http.post(endpoint(), () => HttpResponse.json({ status: "exists" })));
    expect(await joinWaitlist("a@b.co", "v1")).toBe("exists");
  });
});
