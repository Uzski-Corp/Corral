import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { API, GOOD_CODE, rateLimited, server, testConfig } from "@/test/msw";
import { router } from "@/test/router";
import { authApiFor, type AuthApi } from "@/lib/api";
import { resetConfigCache } from "@/lib/config";
import { SignInScreen, signInActions } from "./SignInScreen";

const LOGIN = `${API}/api/v1/auth/login`;
const SEND = `${API}/api/v1/auth/code/send`;
const VERIFY = `${API}/api/v1/auth/code/verify`;

describe("signInActions", () => {
  it("remembers a safe return path, then goes to the API login redirect", () => {
    const go = vi.fn();
    const remember = vi.fn();
    const a = signInActions(authApiFor(testConfig()), "/app?view=segments", go, remember);
    a.startGoogle();
    expect(remember).toHaveBeenCalledWith("/app?view=segments");
    expect(go).toHaveBeenCalledWith(LOGIN);
    a.startEmail("wanjiru@kilima.co.ke");
    expect(go).toHaveBeenCalledTimes(2);
  });

  it("sends codes through the API and maps a 429 to rate-limited", async () => {
    const a = signInActions(authApiFor(testConfig()), null, vi.fn(), vi.fn());
    expect(await a.sendCode?.("wanjiru@kilima.co.ke")).toEqual({ ok: true });
    server.use(http.post(SEND, () => rateLimited("41")));
    expect(await a.sendCode?.("wanjiru@kilima.co.ke")).toEqual({ ok: false, reason: "rate-limited", retryAfter: 41 });
  });

  it("on a verified code remembers the return path and lands on / like the callback", async () => {
    const go = vi.fn();
    const remember = vi.fn();
    const a = signInActions(authApiFor(testConfig()), "/app?view=segments", go, remember);
    expect(await a.verifyCode?.("wanjiru@kilima.co.ke", "000000")).toEqual({ ok: false, reason: "wrong" });
    expect(go).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
    expect(await a.verifyCode?.("wanjiru@kilima.co.ke", GOOD_CODE)).toEqual({ ok: true });
    expect(remember).toHaveBeenCalledWith("/app?view=segments");
    expect(go).toHaveBeenCalledWith("/");
  });

  it("passes the email and code to the API as typed", async () => {
    const auth = { sendCode: vi.fn().mockResolvedValue({ ok: true, value: { sent: true } }), verifyCode: vi.fn().mockResolvedValue({ ok: true, value: { redirectTo: "http://x.test" } }) } as unknown as AuthApi;
    const a = signInActions(auth, null, vi.fn(), vi.fn());
    await a.sendCode?.("a@b.co");
    await a.verifyCode?.("a@b.co", "123456");
    expect(auth.sendCode).toHaveBeenCalledWith("a@b.co");
    expect(auth.verifyCode).toHaveBeenCalledWith("a@b.co", "123456");
  });

  it("falls back to /app for missing or unsafe return paths", () => {
    const remember = vi.fn();
    signInActions(authApiFor(testConfig()), "https://evil.test", vi.fn(), remember).startGoogle();
    signInActions(authApiFor(testConfig()), null, vi.fn(), remember).startGoogle();
    expect(remember.mock.calls).toEqual([["/app"], ["/app"]]);
  });
});

describe("SignInScreen (live)", () => {
  const mount = (initial: "default" | "error" | "cancelled" | "unavailable" = "default", next: string | null = null) => {
    const go = vi.fn();
    render(<SignInScreen initial={initial} next={next} config={testConfig()} go={go} />);
    return go;
  };

  it("hands Google off to AuthKit and shows the designed pending state", async () => {
    const go = mount("default", "/app?view=companies");
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(go).toHaveBeenCalledWith(LOGIN);
    expect(screen.getByRole("button", { name: /Opening Google/ })).toBeDisabled();
    expect(document.cookie).toContain("corral_return_to=%2Fapp%3Fview%3Dcompanies");
  });

  it("validates the email, then sends a code without leaving the page (no sample prefill)", async () => {
    const user = userEvent.setup();
    const go = mount();
    const email = screen.getByRole("textbox", { name: "Work email" });
    expect(email).toHaveValue("");
    await user.type(email, "wanjiru@kilima");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(go).not.toHaveBeenCalled();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/doesn’t look like a full address/)).toBeInTheDocument();
    await user.type(email, ".co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText(/six-digit code to/)).toHaveTextContent("wanjiru@kilima.co.ke");
    expect(go).not.toHaveBeenCalled();
  });

  it("signs in with the emailed code and goes to / with the return path remembered", async () => {
    const user = userEvent.setup();
    let verified: unknown;
    server.use(http.post(VERIFY, async ({ request }) => { verified = await request.json(); return HttpResponse.json({ redirect_to: "http://localhost:3000" }); }));
    const go = mount("default", "/app?view=companies");
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "wanjiru@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    await user.type(await screen.findByLabelText("Sign-in code"), GOOD_CODE);
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith("/"));
    expect(verified).toEqual({ email: "wanjiru@kilima.co.ke", code: GOOD_CODE });
    expect(document.cookie).toContain("corral_return_to=%2Fapp%3Fview%3Dcompanies");
    expect(screen.getByRole("button", { name: /Checking code/ })).toBeDisabled();
  });

  it("shows the limited banner with the server's Retry-After on a first-send 429", async () => {
    const user = userEvent.setup();
    server.use(http.post(SEND, () => rateLimited("41")));
    mount();
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "wanjiru@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByText("Too many codes asked for")).toBeInTheDocument();
    expect(screen.getByText(/You can ask for 3 codes a minute/)).toHaveTextContent(/0:4[01]/);
  });

  it("stays on the form when the API can't be reached", async () => {
    const user = userEvent.setup();
    server.use(http.post(SEND, () => HttpResponse.error()));
    mount();
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "wanjiru@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByText("Couldn’t send your code")).toBeInTheDocument();
  });

  it("shows the designed failure banner for a callback error, with an empty email", () => {
    mount("error");
    expect(screen.getByText("That sign-in didn’t finish")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Work email" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeInTheDocument();
  });

  it("tells someone who cancelled at Google that nothing happened, and retries Google", async () => {
    const go = mount("cancelled");
    expect(screen.getByText("You cancelled at Google")).toBeInTheDocument();
    expect(screen.queryByText("That sign-in didn’t finish")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try Google again" }));
    expect(go).toHaveBeenCalledWith(LOGIN);
  });

  it("shows the provider-down status screen with a retry and the signed-in fallback", async () => {
    const go = mount("unavailable");
    expect(screen.getByRole("heading", { name: "Sign-in is down for a moment" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "open Corral" })).toHaveAttribute("href", "/app");
    expect(screen.getByRole("link", { name: "Status page" })).toHaveAttribute("href", "#status");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(go).toHaveBeenCalledWith(LOGIN);
    expect(screen.getByRole("button", { name: /Checking/ })).toBeDisabled();
  });

  it("points every status link at NEXT_PUBLIC_STATUS_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_STATUS_URL", "https://status.corral.app");
    resetConfigCache();
    try {
      mount("unavailable");
      expect(screen.getByRole("link", { name: "Status page" })).toHaveAttribute("href", "https://status.corral.app/");
      expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute("href", "https://status.corral.app/");
    } finally { vi.unstubAllEnvs(); resetConfigCache(); }
  });

  it("resets its spinners when the page comes back from the bfcache", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(screen.getByRole("button", { name: /Opening Google/ })).toBeDisabled();
    const ev = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(ev, "persisted", { value: true });
    act(() => { window.dispatchEvent(ev); });
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
    const fresh = new Event("pageshow");
    Object.defineProperty(fresh, "persisted", { value: false });
    act(() => { window.dispatchEvent(fresh); });
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  });

  it("resets the email pending state from the bfcache too", async () => {
    const user = userEvent.setup();
    server.use(http.post(SEND, async () => { await delay("infinite"); return HttpResponse.json({ sent: true }); }));
    mount();
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "wanjiru@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(screen.getByRole("button", { name: /Sending code/ })).toBeDisabled();
    const ev = new Event("pageshow");
    Object.defineProperty(ev, "persisted", { value: true });
    act(() => { window.dispatchEvent(ev); });
    expect(screen.getByRole("button", { name: "Email me a code" })).toBeEnabled();
  });

  it("uses window.location by default", async () => {
    const assign = vi.fn();
    const orig = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...orig, protocol: "http:", assign } });
    try {
      render(<SignInScreen initial="default" next={null} config={testConfig()} />);
      await userEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
      expect(assign).toHaveBeenCalledWith(LOGIN);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: orig });
    }
  });
});

describe("SignInScreen (review)", () => {
  it("keeps Bau's simulated flow and sample email", () => {
    vi.useFakeTimers();
    try {
      render(<SignInScreen initial="default" next={null} config={testConfig({ mode: "review", apiUrl: "" })} />);
      fireEvent.change(screen.getByRole("textbox", { name: "Work email" }), { target: { value: "tomas@coldtrace.io" } });
      fireEvent.click(screen.getByRole("button", { name: "Email me a code" }));
      act(() => { vi.advanceTimersByTime(700); });
      expect(screen.getByRole("heading", { name: "Check your email" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
      fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
      act(() => { vi.advanceTimersByTime(700); });
      expect(router.push).toHaveBeenCalledWith("/onboarding");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefills the sample address in review states", () => {
    render(<SignInScreen initial="error" next={null} config={testConfig({ mode: "review", apiUrl: "" })} />);
    expect(screen.getByRole("textbox", { name: "Work email" })).toHaveValue("tomas@coldtrace.io");
  });
});
