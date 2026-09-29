import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { API, LOGOUT_URL, ME_BODY, server, testConfig, unauthorized } from "@/test/msw";
import { AUTH_PATHS, decodeLogout, decodeMe, decodeRefresh, displayName, roleLabel } from "./auth";
import { authApiFor } from "./index";

const api = authApiFor(testConfig());
const clone = () => structuredClone(ME_BODY) as unknown as Record<string, Record<string, unknown>> & { role: unknown };

describe("decodeMe", () => {
  it("maps the API's snake_case into the client model", () => {
    expect(decodeMe(ME_BODY)).toEqual({ ok: true, value: {
      user: { id: ME_BODY.user.id, email: "wanjiru@kilima.co.ke", firstName: "Wanjiru", lastName: "Mwangi", profilePictureUrl: "https://img.test/w.jpg" },
      organization: { id: ME_BODY.organization.id, name: "Kilima Dairies", slug: "kilima" },
      role: "owner",
    } });
  });

  it("treats missing or empty names and unsafe picture URLs as absent", () => {
    const b = clone();
    b.user.first_name = null; b.user.last_name = ""; b.user.profile_picture_url = "javascript:alert(1)";
    delete b.user.profile_picture_url;
    const r = decodeMe(b);
    expect(r.ok && r.value.user).toMatchObject({ firstName: null, lastName: null, profilePictureUrl: null });
    b.user.profile_picture_url = "javascript:alert(1)";
    const r2 = decodeMe(b);
    expect(r2.ok && r2.value.user.profilePictureUrl).toBeNull();
  });

  it("keeps unknown roles instead of failing sign-in", () => {
    const b = clone(); b.role = "billing";
    expect(decodeMe(b)).toMatchObject({ ok: true, value: { role: "billing" } });
  });

  it.each([
    ["not an object", () => "x", /me: expected an object/],
    ["no user", () => ({ ...clone(), user: null }), /me.user: expected an object/],
    ["no organization", () => ({ ...clone(), organization: [] }), /me.organization/],
    ["user.id", () => { const b = clone(); b.user.id = ""; return b; }, /me.user.id/],
    ["user.email", () => { const b = clone(); b.user.email = 1; return b; }, /me.user.email/],
    ["user.first_name", () => { const b = clone(); b.user.first_name = 1; return b; }, /me.user.first_name/],
    ["user.last_name", () => { const b = clone(); b.user.last_name = false; return b; }, /me.user.last_name/],
    ["user.profile_picture_url", () => { const b = clone(); b.user.profile_picture_url = 3; return b; }, /profile_picture_url/],
    ["organization.id", () => { const b = clone(); b.organization.id = null; return b; }, /me.organization.id: expected string, got null/],
    ["organization.name", () => { const b = clone(); b.organization.name = 1; return b; }, /me.organization.name/],
    ["organization.slug", () => { const b = clone(); delete b.organization.slug; return b; }, /me.organization.slug/],
    ["role", () => { const b = clone(); b.role = ""; return b; }, /me.role/],
  ])("rejects %s", (_name, body, message) => {
    const r = decodeMe(body());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(message);
  });
});

describe("decodeRefresh / decodeLogout", () => {
  it("decodes the refresh flag", () => {
    expect(decodeRefresh({ refreshed: false })).toEqual({ ok: true, value: { refreshed: false } });
    expect(decodeRefresh({ refreshed: "yes" }).ok).toBe(false);
    expect(decodeRefresh(null).ok).toBe(false);
  });

  it("accepts only http(s) logout URLs", () => {
    expect(decodeLogout({ logout_url: LOGOUT_URL })).toEqual({ ok: true, value: { logoutUrl: LOGOUT_URL } });
    for (const bad of ["javascript:alert(1)", "/relative", "::", 5]) expect(decodeLogout({ logout_url: bad }).ok).toBe(false);
    expect(decodeLogout([]).ok).toBe(false);
  });
});

describe("auth API", () => {
  it("builds the login redirect URL", () => {
    expect(api.loginUrl()).toBe(`${API}${AUTH_PATHS.login}`);
    expect(api.loginUrl({ screenHint: "sign-up" })).toBe(`${API}${AUTH_PATHS.login}?screen_hint=sign-up`);
  });

  it("GETs /me, POSTs refresh and logout", async () => {
    expect(await api.me()).toMatchObject({ ok: true, value: { organization: { name: "Kilima Dairies" } } });
    expect(await api.refresh()).toEqual({ ok: true, value: { refreshed: true } });
    expect(await api.logout()).toEqual({ ok: true, value: { logoutUrl: LOGOUT_URL } });
  });

  it("surfaces 401 and the 503-with-body refresh as typed errors", async () => {
    server.use(
      http.get(`${API}${AUTH_PATHS.me}`, unauthorized),
      http.post(`${API}${AUTH_PATHS.refresh}`, () => HttpResponse.json({ refreshed: false }, { status: 503 })),
    );
    expect(await api.me()).toMatchObject({ ok: false, error: { kind: "unauthorized", op: "GET /api/v1/auth/me" } });
    expect(await api.refresh()).toMatchObject({ ok: false, error: { kind: "unavailable", status: 503, op: "POST /api/v1/auth/refresh" } });
  });
});

describe("displayName / roleLabel", () => {
  const u = { id: "1", email: "a@b.co", firstName: null, lastName: null, profilePictureUrl: null };
  it("joins names and falls back to the email", () => {
    expect(displayName({ ...u, firstName: "Amina" })).toBe("Amina");
    expect(displayName({ ...u, firstName: "Amina", lastName: "Otieno" })).toBe("Amina Otieno");
    expect(displayName(u)).toBe("a@b.co");
  });
  it("capitalises roles", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("")).toBe("");
  });
});
