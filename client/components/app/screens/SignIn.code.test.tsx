import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CodeSendResult, CodeVerifyResult } from "@/lib/auth/code";
import { router } from "@/test/router";
import { SignIn, type SignInActions, type SignInState } from "./SignIn";

const actions = (verify: CodeVerifyResult | (() => Promise<CodeVerifyResult>) = { ok: false, reason: "wrong" }, send: CodeSendResult = { ok: true }) => {
  const a: SignInActions & { sendCode: ReturnType<typeof vi.fn>; verifyCode: ReturnType<typeof vi.fn> } = {
    startGoogle: vi.fn(), startEmail: vi.fn(),
    sendCode: vi.fn(async () => send),
    verifyCode: vi.fn(typeof verify === "function" ? verify : async () => verify),
  };
  return a;
};
const codeBox = () => screen.getByLabelText("Sign-in code");

async function toCodeScreen(a: ReturnType<typeof actions>) {
  const user = userEvent.setup();
  render(<SignIn actions={a} />);
  await user.type(screen.getByRole("textbox", { name: "Work email" }), "wanjiru@kilima.co.ke");
  await user.click(screen.getByRole("button", { name: "Email me a code" }));
  await screen.findByRole("heading", { name: "Check your email" });
  return user;
}

describe("SignIn · six-digit code (ENG-80)", () => {
  it("sends a code in the app and says 10 minutes, never 'link'", async () => {
    const a = actions();
    await toCodeScreen(a);
    expect(a.sendCode).toHaveBeenCalledWith("wanjiru@kilima.co.ke");
    expect(a.startEmail).not.toHaveBeenCalled();
    expect(screen.getByText(/six-digit code to/)).toHaveTextContent("expires in 10 minutes");
    expect(document.body.textContent).not.toMatch(/link|15 minutes/i);
  });

  it("is one numeric one-time-code field with a label and hint", async () => {
    await toCodeScreen(actions());
    const input = codeBox();
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAccessibleDescription(/Paste it whole/);
  });

  it("takes a pasted code with junk around it and submits on the sixth digit", async () => {
    const a = actions({ ok: true });
    await toCodeScreen(a);
    fireEvent.change(codeBox(), { target: { value: "Your code: 482 193" } });
    expect(codeBox()).toHaveValue("482193");
    await waitFor(() => expect(a.verifyCode).toHaveBeenCalledWith("wanjiru@kilima.co.ke", "482193"));
    expect(screen.getByRole("button", { name: /Checking code/ })).toBeDisabled();
  });

  it("keeps a wrong code, says so inline, and lets you retry", async () => {
    const a = actions({ ok: false, reason: "wrong" });
    const user = await toCodeScreen(a);
    await user.type(codeBox(), "482193");
    expect(await screen.findByRole("alert")).toHaveTextContent("That code isn’t right");
    expect(codeBox()).toHaveValue("482193");
    expect(codeBox()).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(codeBox(), { target: { value: "48219" } });
    expect(codeBox()).not.toHaveAttribute("aria-invalid");
    a.verifyCode.mockResolvedValueOnce({ ok: true });
    fireEvent.change(codeBox(), { target: { value: "482195" } });
    await waitFor(() => expect(a.verifyCode).toHaveBeenLastCalledWith("wanjiru@kilima.co.ke", "482195"));
  });

  it("offers a new code when the code has expired", async () => {
    const a = actions({ ok: false, reason: "expired" });
    const user = await toCodeScreen(a);
    await user.type(codeBox(), "639204");
    expect(await screen.findByRole("alert")).toHaveTextContent("That code has expired. Codes last 10 minutes.");
    expect(codeBox()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Send a new code" }));
    expect(await screen.findByText("New code sent")).toBeInTheDocument();
    expect(codeBox()).toBeEnabled();
    expect(codeBox()).toHaveValue("");
    expect(a.sendCode).toHaveBeenCalledTimes(2);
  });

  it("says when the connection dropped while checking", async () => {
    const a = actions({ ok: false, reason: "network" });
    const user = await toCodeScreen(a);
    await user.type(codeBox(), "482193");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t check the code");
  });

  it("waits out the soft cooldown before resend, then resends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const a = actions();
      await toCodeScreen(a);
      expect(screen.getByText(/send a new code in/)).toHaveTextContent("0:20");
      expect(screen.queryByRole("button", { name: "send a new code" })).toBeNull();
      for (let i = 0; i < 21; i++) await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      fireEvent.click(screen.getByRole("button", { name: "send a new code" }));
      expect(await screen.findByText("New code sent")).toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("shows the rate limit with a countdown from Retry-After", async () => {
    const a = actions(undefined, { ok: false, reason: "rate-limited", retryAfter: 41 });
    await toCodeScreen(a);
    expect(screen.getByText("Too many codes asked for")).toBeInTheDocument();
    expect(screen.getByText(/You can ask for 3 codes a minute/)).toHaveTextContent("0:41");
  });

  it("goes back to the form with the old address ready to replace", async () => {
    const user = await toCodeScreen(actions());
    await user.click(screen.getByRole("button", { name: "Use a different email" }));
    const email = screen.getByRole("textbox", { name: "Work email" });
    expect(email).toHaveValue("wanjiru@kilima.co.ke");
    expect(email).toHaveAccessibleDescription(/The code sent to wanjiru@kilima.co.ke won’t work for it/);
  });

  it("tells you when the first send failed", async () => {
    const a = actions(undefined, { ok: false, reason: "network" });
    const user = userEvent.setup();
    render(<SignIn actions={a} />);
    await user.type(screen.getByRole("textbox", { name: "Work email" }), "wanjiru@kilima.co.ke");
    await user.click(screen.getByRole("button", { name: "Email me a code" }));
    expect(await screen.findByText("Couldn’t send your code")).toBeInTheDocument();
  });

  it.each<[SignInState, RegExp]>([
    ["code-wrong", /That code isn’t right/], ["code-expired", /That code has expired/], ["code-resent", /New code sent/],
    ["resend-limited", /Too many codes asked for/], ["code-verifying", /Checking code/],
  ])("review state %s renders its screen", (state, text) => {
    render(<SignIn initial={state} />);
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(document.body.textContent).toMatch(text);
  });

  it("review flow: 123456 signs in, anything else is wrong", async () => {
    render(<SignIn initial="sent" />);
    fireEvent.change(codeBox(), { target: { value: "000000" } });
    expect(await screen.findByRole("alert", {}, { timeout: 2000 })).toHaveTextContent("isn’t right");
    fireEvent.change(codeBox(), { target: { value: "123456" } });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/onboarding"), { timeout: 2000 });
  });
});
