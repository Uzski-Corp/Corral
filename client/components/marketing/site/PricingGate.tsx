"use client";
/* The pricing gate (Bau, Oct 17): the page's one button, and the one-panel form it opens.
   Opening pushes `?gate=1`, Back closes it, and `/pricing?gate=1` opens on load. The form is Bau's: full name, industry
   (searchable, with Other), work email, optional phone, validated on submit and then live, a soft free-mail note, and
   states for sending, sent, failed and rate-limited. The dialog renders inside the page's `.lv` root so its tokens
   resolve; while it is open everything else in that root is inert. Contract and field rules: lib/marketing/pricingIntent.ts. */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ArrowRight, CheckCircle, CircleNotch } from "@phosphor-icons/react/dist/ssr";
import { Icon } from "@/components/app/icons";
import { Banner } from "@/components/app/States";
import { TextInput } from "@/components/app/Form";
import { useFocusTrap } from "@/components/app/useFocusTrap";
import {
  EMPTY, OTHER_MAX, cleanPhone, firstInvalid, groupPhone, isFreeMail, requestPricing, validate, waitWords,
  type Errors, type Field, type GateSource, type Values,
} from "@/lib/marketing/pricingIntent";
import { ROUTES } from "@/lib/marketing/site";
import { IndustryCombobox } from "./IndustryCombobox";
import { PRICING_GATE as C } from "./pricing-gate-copy";
import "./pricing-gate.css";

const GATE_PARAM = "gate";
const hasGate = () => new URLSearchParams(window.location.search).get(GATE_PARAM) === "1";

/** The page's one button, and the dialog it opens. */
export function PricingGate({ source = "hero" }: { source?: GateSource }) {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    setRoot(opener.current?.closest<HTMLElement>(".lv") ?? document.body);
    const sync = () => { pushed.current = false; setOpen(hasGate()); };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const show = () => {
    const url = new URL(window.location.href);
    url.searchParams.set(GATE_PARAM, "1");
    window.history.pushState(null, "", url);
    pushed.current = true;
    setOpen(true);
  };
  const hide = () => {
    if (pushed.current) { window.history.back(); return; } // popstate closes it
    const url = new URL(window.location.href);
    url.searchParams.delete(GATE_PARAM);
    window.history.replaceState(null, "", url);
    setOpen(false);
  };
  const wasOpen = useRef(false);
  useEffect(() => { // focus returns to the opener when the dialog closes (not on first load)
    if (wasOpen.current && !open) opener.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button ref={opener} type="button" className="c-btn c-btn--ink c-btn--lg pg-cta" data-gate-open data-ab-event="pricing_cta_click" data-ab-placement={source} onClick={show}>
        {C.open}
      </button>
      {open && root && createPortal(<GateDialog source={source} onClose={hide} root={root} />, root)}
    </>
  );
}

type View = "idle" | "submitting" | "success" | "failure" | "limited";

function GateDialog({ source, onClose, root }: { source: GateSource; onClose: () => void; root: HTMLElement }) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useFocusTrap(box, true);

  const [view, setView] = useState<View>("idle");
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<Field, true>>>({});
  const [honeypot, setHoneypot] = useState("");
  const [freeNote, setFreeNote] = useState(false);
  const [freeAck, setFreeAck] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const [sentTo, setSentTo] = useState("");
  const ids = { fullName: `${uid}-name`, industry: `${uid}-industry`, otherText: `${uid}-other`, email: `${uid}-email`, phone: `${uid}-phone` };
  const titleId = `${uid}-t`;
  const doneTitle = useRef<HTMLParagraphElement>(null);

  // Focus in, scroll lock, everything else inert, Escape closes, and focus goes back to the opener (PricingGate).
  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>("input:not([readonly])");
    (first ?? box.current)?.focus();
    const others = Array.from(root.children).filter((el) => !el.contains(box.current)) as HTMLElement[];
    others.forEach((el) => el.setAttribute("inert", ""));
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      others.forEach((el) => el.removeAttribute("inert"));
      document.documentElement.style.overflow = overflow;
    };
  }, [root]);

  useEffect(() => { if (view === "success") doneTitle.current?.focus(); }, [view]);
  useEffect(() => {
    if (view !== "limited") return;
    const t = setTimeout(() => setView("idle"), retryAfter * 1000);
    return () => clearTimeout(t);
  }, [view, retryAfter]);
  // Choosing Other reveals "Your industry"; it takes focus (Bau's shot 12).
  const wasOther = useRef(false);
  useEffect(() => {
    if (values.industry === "other" && !wasOther.current) document.getElementById(ids.otherText)?.focus();
    wasOther.current = values.industry === "other";
  }, [values.industry, ids.otherText]);

  const focusField = (f: Field) => document.getElementById(ids[f])?.focus();
  const busy = view === "submitting";
  const readOnly = busy;

  function recheck(next: Values, f: Field) {
    const bad = validate(next)[f];
    setErrors((e) => { const n = { ...e }; if (bad) n[f] = true; else delete n[f]; return n; });
  }
  function change(f: Field, value: string) {
    const next = { ...values, [f]: value } as Values;
    setValues(next);
    if (touched[f]) recheck(next, f);
    if (f === "email") { setFreeAck(false); setFreeNote(false); }
    if (f === "industry" && value !== "other") setErrors((e) => { const n = { ...e }; delete n.otherText; return n; });
  }
  function blur(f: Field) {
    setTouched((t) => ({ ...t, [f]: true }));
    recheck(values, f);
    if (f === "phone") {
      const e164 = cleanPhone(values.phone);
      const grouped = e164 ? groupPhone(e164) : null;
      if (grouped && grouped !== values.phone) setValues((v) => ({ ...v, phone: grouped }));
    }
    if (f === "email" && !validate(values).email && isFreeMail(values.email) && !freeAck) setFreeNote(true);
  }

  async function send(acknowledged: boolean) {
    if (busy || view === "limited") return;
    const found = validate(values);
    setErrors(found);
    setTouched({ fullName: true, industry: true, otherText: true, email: true, phone: true });
    const bad = firstInvalid(found);
    if (bad) { focusField(bad); return; }
    // Soft: the first submit with a personal address stops at the note (and arms the second); Send anyway goes straight through.
    if (isFreeMail(values.email) && !freeAck && !acknowledged) { setFreeNote(true); setFreeAck(true); focusField("email"); return; }
    setFreeAck(true);
    setView("submitting");
    const result = await requestPricing(values, source, honeypot);
    if (result.status === "queued") { setSentTo(values.email.trim().toLowerCase()); setView("success"); return; }
    if (result.status === "invalid") { setErrors({ [result.field]: true }); setView("idle"); setTimeout(() => focusField(result.field), 0); return; }
    if (result.status === "rate_limited") { setRetryAfter(result.retryAfter); setView("limited"); return; }
    setView("failure");
  }
  const submit = (e: FormEvent) => { e.preventDefault(); void send(false); };

  const hint = (f: Field, help?: ReactNode) => {
    const id = `${ids[f]}-m`;
    if (errors[f]) return <span id={id} role="alert" className="c-field__hint is-error"><Icon name="alert" size={12} />{C.errors[f]}</span>;
    if (f === "email" && freeNote) {
      return (
        <span id={id} className="c-field__hint is-caution"><Icon name="alert" size={12} />
          <span>{C.freeMail.note} <button type="button" className="pg-link" onClick={() => void send(true)}>{C.freeMail.send}</button></span>
        </span>
      );
    }
    return help ? <span id={id} className="c-field__hint">{help}</span> : null;
  };
  const described = (f: Field, hasHelp: boolean) => (errors[f] || (f === "email" && freeNote) || hasHelp ? `${ids[f]}-m` : undefined);

  const success = view === "success";
  const limited = view === "limited";
  return (
    <div className="c-scrim c-app pg-scrim" data-ab-section="pricing-gate" onPointerDown={(e) => { if (e.target === e.currentTarget) close.current(); }}>
      <div ref={box} role="dialog" tabIndex={-1} aria-modal="true" aria-labelledby={titleId} className="c-dialog c-pop-in pg-dialog">
        <div className="pg-sheetbar" aria-hidden="true" />
        <div className="c-dialog__head">
          <div className="c-dialog__titles"><h2 id={titleId}>{C.dialog.title}</h2>{!success && <p>{C.dialog.description}</p>}</div>
          <button type="button" data-close className="c-iconbtn" aria-label={C.dialog.close} onClick={() => close.current()}><Icon name="x" /></button>
        </div>

        {success ? (
          <>
            <div className="c-dialog__body">
              <div className="pg-ok" role="status">
                <div className="wl__done">
                  <CheckCircle size={20} weight="fill" aria-hidden="true" />
                  <div>
                    <p ref={doneTitle} tabIndex={-1} className="wl__done-t">{C.success.title}</p>
                    <p className="wl__done-b">{C.success.body(sentTo)}</p>
                  </div>
                </div>
                <p className="pg-ok__more">{C.success.more}<button type="button" className="pg-link" onClick={() => void send(true)}>{C.success.again}</button>.</p>
              </div>
            </div>
            <div className="c-dialog__foot"><button type="button" className="c-btn c-btn--lg" onClick={() => close.current()}>{C.success.close}</button></div>
          </>
        ) : (
          <form className="c-dialog__body" noValidate onSubmit={submit}>
            {view === "failure" && <Banner tone="error" title={C.failure.title}>{C.failure.body}</Banner>}
            {limited && <Banner tone="caution" title={C.limited.title}>{C.limited.body}</Banner>}

            <div className="c-field">
              <div className="c-field__top"><label htmlFor={ids.fullName}>{C.fields.fullName.label}</label></div>
              <TextInput id={ids.fullName} type="text" name="fullName" placeholder={C.fields.fullName.placeholder} autoComplete="name" value={values.fullName}
                invalid={errors.fullName} aria-describedby={described("fullName", false)} readOnly={readOnly}
                onChange={(e) => change("fullName", e.target.value)} onBlur={() => blur("fullName")} />
              {hint("fullName")}
            </div>

            <div className="c-field">
              <div className="c-field__top"><label htmlFor={ids.industry}>{C.fields.industry.label}</label></div>
              <IndustryCombobox id={ids.industry} value={values.industry} onChange={(v) => { change("industry", v); setTouched((t) => ({ ...t, industry: true })); }}
                invalid={errors.industry} describedBy={described("industry", false)} disabled={readOnly} />
              {hint("industry")}
            </div>

            {values.industry === "other" && (
              <div className="c-field">
                <div className="c-field__top"><label htmlFor={ids.otherText}>{C.fields.other.label}</label><span className="pg-count" aria-live="off">{values.otherText.length} / {OTHER_MAX}</span></div>
                <TextInput id={ids.otherText} type="text" name="otherText" placeholder={C.fields.other.placeholder} autoComplete="off" maxLength={OTHER_MAX} value={values.otherText}
                  invalid={errors.otherText} aria-describedby={described("otherText", false)} readOnly={readOnly}
                  onChange={(e) => change("otherText", e.target.value)} onBlur={() => blur("otherText")} />
                {hint("otherText")}
              </div>
            )}

            <div className="c-field">
              <div className="c-field__top"><label htmlFor={ids.email}>{C.fields.email.label}</label></div>
              <TextInput id={ids.email} type="email" name="email" inputMode="email" spellCheck={false} placeholder={C.fields.email.placeholder} autoComplete="email" value={values.email}
                invalid={errors.email} aria-describedby={described("email", true)} readOnly={readOnly}
                onChange={(e) => change("email", e.target.value)} onBlur={() => blur("email")} />
              {hint("email", C.fields.email.hint)}
            </div>

            <div className="c-field">
              <div className="c-field__top"><label htmlFor={ids.phone}>{C.fields.phone.label}<span className="c-field__opt">{C.fields.phone.optional}</span></label></div>
              <TextInput id={ids.phone} type="tel" name="phone" inputMode="tel" placeholder={C.fields.phone.placeholder} autoComplete="tel" value={values.phone}
                invalid={errors.phone} aria-describedby={described("phone", true)} readOnly={readOnly}
                onChange={(e) => change("phone", e.target.value)} onBlur={() => blur("phone")} />
              {hint("phone", C.fields.phone.hint)}
            </div>

            <div className="pg-hp" aria-hidden="true">
              <label>Website<input type="text" name="website" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} /></label>
            </div>

            <button className="wl__btn pg-btn" type="submit" aria-disabled={busy || limited || undefined} data-dim={limited || undefined} data-ab-event="pricing_gate_submit">
              {busy ? <><CircleNotch className="wl__spin" size={16} weight="bold" aria-hidden="true" /><span>{C.busy}…</span></>
                : limited ? C.limited.button(waitWords(retryAfter))
                : <>{view === "failure" ? C.failure.retry : C.submit}<ArrowRight className="wl__arrow" size={15} weight="bold" aria-hidden="true" /></>}
            </button>
            <p className="pg-consent">{C.consent.before}<Link href={ROUTES.privacy}>{C.consent.link}</Link>{C.consent.after}</p>
          </form>
        )}
      </div>
    </div>
  );
}
