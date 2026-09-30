"use client";
/* Sign-in: the one brand moment inside the product. Form in the app language on the left;
   the Open Range sky on the right with one real product fragment floating on it. */
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Button, FitBar, Logo, Receipt, Receipts, Tag, cx } from "../primitives";
import { GoogleG, Icon, Mark } from "../icons";
import { FormField, TextInput } from "../Form";
import { Banner, Spinner } from "../States";
import { statusUrl } from "@/lib/config";
import { CODE_TTL_MINUTES, RESEND_COOLDOWN_SECONDS, RESEND_PER_MINUTE, formatCountdown, isCompleteCode, reviewVerify, type CodeSendResult, type CodeVerifyResult } from "@/lib/auth/code";
import { CodeInput, type CodeInputHandle } from "./CodeInput";

/**
 * error = the sign-in didn't finish (callback error) · cancelled = backed out at Google · unavailable = the auth provider is down.
 * Code screen (ENG-80): sent · code-verifying · code-wrong · code-expired · code-attempts (expired layout: WorkOS locked the
 * code after too many wrong tries) · code-resent · resend-limited · verify-limited (429 on
 * verify: locked, countdown) · code-failed (verify refused for another reason: send a new code); change-email = back on the form
 * after "Use a different email".
 */
export type SignInState = "default" | "sent" | "error" | "invalid" | "sending" | "cancelled" | "unavailable"
  | "code-verifying" | "code-wrong" | "code-expired" | "code-attempts" | "code-resent" | "resend-limited" | "verify-limited" | "code-failed" | "change-email";
export const CODE_SCREEN_STATES: SignInState[] = ["sent", "code-verifying", "code-wrong", "code-expired", "code-attempts", "code-resent", "resend-limited", "verify-limited", "code-failed"];
type Check = "idle" | "verifying" | "wrong" | "expired" | "attempts" | "network" | "limited" | "failed";
/** Review sample for verify-limited: the countdown Bau's copy shows. */
const REVIEW_VERIFY_WAIT = 42;
type Notice = null | "resent" | "limited" | "send-failed";
const SAMPLE = "tomas@coldtrace.io";
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PERSONAL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];

/**
 * Real sign-in. Without it the screen runs Bau's simulated flow (timers), for review.
 * startGoogle / startEmail start the WorkOS AuthKit redirect; the page is about to unload when they return.
 * With sendCode + verifyCode (Magic Auth, ENG-80) the email path stays in the app: the form sends a code,
 * "Check your email" takes it. verifyCode's success should navigate (like the callback); the screen stays
 * on "Checking…" until the page goes.
 */
export type SignInActions = {
  startGoogle: () => void; startEmail: (email: string) => void;
  sendCode?: (email: string) => Promise<CodeSendResult>;
  verifyCode?: (email: string, code: string) => Promise<CodeVerifyResult>;
};

export function SignIn({ initial = "default", actions }: { initial?: SignInState; actions?: SignInActions }) {
  const onCode = CODE_SCREEN_STATES.includes(initial);
  const [state, setState] = useState<SignInState>(initial === "cancelled" || initial === "change-email" ? "default" : onCode ? "sent" : initial);
  // Review states prefill the sample address; a real sign-in never guesses someone's email.
  const [email, setEmail] = useState(actions ? "" : initial === "error" || onCode || initial === "change-email" ? SAMPLE : initial === "invalid" ? "tomas@coldtrace" : "");
  const [expired, setExpired] = useState(initial === "error");
  const [google, setGoogle] = useState(false);
  const [cancelled, setCancelled] = useState(initial === "cancelled");
  const [checking, setChecking] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  // "Use a different email": the address the last code went to.
  const [prevEmail, setPrevEmail] = useState<string | null>(initial === "change-email" && !actions ? SAMPLE : null);
  // Code screen
  const [code, setCode] = useState(initial === "code-verifying" || initial === "code-failed" ? "482913" : initial === "code-wrong" || initial === "verify-limited" || initial === "code-attempts" ? "482193" : initial === "code-expired" ? "639204" : "");
  const [check, setCheck] = useState<Check>(initial === "code-verifying" ? "verifying" : initial === "code-wrong" ? "wrong" : initial === "code-expired" ? "expired" : initial === "code-attempts" ? "attempts"
    : initial === "verify-limited" ? "limited" : initial === "code-failed" ? "failed" : "idle");
  // Seconds until verifying is allowed again after a 429 on verify (Retry-After).
  const [verifyWait, setVerifyWait] = useState(initial === "verify-limited" ? REVIEW_VERIFY_WAIT : 0);
  const [notice, setNotice] = useState<Notice>(initial === "code-resent" ? "resent" : initial === "resend-limited" ? "limited" : null);
  const [wait, setWait] = useState(initial === "resend-limited" ? 41 : initial === "sent" || initial === "code-resent" ? RESEND_COOLDOWN_SECONDS : 0);
  const [resending, setResending] = useState(false);
  const sends = useRef<number[]>([]); // review only: mirrors the 3-a-minute limit
  const codeRef = useRef<CodeInputHandle>(null);
  // Focus the code field once the render that re-enables it has committed (a disabled input can’t take focus).
  const [focusAsk, setFocusAsk] = useState<{ select: boolean } | null>(null);
  useEffect(() => { if (focusAsk) codeRef.current?.focus(focusAsk.select); }, [focusAsk]);
  const router = useRouter();
  const ids = useId();
  const startGoogle = () => { setGoogle(true); if (actions) actions.startGoogle(); else setTimeout(() => router.push("/onboarding"), 700); };
  // Provider down: "Try again" re-enters the same AuthKit hand-off; in review it just recovers.
  const retryProvider = () => {
    setChecking(true);
    if (actions) { actions.startGoogle(); return; }
    setTimeout(() => { setChecking(false); setState("default"); }, 900);
  };
  // Back from AuthKit restores this page from the bfcache with its spinners still running.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) { setGoogle(false); setChecking(false); setState((s) => (s === "sending" ? "default" : s)); } };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  // One countdown for both the soft cooldown and the rate limit.
  useEffect(() => {
    if (state !== "sent" || wait <= 0) return;
    const t = setTimeout(() => {
      setWait((s) => s - 1);
      if (wait <= 1) setNotice((n) => (n === "limited" ? null : n)); // limit over: the banner goes, the link comes back
    }, 1000);
    return () => clearTimeout(t);
  }, [state, wait]);

  // Verify rate limit: the field stays locked with its digits until Retry-After runs out, then unlocks and takes focus.
  useEffect(() => {
    if (check !== "limited") return;
    const t = setTimeout(() => {
      if (verifyWait > 1) { setVerifyWait(verifyWait - 1); return; }
      setVerifyWait(0); setCheck("idle");
      setFocusAsk({ select: true });
    }, 1000);
    return () => clearTimeout(t);
  }, [check, verifyWait]);

  /** Review only: the same 3-a-minute limit WorkOS applies, so resend-limited can be reached by hand. */
  const simulateSend = useCallback((): CodeSendResult => {
    const now = Date.now();
    sends.current = sends.current.filter((t) => now - t < 60000);
    if (sends.current.length >= RESEND_PER_MINUTE) return { ok: false, reason: "rate-limited", retryAfter: Math.ceil((60000 - (now - sends.current[0])) / 1000) };
    sends.current.push(now);
    return { ok: true };
  }, []);
  /** Sends (or resends) a code: the real endpoint, or the review simulation. */
  const send = useCallback(async (to: string): Promise<CodeSendResult> => {
    if (actions?.sendCode) return actions.sendCode(to);
    await new Promise((r) => setTimeout(r, 700));
    return simulateSend();
  }, [actions, simulateSend]);

  const toCodeScreen = (r: CodeSendResult) => {
    setState("sent"); setExpired(false); setCode(""); setCheck("idle"); setPrevEmail(null);
    if (r.ok) { setNotice(null); setWait(RESEND_COOLDOWN_SECONDS); }
    else if (r.reason === "rate-limited") { setNotice("limited"); setWait(r.retryAfter); }
  };

  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) { setState("invalid"); return; }
    setState("sending"); setCancelled(false); setSendFailed(false);
    if (actions && !actions.sendCode) { actions.startEmail(email.trim()); return; }
    if (!actions) { setTimeout(() => toCodeScreen(simulateSend()), 700); return; }
    const r = await send(email.trim());
    if (!r.ok && r.reason === "network") { setState("default"); setSendFailed(true); return; }
    toCodeScreen(r);
  };

  const verify = async (c: string) => {
    if (!isCompleteCode(c) || check === "verifying" || check === "limited") return;
    setCheck("verifying"); setNotice((n) => (n === "resent" ? null : n));
    const r = actions?.verifyCode ? await actions.verifyCode(email.trim(), c) : await new Promise<CodeVerifyResult>((res) => setTimeout(() => res(reviewVerify(c)), 900));
    if (r.ok) { if (!actions?.verifyCode) router.push("/onboarding"); return; }
    if (r.reason === "rate-limited") { setCheck("limited"); setVerifyWait(r.retryAfter); return; }
    setCheck(r.reason);
    if (r.reason === "wrong" || r.reason === "network") setFocusAsk({ select: true });
  };

  const resendNow = async () => {
    setResending(true);
    const r = await send(email.trim());
    setResending(false);
    if (r.ok) {
      setNotice("resent"); setWait(RESEND_COOLDOWN_SECONDS);
      // A verify lock outlives a resend: the new code can be entered once the countdown ends.
      if (check === "limited") return;
      setCode(""); setCheck("idle"); setFocusAsk({ select: false }); return;
    }
    if (r.reason === "rate-limited") { setNotice("limited"); setWait(r.retryAfter); return; }
    setNotice("send-failed");
  };
  const resend = async () => {
    if (resending || wait > 0) return;
    await resendNow();
  };
  const differentEmail = () => { setPrevEmail(email.trim()); setState("default"); setCode(""); setCheck("idle"); setNotice(null); setWait(0); };
  const codeMsg = check === "wrong" ? "That code isn’t right. Check the newest email from Corral and try again."
    : check === "expired" ? `That code has expired. Codes last ${CODE_TTL_MINUTES} minutes.`
    : check === "attempts" ? "Too many tries on that code. Send a new code and try again."
    : check === "network" ? "Couldn’t check the code. Check your connection and try again."
    : check === "failed" ? "We couldn’t sign you in with that code. Send a new code and try again."
    : undefined;
  const bad = check === "wrong" || check === "expired" || check === "attempts" || check === "network" || check === "failed";
  const limited = check === "limited";
  // Expired, over-tried and failed codes are dead: the field locks and the primary becomes "Send a new code".
  const dead = check === "expired" || check === "attempts" || check === "failed";

  return (
    <div className="s-auth c-app">
      <section className="s-auth__form">
        <Link href="/" className="s-auth__brand"><Mark size={20} /><span>Corral</span></Link>
        <div className="s-auth__box">
          {state === "unavailable" ? (
            <div className="s-auth__sent s-auth__down" role="alert">
              <span className="s-auth__icon s-auth__icon--caution"><Icon name="alert" size={18} /></span>
              <h1>Sign-in is down for a moment</h1>
              <p>Our sign-in provider isn’t responding, so we can’t open Google or send sign-in codes right now. Your account and workspace are fine.</p>
              <div className="s-auth__row">
                <Button variant="primary" size="lg" onClick={retryProvider} disabled={checking}>{checking ? <><Spinner />Checking…</> : <><Icon name="refresh" />Try again</>}</Button>
                <a className="c-btn c-btn--lg" href={statusUrl()}>Status page</a>
              </div>
              <div className="s-auth__hr" />
              <p className="s-auth__small">Already signed in on this browser? Your session still works: <Link href="/app">open Corral</Link>.</p>
              <p className="s-auth__small">Email codes go through the same provider, so they’re paused too. Most outages clear within a few minutes.</p>
            </div>
          ) : state === "sent" ? (
            <div className="s-auth__sent s-auth__code">
              <span className="s-auth__icon"><Icon name="mail" size={18} /></span>
              <h1>Check your email</h1>
              <p>We sent a six-digit code to <span className="c-strong">{email}</span>. Enter it below; it expires in {CODE_TTL_MINUTES} minutes.</p>
              {notice === "resent" && <Banner tone="success" title="New code sent">Use the code in the newest email. It expires in {CODE_TTL_MINUTES} minutes.</Banner>}
              {notice === "limited" && <Banner tone="caution" icon="clock" title="Too many codes asked for">
                You can ask for {RESEND_PER_MINUTE} codes a minute. The last code we sent still works, or send another in <span className="c-strong c-num">{formatCountdown(wait)}</span>.</Banner>}
              {notice === "send-failed" && <Banner tone="error" title="Couldn’t send a new code">Check your connection, then try again. The last code we sent still works.</Banner>}
              <form className="s-code__form" noValidate onSubmit={(e) => { e.preventDefault(); void verify(code); }}>
                <div className="s-code__top"><label htmlFor={`${ids}-code`}>Sign-in code</label>{check === "verifying" && <span className="s-code__busy" role="status"><Spinner size={12} />Checking…</span>}</div>
                <CodeInput ref={codeRef} id={`${ids}-code`} value={code} onChange={(v) => { setCode(v); if (check === "wrong" || check === "network") setCheck("idle"); }}
                  onComplete={(v) => void verify(v)} invalid={bad} disabled={dead} busy={check === "verifying"} locked={limited}
                  describedBy={`${ids}-code-m`} autoFocus />
                <span id={`${ids}-code-m`} className={cx("c-field__hint", bad && "is-error", limited && "is-caution")} role={bad ? "alert" : limited ? "status" : undefined}>
                  {bad ? <><Icon name="alert" size={12} />{codeMsg}</>
                    : limited ? <><Icon name="clock" size={12} />Too many tries for now. You can try again in {formatCountdown(verifyWait)}.</>
                    : "From Corral. Paste it whole, or type it."}</span>
                {dead
                  ? <Button variant="primary" size="lg" className="s-auth__wide" onClick={() => void resendNow()} disabled={resending}>{resending ? <><Spinner />Sending…</> : "Send a new code"}</Button>
                  : <Button type="submit" variant="primary" size="lg" className="s-auth__wide" disabled={!isCompleteCode(code) || check === "verifying" || limited}>{check === "verifying" ? <><Spinner />Checking code…</> : "Continue"}</Button>}
              </form>
              <div className="s-auth__row s-auth__row--quiet">
                <a className="c-btn" href="https://mail.google.com" target="_blank" rel="noreferrer"><GoogleG size={14} />Open Gmail</a>
                <a className="c-btn" href="https://outlook.office.com/mail" target="_blank" rel="noreferrer"><Icon name="mail" />Open Outlook</a>
              </div>
              <div className="s-auth__hr" />
              {!dead && <p className="s-auth__small" aria-live="polite">Nothing after a minute? Check spam, or {resending
                ? <span className="c-strong">sending…</span>
                : wait > 0 ? <span>send a new code in <span className="c-strong c-num">{formatCountdown(wait)}</span></span>
                : <button type="button" className="s-link" onClick={() => void resend()}>send a new code</button>}.</p>}
              <button type="button" className="s-link" onClick={differentEmail}>Use a different email</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h1>Sign in to Corral</h1>
              <p className="s-auth__lede">Use your work email. We email you a six-digit code instead of asking for a password.</p>
              {expired && <Banner tone="error" title="That sign-in didn’t finish">It may have timed out or been opened twice. Start again below; it only takes a minute.</Banner>}
              {sendFailed && <Banner tone="error" title="Couldn’t send your code">Check your connection, then try again. Nothing was sent.</Banner>}
              {cancelled && <Banner tone="info" icon="back" title="You cancelled at Google">No problem, nothing was shared with Corral. Try Google again, or use your work email instead.</Banner>}
              <Button size="lg" className="s-auth__wide" disabled={google} onClick={startGoogle}>{google ? <Spinner /> : <GoogleG />}{google ? "Opening Google…" : cancelled ? "Try Google again" : "Continue with Google"}</Button>
              <div className="s-auth__or"><span>or</span></div>
              <FormField label="Work email"
                error={state === "invalid" ? `That doesn’t look like a full address. Try something like tomas@coldtrace.io.` : undefined}
                help={PERSONAL.includes(domain) ? `${domain} works, but Corral learns about your company from your email domain. Use your work address if you have one.`
                  : prevEmail ? `We’ll send a new code to this address. The code sent to ${prevEmail} won’t work for it.` : undefined}>
                <TextInput type="email" autoComplete="email" placeholder="you@company.com" value={email} icon="mail"
                  onChange={(e) => { setEmail(e.target.value); if (state === "invalid") setState("default"); }} autoFocus={!onCode} onFocus={prevEmail ? (e) => e.currentTarget.select() : undefined} />
              </FormField>
              <Button type="submit" variant="primary" size="lg" className="s-auth__wide" disabled={state === "sending"}>
                {state === "sending" ? <><Spinner />Sending code…</> : "Email me a code"}</Button>
              <p className="s-auth__small">New to Corral? Signing in with a new work email creates your workspace. By continuing you agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
            </form>
          )}
        </div>
        <footer className="s-auth__foot"><span>© 2026 Corral</span><span>Made in Nairobi</span><a href={statusUrl()}>Status</a></footer>
      </section>

      <aside className="s-auth__art" aria-label="Corral">
        <Image src="/corral/or/range-wide.jpg" alt="" fill priority sizes="(max-width: 900px) 100vw, 60vw" className="s-auth__img" />
        <div className="s-auth__card c-card" aria-hidden="true">
          <div className="s-auth__card-top"><Logo company="Kilima Dairies" /><span className="c-strong">Kilima Dairies</span><span className="c-mono">kilima.co.ke</span><span style={{ flex: 1 }} /><FitBar value={94} /></div>
          <Receipts><Receipt meta="38 pages">Read kilima.co.ke</Receipt><Receipt meta="4 of 4">Matched every ColdTrace pain</Receipt><Receipt live meta="2h ago">Wanjiru Mwangi replied</Receipt></Receipts>
          <div className="s-auth__card-foot"><Avatar id="wanjiru" size={24} /><span><span className="c-strong">Wanjiru Mwangi</span> · Head of Supply Chain</span><span style={{ flex: 1 }} /><Tag status="Interested" /></div>
        </div>
        <p className="s-auth__line">Every row ends in a person.</p>
        <span className="s-auth__credit">Sample content · reference photography</span>
      </aside>
    </div>
  );
}
