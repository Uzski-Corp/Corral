// @vitest-environment node
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API, server, testConfig } from "@/test/msw";
import { workspaceApiFor } from "./index";
import { decodeWorkspace, SITE_TIMEOUT_MS, WORKSPACE_PATHS } from "./workspace";

const WS = {
  id: "w1", name: "Kilima", slug: "kilima", timezone: "nbo", team_size: "small", logo_url: null, website: null,
  onboarded: false, skipped: [4], site_pages: [{ path: "/", title: "Home" }], site_highlights: ["Milk"],
  invites: [{ email: "a@x.co", role: "admin" }], product: { id: "p1", name: "Milk", description: null },
};
const api = workspaceApiFor(testConfig());

describe("decodeWorkspace", () => {
  it("camel-cases a WorkspaceOut", () => {
    expect(decodeWorkspace(WS)).toEqual({ ok: true, value: {
      id: "w1", name: "Kilima", slug: "kilima", timezone: "nbo", teamSize: "small", logoUrl: null, website: null,
      onboarded: false, skipped: [4], sitePages: [{ path: "/", title: "Home" }], siteHighlights: ["Milk"],
      invites: [{ email: "a@x.co", role: "admin" }], product: { id: "p1", name: "Milk", description: null },
    } });
    expect(decodeWorkspace({ ...WS, timezone: undefined, logo_url: undefined, website: undefined, team_size: null, product: null })).toMatchObject({ ok: true, value: { timezone: null, logoUrl: null, website: null, teamSize: null, product: null } });
    expect(decodeWorkspace({ ...WS, product: { id: "p1", name: "Milk" } })).toMatchObject({ ok: true, value: { product: { description: null } } });
  });

  it.each([
    ["not an object", null],
    ["id", { ...WS, id: "" }],
    ["name", { ...WS, name: 1 }],
    ["slug", { ...WS, slug: 1 }],
    ["timezone", { ...WS, timezone: 1 }],
    ["team_size", { ...WS, team_size: "huge" }],
    ["logo_url", { ...WS, logo_url: 1 }],
    ["website", { ...WS, website: 1 }],
    ["onboarded", { ...WS, onboarded: "yes" }],
    ["skipped", { ...WS, skipped: ["4"] }],
    ["site_pages list", { ...WS, site_pages: {} }],
    ["site_pages object", { ...WS, site_pages: [1] }],
    ["site_pages path", { ...WS, site_pages: [{ title: "x" }] }],
    ["site_pages title", { ...WS, site_pages: [{ path: "/" }] }],
    ["site_highlights", { ...WS, site_highlights: [1] }],
    ["invites list", { ...WS, invites: {} }],
    ["invites object", { ...WS, invites: [1] }],
    ["invites email", { ...WS, invites: [{ role: "admin" }] }],
    ["invites role", { ...WS, invites: [{ email: "a@x.co", role: "owner" }] }],
    ["product object", { ...WS, product: 1 }],
    ["product id", { ...WS, product: { name: "x" } }],
    ["product name", { ...WS, product: { id: "p", name: 1 } }],
    ["product description", { ...WS, product: { id: "p", name: "x", description: 1 } }],
  ])("rejects a bad %s", (_, input) => {
    expect(decodeWorkspace(input).ok).toBe(false);
  });
});

describe("workspace api", () => {
  it("gets, updates and reads the site", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.get(`${API}${WORKSPACE_PATHS.workspace}`, () => HttpResponse.json(WS)),
      http.patch(`${API}${WORKSPACE_PATHS.workspace}`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(WS); }),
      http.post(`${API}${WORKSPACE_PATHS.site}`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json(WS); }),
    );
    expect((await api.get()).ok).toBe(true);
    expect((await api.update({ name: "K" })).ok).toBe(true);
    expect((await api.readSite("https://kilima.co.ke")).ok).toBe(true);
    expect(bodies).toEqual([{ name: "K" }, { url: "https://kilima.co.ke" }]);
    expect(SITE_TIMEOUT_MS).toBeGreaterThan(10_000);
  });

  it("uploads a logo and a profile picture as multipart", async () => {
    const names: string[] = [];
    const grab = async (request: Request) => { const f = (await request.formData()).get("file") as File; names.push(f.name); };
    server.use(
      http.post(`${API}${WORKSPACE_PATHS.logo}`, async ({ request }) => { await grab(request); return HttpResponse.json({ ...WS, logo_url: "https://cdn.test/l.png" }); }),
      http.post(`${API}${WORKSPACE_PATHS.picture}`, async ({ request }) => { await grab(request); return HttpResponse.json({ profile_picture_url: "https://cdn.test/me.png" }); }),
    );
    expect(await api.uploadLogo(new File(["x"], "mark.png", { type: "image/png" }))).toMatchObject({ ok: true, value: { logoUrl: "https://cdn.test/l.png" } });
    expect((await api.uploadLogo(new Blob(["x"], { type: "image/png" }))).ok).toBe(true);
    expect(await api.uploadPicture(new File(["x"], "me.png", { type: "image/png" }))).toEqual({ ok: true, value: { pictureUrl: "https://cdn.test/me.png" } });
    expect((await api.uploadPicture(new Blob(["x"]))).ok).toBe(true);
    expect(names).toEqual(["mark.png", "logo", "me.png", "photo"]);
  });

  it.each([[null], [{}], [{ profile_picture_url: "" }]])("rejects a picture reply %j", async (body) => {
    server.use(http.post(`${API}${WORKSPACE_PATHS.picture}`, () => HttpResponse.json(body)));
    expect((await api.uploadPicture(new Blob(["x"]))).ok).toBe(false);
  });
});
