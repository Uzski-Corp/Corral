// @vitest-environment node
// (Node: its fetch and FormData/File are the same implementation; jsdom’s FormData can’t go through Node’s fetch.)
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { API, server } from "@/test/msw";
import { ok } from "../result";
import { createApiClient, xhrFetch, type Decoder } from "./client";

const any: Decoder<unknown> = (v) => ok(v);

/** A scripted XMLHttpRequest: records what was sent and answers when the test says so. */
class FakeXhr {
  static last: FakeXhr;
  method = ""; url = ""; withCredentials = false; status = 0; statusText = ""; responseText = "";
  headers: Record<string, string> = {}; body: unknown; responseHeaders = "";
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; onabort: (() => void) | null = null;
  aborted = false;
  constructor() { FakeXhr.last = this; }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  getAllResponseHeaders() { return this.responseHeaders; }
  send(body: unknown) { this.body = body; }
  abort() { this.aborted = true; this.onabort?.(); }
  answer(status: number, text: string, headers = "content-type: application/json\r\nretry-after: 3\r\n") {
    this.status = status; this.responseText = text; this.responseHeaders = headers; this.onload?.();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("form bodies", () => {
  it("sends multipart without a JSON content type (fetch path)", async () => {
    let type: string | null = "unset";
    let name: string | undefined;
    server.use(http.post(`${API}/up`, async ({ request }) => {
      type = request.headers.get("content-type");
      name = ((await request.formData()).get("file") as File).name;
      return HttpResponse.json({ ok: 1 });
    }));
    const form = new FormData();
    form.append("file", new File(["x"], "a.pdf"));
    const client = createApiClient({ baseUrl: API, timeoutMs: 1000 });
    expect(await client.request("/up", { method: "POST", form, body: { ignored: true }, decode: any })).toEqual({ ok: true, value: { ok: 1 } });
    expect(type).toMatch(/^multipart\/form-data; boundary=/);
    expect(name).toBe("a.pdf");
  });

  it("uses XMLHttpRequest for progress, and ignores it when fetch is injected", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const client = createApiClient({ baseUrl: API, timeoutMs: 1000 });
    const onUploadProgress = vi.fn();
    const form = new FormData();
    const pending = client.request("/up", { method: "POST", form, onUploadProgress, decode: any });
    await Promise.resolve();
    const x = FakeXhr.last;
    expect(x).toMatchObject({ method: "POST", url: `${API}/up`, withCredentials: true, body: form });
    expect(x.headers).toEqual({ Accept: "application/json" });
    x.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 200 });
    x.upload.onprogress?.({ lengthComputable: false, loaded: 1, total: 0 });
    x.upload.onprogress?.({ lengthComputable: true, loaded: 300, total: 200 });
    expect(onUploadProgress.mock.calls).toEqual([[25], [100]]);
    x.answer(202, JSON.stringify({ id: "s1" }));
    expect(await pending).toEqual({ ok: true, value: { id: "s1" } });

    const fetchImpl = vi.fn(async () => HttpResponse.json({ via: "fetch" }));
    const injected = createApiClient({ baseUrl: API, timeoutMs: 1000, fetch: fetchImpl as unknown as typeof fetch });
    expect(await injected.request("/up", { method: "POST", form, onUploadProgress, decode: any })).toEqual({ ok: true, value: { via: "fetch" } });
  });

  it("maps XHR answers and failures like fetch", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const client = createApiClient({ baseUrl: API, timeoutMs: 1000 });
    const form = new FormData();
    const p1 = client.request("/up", { method: "POST", form, onUploadProgress: () => {}, decode: any });
    await Promise.resolve();
    FakeXhr.last.answer(429, JSON.stringify({ error: "rate_limited", detail: "Slow down." }));
    expect(await p1).toMatchObject({ ok: false, error: { kind: "http", status: 429, retryAfter: "3", code: "rate_limited" } });

    const p2 = client.request("/up", { method: "POST", form, onUploadProgress: () => {}, decode: any });
    await Promise.resolve();
    FakeXhr.last.onerror?.();
    expect(await p2).toMatchObject({ ok: false, error: { kind: "network" } });

    const c = new AbortController();
    const p3 = client.request("/up", { method: "POST", form, onUploadProgress: () => {}, decode: any, signal: c.signal });
    await Promise.resolve();
    c.abort();
    expect(await p3).toMatchObject({ ok: false, error: { kind: "aborted" } });
    expect(FakeXhr.last.aborted).toBe(true);
  });

  it("xhrFetch: empty answers, header parsing and an already-aborted signal", async () => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    const p = xhrFetch(`${API}/x`, {}, () => {});
    const x = FakeXhr.last;
    expect(x.method).toBe("GET");
    expect(x.withCredentials).toBe(false);
    x.answer(204, "ignored", "x-a: 1\r\nbroken\r\n");
    const res = await p;
    expect(res.status).toBe(204);
    expect(res.headers.get("x-a")).toBe("1");
    expect(await res.text()).toBe("");

    const c = new AbortController(); c.abort();
    await expect(xhrFetch(`${API}/x`, { signal: c.signal }, () => {})).rejects.toMatchObject({ name: "AbortError" });
  });
});
