import { act, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardingProps, OnboardingSnap } from "@/components/app/screens/Onboarding";
import { API, ME_BODY, server, testConfig } from "@/test/msw";
import { kb, kbHandlers, productRow, resetKb } from "@/test/kbMock";
import { router } from "@/test/router";
import { SessionProvider } from "./SessionProvider";
import { OnboardingScreen } from "./OnboardingScreen";

const seen: { props?: OnboardingProps } = {};
// jsdom's FormData can't go through Node's fetch, so the upload itself is stubbed (lib/api covers it in node).
const logo = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("@/lib/api", async (orig) => {
  const m = await orig<typeof import("@/lib/api")>();
  return { ...m, workspaceApiFor: (c: Parameters<typeof m.workspaceApiFor>[0]) => ({ ...m.workspaceApiFor(c), uploadLogo: logo.upload }) };
});
vi.mock("@/components/app/screens/Onboarding", () => ({
  Onboarding: (props: OnboardingProps) => { seen.props = props; return <p>step {props.initialStep}</p>; },
}));

const WS = {
  id: ME_BODY.organization.id, name: "Kilima Dairies", slug: "kilima", timezone: "nbo", team_size: "small",
  logo_url: null, website: "https://kilima.co.ke", onboarded: false, skipped: [4],
  site_pages: [{ path: "/", title: "Home" }], site_highlights: ["Milk"], invites: [], product: null,
};
let patches: unknown[] = [];

function workspace(body: unknown, status = 200) {
  server.use(http.get(`${API}/api/v1/workspace`, () => HttpResponse.json(body as never, { status })));
}

beforeEach(() => {
  seen.props = undefined; patches = []; resetKb({ products: [] });
  server.use(
    ...kbHandlers,
    http.patch(`${API}/api/v1/workspace`, async ({ request }) => { const b = await request.json(); patches.push(b); return HttpResponse.json({ ...WS, ...(b as object) }); }),
    http.patch(`${API}/api/v1/products/:id`, async ({ params, request }) => {
      const b = (await request.json()) as { name?: string; description?: string };
      return HttpResponse.json(productRow(String(params.id), b.name ?? "Kilima Dairies", "2026-09-01T08:00:00Z", b.description ?? null));
    }),
  );
});

const snap = (over: Partial<OnboardingSnap> = {}): OnboardingSnap => ({
  name: " Kilima ", slug: " kilima ", tz: "nbo", team: "small", product: " Fresh milk ", pitch: " Daily ", site: "",
  invites: [[" a@kilima.co.ke ", "admin"], ["", "member"], ["b@kilima.co.ke", "owner"]], skipped: [4], complete: false, ...over,
});

async function open() {
  render(<SessionProvider config={testConfig()} navigator={{ assign: vi.fn(), replace: vi.fn() }}><OnboardingScreen /></SessionProvider>);
  await screen.findByText(/^step /);
  return seen.props!.live!;
}

describe("PersistentOnboarding", () => {
  it("sends a finished workspace to the app", async () => {
    workspace({ ...WS, onboarded: true });
    render(<SessionProvider config={testConfig()} navigator={{ assign: vi.fn(), replace: vi.fn() }}><OnboardingScreen /></SessionProvider>);
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/app"));
    expect(document.cookie).toContain("corral_onboarded=1");
  });

  it("resumes at the first step not done or skipped, seeded from the workspace", async () => {
    workspace(WS);
    const live = await open();
    expect(screen.getByText("step 1")).toBeInTheDocument();
    expect(live.seed).toMatchObject({ name: "Kilima Dairies", tz: "nbo", team: "small", site: "https://kilima.co.ke", pages: [{ path: "/", title: "Home" }] });
    expect(seen.props!.skipped).toEqual([4]);
  });

  it("resumes past steps already done", async () => {
    workspace({ ...WS, product: { id: "p9", name: "Milk", description: null }, invites: [{ email: "a@x.co", role: "member" }] });
    const live = await open();
    expect(screen.getByText("step 6")).toBeInTheDocument();
    expect(live.seed.product).toBe("Milk");
    expect(live.seed.invites).toEqual([["a@x.co", "member"]]);
  });

  it("falls back to the session's organization when the workspace fails to load", async () => {
    workspace({ error: "boom", detail: "boom" }, 500);
    const live = await open();
    expect(live.seed).toMatchObject({ name: "Kilima Dairies", slug: "kilima", tz: "nbo", team: "small", product: "" });
    seen.props!.onExit!();
    expect(document.cookie).toContain("corral_onboarded=1");
  });

  it("saves the workspace, then creates the product once and updates it after", async () => {
    workspace(WS);
    const live = await open();
    expect(await act(() => live.onSave(snap()))).toBeNull();
    expect(patches[0]).toEqual({ name: "Kilima", slug: "kilima", timezone: "nbo", team_size: "small", skipped: [4], complete: false,
      invites: [{ email: "a@kilima.co.ke", role: "admin" }, { email: "b@kilima.co.ke", role: "member" }] });
    expect(kb.products.map((p) => p.name)).toEqual(["Fresh milk"]);
    expect(await live.onSave(snap({ name: " ", slug: "", pitch: "" }))).toBeNull();
    expect(patches[1]).not.toHaveProperty("name");
    expect(kb.products).toHaveLength(1);
  });

  it("skips the product when it has no name and reports a failed save", async () => {
    workspace(WS);
    const live = await open();
    expect(await live.onSave(snap({ product: " " }))).toBeNull();
    expect(kb.products).toHaveLength(0);
    server.use(http.patch(`${API}/api/v1/workspace`, () => HttpResponse.json({ error: "slug_taken", detail: "That URL is taken." }, { status: 409 })));
    expect(await live.onSave(snap())).toMatch(/taken/i);
  });

  it("adopts a product that already has the name", async () => {
    workspace(WS);
    resetKb({ products: [productRow("p7", "Fresh milk")] });
    const live = await open();
    expect(await live.onSave(snap())).toBeNull();
    expect(await live.onSave(snap())).toBeNull();
  });

  it("reports a name clash it cannot resolve, and other create failures", async () => {
    workspace(WS);
    const live = await open();
    server.use(
      http.post(`${API}/api/v1/products`, () => HttpResponse.json({ error: "name_taken", detail: "A product has that name." }, { status: 409 })),
      http.get(`${API}/api/v1/products`, () => HttpResponse.json([])),
    );
    expect(await live.onSave(snap())).toMatch(/has that name/);
    server.use(http.post(`${API}/api/v1/products`, () => HttpResponse.json({ error: "boom", detail: "Server broke." }, { status: 500 })));
    expect(await live.onSave(snap())).toBeTruthy();
  });

  it("reports a failed product update", async () => {
    workspace({ ...WS, product: { id: "p9", name: "Milk", description: null } });
    const live = await open();
    server.use(http.patch(`${API}/api/v1/products/:id`, () => HttpResponse.json({ error: "boom", detail: "Nope." }, { status: 500 })));
    expect(await live.onSave(snap())).toBeTruthy();
    resetKb({ products: [productRow("p7", "Fresh milk")] });
  });

  it("checks logos before uploading them", async () => {
    workspace(WS);
    const live = await open();
    expect(await live.onLogo(new File([new Uint8Array(3 * 1024 * 1024)], "big.png", { type: "image/png" }))).toEqual({ error: "Logos can be up to 2 MB." });
    expect(await live.onLogo(new File(["x"], "a.svg", { type: "image/svg+xml" }))).toEqual({ error: "Use a PNG, JPEG, GIF or WebP." });
    logo.upload.mockResolvedValueOnce({ ok: true, value: { logoUrl: "https://cdn.test/l.png" } });
    expect(await live.onLogo(new File(["x"], "a.png", { type: "image/png" }))).toEqual({ url: "https://cdn.test/l.png" });
    logo.upload.mockResolvedValueOnce({ ok: true, value: { logoUrl: null } });
    expect(await live.onLogo(new File(["x"], "a"))).toEqual({ url: "" });
    logo.upload.mockResolvedValueOnce({ ok: false, error: { kind: "http", status: 503, code: "storage_unconfigured", message: "No storage." } });
    expect(await live.onLogo(new File(["x"], "a.png", { type: "image/png" }))).toEqual({ error: "No storage." });
  });

  it("reads the site and keeps what it found", async () => {
    workspace(WS);
    const live = await open();
    server.use(http.post(`${API}/api/v1/workspace/site`, () => HttpResponse.json({ ...WS, site_pages: [{ path: "/a", title: "A" }], site_highlights: ["B"] })));
    expect(await act(() => live.onReadSite("https://kilima.co.ke"))).toEqual({ pages: [{ path: "/a", title: "A" }], highlights: ["B"] });
    server.use(http.post(`${API}/api/v1/workspace/site`, () => HttpResponse.json({ ...WS, site_pages: [] })));
    expect(await live.onReadSite("https://kilima.co.ke")).toEqual({ error: "That page had nothing Corral could read." });
    server.use(http.post(`${API}/api/v1/workspace/site`, () => HttpResponse.json({ error: "site_unreachable", detail: "Unreachable." }, { status: 422 })));
    expect(await live.onReadSite("https://kilima.co.ke")).toEqual({ error: "Unreachable." });
  });
});

describe("OnboardingScreen while the session loads", () => {
  it("shows the loading line, then the error", async () => {
    server.use(http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json({ error: "boom", detail: "Server broke." }, { status: 500 })));
    render(<SessionProvider config={testConfig()} navigator={{ assign: vi.fn(), replace: vi.fn() }}><OnboardingScreen /></SessionProvider>);
    expect(screen.getByText("Loading your workspace")).toBeInTheDocument();
    expect(await screen.findByText(/Server broke|Couldn't load/)).toBeInTheDocument();
  });
});
