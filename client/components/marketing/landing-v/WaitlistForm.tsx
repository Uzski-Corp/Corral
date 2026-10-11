"use client";
/* The waitlist capture on /v/1–/v/4 (Bau, Oct 7). Progressive: the server HTML is a real form that posts to
   /api/waitlist with native email validation, and the Worker answers with a #waitlist-* fragment that CSS shows.
   After hydration the form validates itself and posts JSON, and the row swaps to the result in place.
   States: idle, submitting, joined, exists, invalid, error. Contract: lib/marketing/waitlist.ts. */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { WAITLIST } from "./copy";
import { WAITLIST_ENDPOINT, joinWaitlist, isEmail, type WaitlistResult, type WaitlistSource } from "@/lib/marketing/waitlist";

export type WaitlistState = "idle" | "submitting" | WaitlistResult;

export function WaitlistForm({ source, tone = "light", align = "start", initial = "idle", initialEmail = "", note = true, fragments = false, id }: {
  source: WaitlistSource;
  /** light: on white or pale grounds. blue / dark: on the blue ground or the dusk footer. */
  tone?: "light" | "blue" | "dark";
  align?: "start" | "center";
  /** Pins a state for the styleguide and screenshots. */
  initial?: WaitlistState;
  initialEmail?: string;
  note?: boolean;
  /** Render the no-script result lines (#waitlist-*). Exactly one form per page sets this: the hero's. */
  fragments?: boolean;
  id?: string;
}) {
  const uid = useId();
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<WaitlistState>(initial);
  const [email, setEmail] = useState(initialEmail);

  // With script, we validate (so the invalid state is ours, not the browser's bubble).
  useEffect(() => { if (form.current) form.current.noValidate = true; }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "submitting") return;
    if (!isEmail(email)) { setState("invalid"); input.current?.focus(); return; }
    setState("submitting");
    const r = await joinWaitlist(email, source);
    setState(r);
    if (r === "invalid") input.current?.focus();
  }

  const done = state === "joined" || state === "exists";
  const msgId = `${uid}-msg`;
  const shown = email.trim();

  return (
    <div id={id} className={`wl wl--${tone} wl--${align}`} data-state={state}>
      {done ? (
        <div className="wl__done" role="status">
          <CheckCircle size={20} weight="fill" aria-hidden="true" />
          <div>
            <p className="wl__done-t">{state === "joined" ? WAITLIST.joined.title : WAITLIST.exists.title}</p>
            <p className="wl__done-b">{state === "joined" ? WAITLIST.joined.body(shown) : WAITLIST.exists.body(shown)}</p>
          </div>
        </div>
      ) : (
        <form ref={form} className="wl__form" method="post" action={WAITLIST_ENDPOINT} onSubmit={submit} aria-describedby={msgId}>
          <input type="hidden" name="source" value={source} />
          <label className="u-sr" htmlFor={`${uid}-email`}>{WAITLIST.label}</label>
          <input
            ref={input}
            id={`${uid}-email`}
            className="wl__input"
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            placeholder={WAITLIST.placeholder}
            value={email}
            aria-invalid={state === "invalid" || undefined}
            onChange={(e) => { setEmail(e.target.value); if (state === "invalid" || state === "error") setState("idle"); }}
            readOnly={state === "submitting"}
          />
          <button className="wl__btn" type="submit" aria-disabled={state === "submitting" || undefined}>
            {state === "submitting"
              ? <><CircleNotch className="wl__spin" size={16} weight="bold" aria-hidden="true" /><span>{WAITLIST.busy}…</span></>
              : <>{WAITLIST.cta}<ArrowRight className="wl__arrow" size={15} weight="bold" aria-hidden="true" /></>}
          </button>
        </form>
      )}
      <p id={msgId} className="wl__msg" aria-live="polite">
        {state === "invalid" ? <span className="wl__err">{WAITLIST.invalid}</span>
          : state === "error" ? <span className="wl__err">{WAITLIST.error}</span>
          : !done && note ? WAITLIST.note : null}
      </p>
      {/* No-script results: the Worker redirects back with one of these fragments, CSS :target shows it. */}
      {fragments && <div className="wl__nojs">
        <p id="waitlist-joined">{WAITLIST.joined.title} We’ll write when your workspace is ready.</p>
        <p id="waitlist-exists">{WAITLIST.exists.title}</p>
        <p id="waitlist-invalid" className="wl__err">{WAITLIST.invalid}</p>
        <p id="waitlist-error" className="wl__err">{WAITLIST.error}</p>
      </div>}
    </div>
  );
}
