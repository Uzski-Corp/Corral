"use client";
/* Sign-in: the one brand moment inside the product. Form in the app language on the left;
   the Open Range sky on the right with one real product fragment floating on it. */
import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Button, FitBar, Logo, Receipt, Receipts, Tag } from "../primitives";
import { GoogleG, Icon, Mark } from "../icons";
import { FormField, TextInput } from "../Form";
import { Banner, Spinner } from "../States";

export type SignInState = "default" | "sent" | "error" | "invalid" | "sending";
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PERSONAL = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];

/**
 * Real sign-in. Without it the screen runs Bau's simulated flow (timers), for review.
 * Both start the WorkOS AuthKit redirect; the page is about to unload when they return.
 */
export type SignInActions = { startGoogle: () => void; startEmail: (email: string) => void };

export function SignIn({ initial = "default", actions }: { initial?: SignInState; actions?: SignInActions }) {
  const [state, setState] = useState<SignInState>(initial);
  // Review states prefill the sample address; a real sign-in never guesses someone's email.
  const [email, setEmail] = useState(actions ? "" : initial === "error" || initial === "sent" ? "tomas@coldtrace.io" : initial === "invalid" ? "tomas@coldtrace" : "");
  const [expired, setExpired] = useState(initial === "error");
  const [left, setLeft] = useState(42);
  const [google, setGoogle] = useState(false);
  const router = useRouter();
  // Back from AuthKit restores this page from the bfcache with its spinners still running.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) { setGoogle(false); setState((s) => (s === "sending" ? "default" : s)); } };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  useEffect(() => {
    if (state !== "sent" || left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [state, left]);

  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!EMAIL.test(email.trim())) { setState("invalid"); return; }
    setState("sending");
    if (actions) { actions.startEmail(email.trim()); return; }
    setTimeout(() => { setState("sent"); setExpired(false); setLeft(42); }, 700);
  };

  return (
    <div className="s-auth c-app">
      <section className="s-auth__form">
        <Link href="/" className="s-auth__brand"><Mark size={20} /><span>Corral</span></Link>
        <div className="s-auth__box">
          {state === "sent" ? (
            <div className="s-auth__sent" role="status">
              <span className="s-auth__icon"><Icon name="mail" size={18} /></span>
              <h1>Check your email</h1>
              <p>We sent a sign-in link to <span className="c-strong">{email}</span>. It works once and expires in 15 minutes.</p>
              <div className="s-auth__row">
                <a className="c-btn c-btn--lg" href="https://mail.google.com" target="_blank" rel="noreferrer"><GoogleG size={14} />Open Gmail</a>
                <a className="c-btn c-btn--lg" href="https://outlook.office.com/mail" target="_blank" rel="noreferrer"><Icon name="mail" />Open Outlook</a>
              </div>
              <Receipts><Receipt meta="just now">Sent from login@corral.app</Receipt><Receipt meta="single use">Link expires in 15 minutes</Receipt></Receipts>
              <div className="s-auth__hr" />
              <p className="s-auth__small">Nothing after a minute? Check spam, or {left > 0
                ? <span className="c-strong c-num">resend in 0:{String(left).padStart(2, "0")}</span>
                : <button type="button" className="s-link" onClick={() => setLeft(42)}>send it again</button>}.</p>
              <button type="button" className="s-link" onClick={() => { setState("default"); }}>Use a different email</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h1>Sign in to Corral</h1>
              <p className="s-auth__lede">Use your work email. We send a link instead of asking for a password.</p>
              {expired && <Banner tone="error" title="That link has expired">Sign-in links work once and last 15 minutes. Send yourself a new one below.</Banner>}
              <Button size="lg" className="s-auth__wide" disabled={google} onClick={() => { setGoogle(true); if (actions) actions.startGoogle(); else setTimeout(() => router.push("/onboarding"), 700); }}>{google ? <Spinner /> : <GoogleG />}{google ? "Opening Google…" : "Continue with Google"}</Button>
              <div className="s-auth__or"><span>or</span></div>
              <FormField label="Work email"
                error={state === "invalid" ? `That doesn’t look like a full address. Try something like tomas@coldtrace.io.` : undefined}
                help={PERSONAL.includes(domain) ? `${domain} works, but Corral learns about your company from your email domain. Use your work address if you have one.` : undefined}>
                <TextInput type="email" autoComplete="email" placeholder="you@company.com" value={email} icon="mail"
                  onChange={(e) => { setEmail(e.target.value); if (state === "invalid") setState("default"); }} autoFocus={initial !== "sent"} />
              </FormField>
              <Button type="submit" variant="primary" size="lg" className="s-auth__wide" disabled={state === "sending"}>
                {state === "sending" ? <><Spinner />Sending link…</> : expired ? "Email me a new link" : "Email me a sign-in link"}</Button>
              <p className="s-auth__small">New to Corral? Signing in with a new work email creates your workspace. By continuing you agree to the <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
            </form>
          )}
        </div>
        <footer className="s-auth__foot"><span>© 2026 Corral</span><span>Made in Nairobi</span><a href="#status">Status</a></footer>
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
