import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { API, server } from "@/test/msw";
import { err, ok } from "../result";
import { createApiClient, type Decoder } from "./client";

const client = createApiClient({ baseUrl: `${API}/`, timeoutMs: 1_000 });
const any: Decoder<unknown> = (v) => ok(v);
const str: Decoder<string> = (v) => (typeof v === "string" ? ok(v) : err("expected string"));

describe("createApiClient", () => {
  it("builds URLs from a trimmed base with query params", () => {
    expect(client.baseUrl).toBe(API);
    expect(client.url("/api/v1/x", { a: "1", b: undefined, c: "a b" })).toBe(`${API}/api/v1/x?a=1&c=a+b`);
    expect(() => client.url("api/v1/x")).toThrow(/must start with/);
  });

  it("sends cookies and JSON, and decodes the response", async () => {
    let seen: Request | undefined;
    server.use(http.post(`${API}/echo`, async ({ request }) => { seen = request.clone(); return HttpResponse.json({ got: await request.json() }); }));
    const r = await client.request("/echo", { method: "POST", body: { hello: "world" }, decode: any });
    expect(r).toEqual({ ok: true, value: { got: { hello: "world" } } });
    expect(seen?.credentials).toBe("include");
    expect(seen?.headers.get("content-type")).toBe("application/json");
    expect(seen?.headers.get("accept")).toBe("application/json");
  });

  it("does not send a content type without a body", async () => {
    let type: string | null = "unset";
    server.use(http.get(`${API}/plain`, ({ request }) => { type = request.headers.get("content-type"); return HttpResponse.json(1); }));
    await client.request("/plain", { decode: any });
    expect(type).toBeNull();
  });

  it("passes non-JSON text and empty bodies to the decoder", async () => {
    server.use(
      http.get(`${API}/text`, () => HttpResponse.text("hello")),
      http.get(`${API}/empty`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${API}/blank`, () => new HttpResponse("", { status: 200, headers: { "content-type": "application/json" } })),
    );
    expect(await client.request("/text", { decode: str })).toEqual({ ok: true, value: "hello" });
    expect(await client.request("/empty", { decode: any })).toEqual({ ok: true, value: undefined });
    expect(await client.request("/blank", { decode: any })).toEqual({ ok: true, value: undefined });
  });

  it("classifies HTTP failures with the server's detail and the op", async () => {
    server.use(
      http.get(`${API}/401`, () => HttpResponse.json({ detail: "Not signed in" }, { status: 401 })),
      http.get(`${API}/422`, () => HttpResponse.json({ detail: [{ msg: "bad" }] }, { status: 422 })),
      http.get(`${API}/500`, () => HttpResponse.text("<html>oops</html>", { status: 500 })),
      http.get(`${API}/503`, () => new HttpResponse("{not json", { status: 503, headers: { "content-type": "application/json" } })),
    );
    expect(await client.request("/401", { decode: any })).toEqual({ ok: false, error: { kind: "unauthorized", op: "GET /401", status: 401, message: "Not signed in" } });
    expect(await client.request("/422", { decode: any })).toMatchObject({ ok: false, error: { kind: "http", status: 422, message: "bad" } });
    expect(await client.request("/500", { decode: any })).toMatchObject({ ok: false, error: { kind: "http", status: 500, message: "HTTP 500" } });
    expect(await client.request("/503", { decode: any })).toMatchObject({ ok: false, error: { kind: "unavailable", status: 503 } });
  });

  it("reports malformed JSON and failed decoding as invalid_response", async () => {
    server.use(
      http.get(`${API}/bad-json`, () => new HttpResponse("{nope", { headers: { "content-type": "application/json" } })),
      http.get(`${API}/wrong-shape`, () => HttpResponse.json(42)),
    );
    expect(await client.request("/bad-json", { decode: any })).toMatchObject({ ok: false, error: { kind: "invalid_response", status: 200, message: expect.stringMatching(/not valid JSON/) } });
    expect(await client.request("/wrong-shape", { decode: str })).toMatchObject({ ok: false, error: { kind: "invalid_response", message: "expected string" } });
  });

  it("reports a network failure", async () => {
    server.use(http.get(`${API}/down`, () => HttpResponse.error()));
    expect(await client.request("/down", { decode: any })).toMatchObject({ ok: false, error: { kind: "network", op: "GET /down" } });
  });

  it("times out slow responses with the configured or per-call deadline", async () => {
    server.use(http.get(`${API}/slow`, async () => { await delay("infinite"); return HttpResponse.json(1); }));
    expect(await client.request("/slow", { decode: any, timeoutMs: 30 })).toEqual({ ok: false, error: { kind: "timeout", op: "GET /slow", timeoutMs: 30, message: "timed out after 30ms" } });
    const fast = createApiClient({ baseUrl: API, timeoutMs: 20 });
    expect(await fast.request("/slow", { decode: any })).toMatchObject({ ok: false, error: { kind: "timeout", timeoutMs: 20 } });
  });

  it("honours a caller's AbortSignal, before and during the request", async () => {
    server.use(http.get(`${API}/slow`, async () => { await delay("infinite"); return HttpResponse.json(1); }));
    const pre = new AbortController(); pre.abort();
    expect(await client.request("/slow", { decode: any, signal: pre.signal })).toMatchObject({ ok: false, error: { kind: "aborted" } });
    const mid = new AbortController();
    const p = client.request("/slow", { decode: any, signal: mid.signal });
    setTimeout(() => mid.abort(), 10);
    expect(await p).toMatchObject({ ok: false, error: { kind: "aborted", message: "request was cancelled" } });
  });

  it("maps failures while reading the body", async () => {
    const broken = (reason: () => Error | void) => vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      return { ok: true, status: 200, headers: new Headers({ "content-type": "application/json" }), text: () => new Promise<string>((_r, reject) => {
        const e = reason();
        if (e) reject(e); else init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }) } as unknown as Response;
    });
    const net = createApiClient({ baseUrl: API, timeoutMs: 1_000, fetch: broken(() => new TypeError("socket hang up")) });
    expect(await net.request("/x", { decode: any })).toMatchObject({ ok: false, error: { kind: "network", message: "socket hang up" } });
    const slow = createApiClient({ baseUrl: API, timeoutMs: 20, fetch: broken(() => undefined) });
    expect(await slow.request("/x", { decode: any })).toMatchObject({ ok: false, error: { kind: "timeout", message: expect.stringMatching(/reading the body/) } });
    const c = new AbortController();
    const p = slow.request("/x", { decode: any, signal: c.signal, timeoutMs: 1_000 });
    setTimeout(() => c.abort(), 5);
    expect(await p).toMatchObject({ ok: false, error: { kind: "aborted" } });
    const odd = createApiClient({ baseUrl: API, timeoutMs: 1_000, fetch: vi.fn(async () => { throw "string failure"; }) });
    expect(await odd.request("/x", { decode: any })).toMatchObject({ ok: false, error: { kind: "network", message: "string failure" } });
    const oddBody = createApiClient({ baseUrl: API, timeoutMs: 1_000, fetch: broken(() => { throw "x"; }) });
    await expect(oddBody.request("/x", { decode: any })).resolves.toMatchObject({ ok: false, error: { kind: "network", message: "x" } });
  });

  it("cleans up its timer and abort listener", async () => {
    const c = new AbortController();
    const remove = vi.spyOn(c.signal, "removeEventListener");
    server.use(http.get(`${API}/ok`, () => HttpResponse.json(1)));
    await client.request("/ok", { decode: any, signal: c.signal });
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
