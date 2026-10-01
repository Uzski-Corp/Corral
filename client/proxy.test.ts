// @vitest-environment node
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetConfigCache } from "@/lib/config";
import { config, proxy } from "./proxy";

const req = (path: string, cookies: Record<string, string> = {}) => {
  const r = new NextRequest(new URL(path, "http://localhost:3000"));
  for (const [k, v] of Object.entries(cookies)) r.cookies.set(k, v);
  return r;
};

afterEach(() => { vi.unstubAllEnvs(); resetConfigCache(); });

describe("proxy matcher", () => {
  it.each([["/", true], ["/app", true], ["/app/anything", true], ["/onboarding", true], ["/sign-in", false], ["/styleguide", false], ["/_next/static/x.js", false], ["/corral/or/range-wide.jpg", false]])("%s -> %s", (url, want) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(want);
  });
});

describe("proxy", () => {
  it("redirects a signed-out /app visit to sign-in with the return path", () => {
    const res = proxy(req("/app/companies"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in?next=%2Fapp%2Fcompanies");
  });

  it("lets a signed-in, onboarded user through", () => {
    const res = proxy(req("/app", { wos_session: "sealed", corral_onboarded: "1" }));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("finishes the post-login redirect and clears the return cookie", () => {
    const res = proxy(req("/", { wos_session: "sealed", corral_onboarded: "1", corral_return_to: "/app/segments" }));
    expect(res.headers.get("location")).toBe("http://localhost:3000/app/segments");
    expect(res.cookies.get("corral_return_to")?.value).toBe("");
  });

  it("serves / (the Open Range landing) to signed-out visitors and signed-in visitors who aren't mid-sign-in", () => {
    expect(proxy(req("/")).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(req("/", { corral_return_to: "/app" })).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(req("/", { wos_session: "sealed", corral_onboarded: "1" })).headers.get("x-middleware-next")).toBe("1");
  });

  it("uses the configured session cookie name", () => {
    vi.stubEnv("SESSION_COOKIE_NAME", "corral_session");
    resetConfigCache();
    expect(proxy(req("/onboarding", { wos_session: "sealed" })).status).toBe(307);
    expect(proxy(req("/onboarding", { corral_session: "sealed" })).headers.get("x-middleware-next")).toBe("1");
  });

  it("does nothing in the design-review build", () => {
    vi.stubEnv("NEXT_PUBLIC_DESIGN_REVIEW", "1");
    resetConfigCache();
    expect(proxy(req("/app")).headers.get("x-middleware-next")).toBe("1");
  });
});
