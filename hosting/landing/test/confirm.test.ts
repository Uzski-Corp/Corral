import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOSEND_SEND_URL, CONFIRM_FROM, CONFIRM_REPLY_TO, CONFIRM_TEMPLATE_ID, sendConfirmation } from "../src/confirm";
import { handleWaitlist } from "../src/waitlist";
import { makeEnv, postForm, postJson } from "./helpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ok = () => vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));

/** A ctx whose waitUntil collects the promises, so a test can await what would run after the response. */
function makeCtx() {
  const pending: Promise<unknown>[] = [];
  return { pending, ctx: { waitUntil: (p: Promise<unknown>) => void pending.push(p) } };
}

describe("sendConfirmation", () => {
  it("posts one email to AutoSend from Corral, replies to corral@, using the AutoSend template", async () => {
    const fetcher = ok();
    expect(await sendConfirmation({ AUTOSEND_API_KEY: "as_key" }, "wanjiru@kilima.co.ke", fetcher)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(AUTOSEND_SEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ authorization: "Bearer as_key", "content-type": "application/json" });
    const sent = JSON.parse(String(init.body));
    expect(sent.to).toEqual({ email: "wanjiru@kilima.co.ke" });
    expect(sent.from).toEqual(CONFIRM_FROM);
    expect(sent.replyTo).toEqual({ email: CONFIRM_REPLY_TO });
    expect(sent.templateId).toBe(CONFIRM_TEMPLATE_ID);
    expect(sent).not.toHaveProperty("html");
  });

  it("does nothing without an API key", async () => {
    const fetcher = ok();
    expect(await sendConfirmation({}, "a@b.co", fetcher)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("logs and returns false when AutoSend refuses", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response("bad sender", { status: 400 }));
    expect(await sendConfirmation({ AUTOSEND_API_KEY: "k" }, "a@b.co", fetcher)).toBe(false);
    expect(log).toHaveBeenCalledWith("waitlist: confirmation not sent", 400, "bad sender");
  });

  it("logs and returns false when the refusal body can't be read", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = new Response("x", { status: 502 });
    vi.spyOn(res, "text").mockRejectedValue(new Error("gone"));
    expect(await sendConfirmation({ AUTOSEND_API_KEY: "k" }, "a@b.co", vi.fn(async () => res))).toBe(false);
    expect(log).toHaveBeenCalledWith("waitlist: confirmation not sent", 502, "");
  });

  it("logs and returns false when the request throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetcher = vi.fn(async () => { throw new Error("network"); });
    expect(await sendConfirmation({ AUTOSEND_API_KEY: "k" }, "a@b.co", fetcher)).toBe(false);
    expect(log).toHaveBeenCalledWith("waitlist: confirmation failed", expect.any(Error));
  });

  it("uses the global fetch by default", async () => {
    const fetcher = ok();
    vi.stubGlobal("fetch", fetcher);
    expect(await sendConfirmation({ AUTOSEND_API_KEY: "k" }, "a@b.co")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/waitlist sends the confirmation", () => {
  it("once for a new address, after the response, to the normalized address", async () => {
    const fetcher = ok();
    vi.stubGlobal("fetch", fetcher);
    const { env } = makeEnv();
    const { ctx, pending } = makeCtx();
    const res = await handleWaitlist(postJson({ email: "  Wanjiru@Kilima.co.ke ", source: "home" }), { ...env, AUTOSEND_API_KEY: "k" }, ctx);
    expect(res.status).toBe(201);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).to).toEqual({ email: "wanjiru@kilima.co.ke" });
  });

  it("not again for an address already on the list", async () => {
    const fetcher = ok();
    vi.stubGlobal("fetch", fetcher);
    const { env } = makeEnv();
    const withKey = { ...env, AUTOSEND_API_KEY: "k" };
    await handleWaitlist(postJson({ email: "a@b.co", source: "home" }), withKey, makeCtx().ctx);
    const { ctx, pending } = makeCtx();
    const res = await handleWaitlist(postJson({ email: "A@B.co", source: "site" }), withKey, ctx);
    expect(res.status).toBe(200);
    expect(pending).toHaveLength(0);
  });

  it("for a new address from the no-JS form too", async () => {
    const { env } = makeEnv();
    const { ctx, pending } = makeCtx();
    const res = await handleWaitlist(postForm({ email: "a@b.co", source: "site" }), env, ctx);
    expect(res.status).toBe(303);
    expect(pending).toHaveLength(1);
    expect(await pending[0]).toBe(false);
  });

  it("not for an invalid address", async () => {
    const { env } = makeEnv();
    const { ctx, pending } = makeCtx();
    expect((await handleWaitlist(postJson({ email: "nope", source: "home" }), env, ctx)).status).toBe(422);
    expect(pending).toHaveLength(0);
  });
});
