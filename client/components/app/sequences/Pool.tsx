"use client";
import { Button, Segmented, cx } from "../primitives";
import { GoogleG, Icon, MicrosoftMark } from "../icons";
import { WARMUP_DAYS, healthOf, poolSummary, todayCap, warmupCap, type Mailbox } from "@/lib/sequences/sequence";

const PROVIDER = { google: "Google Workspace", microsoft: "Microsoft 365", smtp: "SMTP" } as const;
const STATE_WORD: Record<Mailbox["state"], string> = { warm: "Warm", warming: "Warming up", disconnected: "Disconnected", resting: "Resting" };
const STATE_TONE: Record<Mailbox["state"], string> = { warm: "positive", warming: "live", disconnected: "negative", resting: "caution" };
/** The day a warming mailbox reaches its full cap (today is day `day`). */
function warmOn(day: number, today: Date) { const d = new Date(today); d.setDate(d.getDate() + (WARMUP_DAYS - day)); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }); }

export function PoolLine({ pool }: { pool: Mailbox[] }) {
  const s = poolSummary(pool);
  return (
    <p className="q-poolline">
      <span><span className="c-num c-strong">{s.sent}</span> of <span className="c-num">{s.cap}</span> sent today</span><span aria-hidden="true">·</span>
      <span>{s.sending} of {s.total} mailboxes sending</span><span aria-hidden="true">·</span>
      <span>tomorrow up to <span className="c-num">{s.tomorrow}</span></span>
      {s.attention > 0 && <span className="q-poolline__warn"><Icon name="alert" size={12} />{s.attention} need you</span>}
    </p>
  );
}

export function MailboxCard({ m, today, onCap, onReconnect, onResume, onBounces }: {
  m: Mailbox; today: Date; onCap?: (cap: number) => void; onReconnect?: () => void; onResume?: () => void; onBounces?: () => void;
}) {
  const h = healthOf(m);
  const cap = todayCap(m);
  const off = m.state === "disconnected";
  return (
    <article className={cx("q-box", `is-${m.state}`)} aria-label={m.address}>
      <div className="q-box__head">
        <span className="q-box__prov" aria-hidden="true">{m.provider === "microsoft" ? <MicrosoftMark size={13} /> : m.provider === "google" ? <GoogleG size={14} /> : <Icon name="mail" />}</span>
        <div className="q-box__id"><span className="c-strong q-box__addr">{m.address}</span><span className="c-faint">{m.owner} · {PROVIDER[m.provider]} · {m.sequences} {m.sequences === 1 ? "sequence" : "sequences"}</span></div>
        <span className={cx("q-state", `is-${STATE_TONE[m.state]}`)}>{STATE_WORD[m.state]}</span>
      </div>

      {m.state === "disconnected" && (
        <div className="q-box__alert is-negative" role="alert"><Icon name="alert" size={13} /><div><b>Disconnected since {m.since}.</b> {m.note}</div>
          <Button variant="primary" onClick={onReconnect}>Reconnect</Button></div>
      )}
      {m.state === "resting" && (
        <div className="q-box__alert is-caution" role="status"><Icon name="clock" size={13} /><div><b>Bounce spike: resting until tomorrow 08:00.</b> {h.why}. {m.note}</div>
          <div className="q-box__acts"><Button variant="quiet" onClick={onBounces}>See the {m.bouncedToday} bounces</Button><Button variant="quiet" onClick={onResume}>Send again now</Button></div></div>
      )}

      <dl className="q-box__rows">
        <div><dt>Today</dt><dd>
          <span className="q-meter" aria-hidden="true"><i style={{ width: `${cap ? Math.min(100, (m.sentToday / Math.max(cap, 1)) * 100) : 0}%` }} /></span>
          <span className="c-num">{off ? "Not sending" : m.state === "resting" ? `${m.sentToday} sent, then stopped` : `${m.sentToday} of ${cap} sent`}</span></dd></div>
        <div><dt>Warm-up</dt><dd>
          {m.state === "warming" && m.day ? <>
            <span className="q-warm" role="img" aria-label={`Warm-up day ${m.day} of ${WARMUP_DAYS}`}>{Array.from({ length: WARMUP_DAYS }, (_, i) => <i key={i} className={i < m.day! ? "on" : undefined} />)}</span>
            <span>Day {m.day} of {WARMUP_DAYS} · {warmupCap(m.day, m.cap)} a day now, {m.cap} from {warmOn(m.day, today)}</span></>
            : <span className="c-faint">Done{m.since && m.state === "warm" ? ` · since ${m.since}` : ""}</span>}</dd></div>
        <div><dt>Health</dt><dd><span className={cx("q-dot", `is-${h.level}`)} aria-hidden="true" /><span>{h.word}</span>{m.state !== "resting" && <span className="c-faint q-box__why">{h.why}</span>}</dd></div>
        <div><dt>Checks</dt><dd className="q-auth">{(["spf", "dkim", "dmarc"] as const).map((k) => <span key={k} className={cx("q-auth__c", !m.auth[k] && "is-bad")}><Icon name={m.auth[k] ? "check" : "x"} size={11} />{k.toUpperCase()}</span>)}</dd></div>
        <div><dt>Daily cap</dt><dd className="q-cap"><Segmented options={["20", "30", "35"]} value={String(m.cap)} onChange={onCap ? (v) => onCap(Number(v)) : undefined} label={`Daily cap for ${m.address}`} />
          {m.state === "warming" && <span className="c-faint">once warm</span>}</dd></div>
      </dl>
    </article>
  );
}

export function PoolView({ pool, today, onCap, onReconnect, onResume, onBounces }: {
  pool: Mailbox[]; today: Date; onCap: (id: string, cap: number) => void; onReconnect: (id: string) => void; onResume: (id: string) => void; onBounces: (id: string) => void;
}) {
  const order = [...pool].sort((a, b) => rank(a) - rank(b));
  return (
    <div className="q-pool">
      <div className="q-pool__head"><h2>Mailbox pool</h2><PoolLine pool={pool} /></div>
      <div className="q-pool__grid">
        {order.map((m) => <MailboxCard key={m.id} m={m} today={today} onCap={(c) => onCap(m.id, c)} onReconnect={() => onReconnect(m.id)} onResume={() => onResume(m.id)} onBounces={() => onBounces(m.id)} />)}
      </div>
      <p className="q-pool__rules c-faint">Corral rotates every sequence across the mailboxes that are sending, 2–7 minutes apart, in each recipient&rsquo;s morning. A new mailbox warms up over {WARMUP_DAYS} days. A mailbox that bounces 3% or more of a day&rsquo;s sends, and three times its usual rate, rests until the next morning.</p>
    </div>
  );
}
/** Problems first, then warming, then warm. */
const rank = (m: Mailbox) => ({ disconnected: 0, resting: 1, warming: 2, warm: 3 })[m.state];
