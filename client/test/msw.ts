/**
 * MSW mock of the Corral API auth contract (PR #2). Tests override single handlers with
 * `server.use(...)` for failure cases.
 */
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import type { ClientConfig } from "@/lib/config";

export const API = "http://api.test";

export const testConfig = (over: Partial<ClientConfig> = {}): ClientConfig => ({
  mode: "live", apiUrl: API, sessionCookie: "wos_session", reviewStates: true, apiTimeoutMs: 2_000, ...over,
});

export const ME_BODY = {
  user: { id: "0b6b4c1e-1111-4a53-9c1e-2d3f5a7b9c01", email: "wanjiru@kilima.co.ke", first_name: "Wanjiru", last_name: "Mwangi", profile_picture_url: "https://img.test/w.jpg" },
  organization: { id: "5f2a0c8e-2222-4b1d-8e3f-6a7b8c9d0e12", name: "Kilima Dairies", slug: "kilima" },
  role: "owner",
};
export const LOGOUT_URL = "https://auth.workos.test/logout?session_id=s_1";
/** Email codes the mock API knows (same as review mode): this one signs in, EXPIRED_CODE has expired. */
export const GOOD_CODE = "123456";
export const EXPIRED_CODE = "111111";

const emptyActivity = [
  http.get(`${API}/api/v1/inbox/summary`, () => HttpResponse.json({ needs_you: 0 })),
  http.get(`${API}/api/v1/inbox`, () => HttpResponse.json([])),
  http.patch(`${API}/api/v1/inbox/:id`, async ({ request }) => HttpResponse.json(await request.json())),
  http.post(`${API}/api/v1/inbox/:id/send`, async ({ request }) => HttpResponse.json(await request.json())),
  http.get(`${API}/api/v1/sequences`, () => HttpResponse.json([])),
  http.post(`${API}/api/v1/sequences`, async ({ request }) => HttpResponse.json({ id: "new", ...(await request.json() as object) }, { status: 201 })),
  http.patch(`${API}/api/v1/sequences/:id`, async ({ request }) => HttpResponse.json(await request.json())),
  http.get(`${API}/api/v1/mailboxes`, () => HttpResponse.json({ mailboxes: [], sent: 0, cap: 0, attention: 0 })),
  http.get(`${API}/api/v1/discovery/runs`, () => HttpResponse.json({ runs: [], credits: { month: 0, used: 0, left: 0 } })),
  http.get(`${API}/api/v1/discovery/credits`, () => HttpResponse.json({ month: 0, used: 0, left: 0 })),
  http.post(`${API}/api/v1/discovery/runs`, async ({ request }) => HttpResponse.json({ id: "run", status: "queued", ...(await request.json() as object) }, { status: 201 })),
  http.get(`${API}/api/v1/integrations`, () => HttpResponse.json([])),
  http.patch(`${API}/api/v1/integrations/:provider`, async ({ params, request }) => HttpResponse.json({ provider: params.provider, ...(await request.json() as object) })),
  http.get(`${API}/api/v1/workspace/members`, () => HttpResponse.json([])),
  http.get(`${API}/api/v1/workspace`, () => HttpResponse.json({
    id: ME_BODY.organization.id, name: ME_BODY.organization.name, slug: ME_BODY.organization.slug,
    timezone: null, team_size: null, logo_url: null, website: null, onboarded: true,
    skipped: [], site_pages: [], site_highlights: [], invites: [], product: null,
  })),
  http.get(`${API}/api/v1/developers/keys`, () => HttpResponse.json([])),
  http.post(`${API}/api/v1/developers/keys`, () => HttpResponse.json({ id: "key_new", secret: "crl_test_secret", last4: "cret" }, { status: 201 })),
  http.get(`${API}/api/v1/developers/connections`, () => HttpResponse.json([])),
  http.get(`${API}/api/v1/leads`, () => HttpResponse.json([])),
];

export const handlers = [
  ...emptyActivity,
  http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(ME_BODY)),
  http.post(`${API}/api/v1/auth/refresh`, () => HttpResponse.json({ refreshed: true })),
  http.post(`${API}/api/v1/auth/logout`, () => HttpResponse.json({ logout_url: LOGOUT_URL })),
  http.post(`${API}/api/v1/auth/code/send`, () => HttpResponse.json({ sent: true }, { status: 202 })),
  http.post(`${API}/api/v1/auth/code/verify`, async ({ request }) => {
    const { code } = (await request.json()) as { code?: string };
    if (code === GOOD_CODE) return HttpResponse.json({ redirect_to: "http://localhost:3000" });
    if (code === EXPIRED_CODE) return codeError("code_expired");
    return codeError("code_invalid");
  }),
];

export const server = setupServer(...handlers);

export const codeError = (error: string, status = 400) => HttpResponse.json({ error, detail: error }, { status });
export const rateLimited = (retryAfter: string | null) =>
  HttpResponse.json({ error: "rate_limited", detail: "Too many requests." }, { status: 429, headers: retryAfter === null ? {} : { "Retry-After": retryAfter } });

export const unauthorized = () => HttpResponse.json({ detail: "Not signed in" }, { status: 401 });
