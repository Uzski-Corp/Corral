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

export const handlers = [
  http.get(`${API}/api/v1/auth/me`, () => HttpResponse.json(ME_BODY)),
  http.post(`${API}/api/v1/auth/refresh`, () => HttpResponse.json({ refreshed: true })),
  http.post(`${API}/api/v1/auth/logout`, () => HttpResponse.json({ logout_url: LOGOUT_URL })),
];

export const server = setupServer(...handlers);

export const unauthorized = () => HttpResponse.json({ detail: "Not signed in" }, { status: 401 });
