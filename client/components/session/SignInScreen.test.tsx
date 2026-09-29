import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { API, testConfig } from "@/test/msw";
import { router } from "@/test/router";
import { authApiFor } from "@/lib/api";
import { SignInScreen, signInActions } from "./SignInScreen";

const LOGIN = `${API}/api/v1/auth/login`;

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

  it("falls back to /app for missing or unsafe return paths", () => {
    const remember = vi.fn();
    signInActions(authApiFor(testConfig()), "https://evil.test", vi.fn(), remember).startGoogle();
    signInActions(authApiFor(testConfig()), null, vi.fn(), remember).startGoogle();
    expect(remember.mock.calls).toEqual([["/app"], ["/app"]]);
  });
});

describe("SignInScreen (live)", () => {
  const mount = (initial: "default" | "error" = "default", next: string | null = null) => {
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

  it("validates the email before handing off, without sample prefill", async () => {
    const user = userEvent.setup();
    const go = mount();
    const email = screen.getByRole("textbox", { name: "Work email" });
    expect(email).toHaveValue("");
    await user.type(email, "wanjiru@kilima");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(go).not.toHaveBeenCalled();
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/doesn’t look like a full address/)).toBeInTheDocument();
    await user.type(email, ".co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(go).toHaveBeenCalledWith(LOGIN);
  });

  it("shows the designed failure banner for a callback error, with an empty email", () => {
    mount("error");
    expect(screen.getByText("That link has expired")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Work email" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Email me a new link" })).toBeInTheDocument();
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
    mount();
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "wanjiru@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(screen.getByRole("button", { name: /Sending link/ })).toBeDisabled();
    const ev = new Event("pageshow");
    Object.defineProperty(ev, "persisted", { value: true });
    act(() => { window.dispatchEvent(ev); });
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeEnabled();
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
      fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
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
