"use client";
import { Avatar, Button, FitBar, Logo, Monogram, Receipt, Receipts, Tag, cx, type Status } from "../primitives";
import { Icon } from "../icons";
import { Banner } from "../States";
import type { Lead } from "../data";
import { StatusMenu, EMAIL_STATUSES } from "./parts";
import { detailOf, leadById } from "./data";

/**
 * Lead detail: one company, the person Corral writes to, why it fits, where it is in a sequence, and
 * everything that happened. Opens beside the table (rail 400) or full screen on a phone.
 */
export function LeadDetail({ lead, onClose, onStatus, onEnroll, onMerge, onKeepBoth, onOpenLead }: {
  lead: Lead; onClose: () => void; onStatus: (id: string, s: Status, field?: "reply" | "email") => void; onEnroll: (id: string) => void;
  onMerge?: (id: string) => void; onKeepBoth?: (id: string) => void; onOpenLead?: (id: string) => void;
}) {
  const d = detailOf(lead);
  const dup = lead.dupOf ? leadById(lead.dupOf) : undefined;
  const blocked = lead.reply === "Unsubscribed" || lead.reply === "Not interested" || lead.email === "Bounced";
  return (
    <article className="l-detail" aria-label={`${lead.company} details`}>
      <button type="button" className="l-detail__back" onClick={onClose}><Icon name="back" />All companies</button>
      <header className="l-detail__head">
        <Logo company={lead.company} />
        <div className="l-detail__titles">
          <h2>{lead.company}</h2>
          <span className="c-mono">{lead.domain}{lead.country && <> · {lead.country}</>}</span>
        </div>
        <button type="button" className="c-iconbtn l-detail__x" aria-label="Close details" onClick={onClose}><Icon name="x" /></button>
      </header>

      {dup && (
        <Banner tone="caution" title={`Looks like ${dup.company}`}
          action={<span className="l-detail__dupacts"><Button variant="ink" onClick={() => onMerge?.(lead.id)}>Merge</Button><Button onClick={() => onKeepBoth?.(lead.id)}>Keep both</Button></span>}>
          Same website root and a matching person ({dup.person}). Added from trade-show-leads.csv on Sep 29. Merging keeps {dup.company}&rsquo;s history and status, and adds anything this row has that it doesn&rsquo;t.{" "}
          {onOpenLead && <button type="button" className="c-link k-linkbtn" onClick={() => onOpenLead(dup.id)}>Open {dup.company}</button>}
        </Banner>
      )}

      <dl className="l-facts">
        <div><dt>Fit</dt><dd>{lead.scoring ? <span className="c-scoring"><span>Scoring · reading {lead.domain}</span></span> : <FitBar value={lead.fit} size="md" />}</dd></div>
        <div><dt>Status</dt><dd><StatusMenu label={`Status for ${lead.company}`} value={lead.reply} onChange={(s) => onStatus(lead.id, s)} /></dd></div>
        <div><dt>Email</dt><dd><StatusMenu label={`Email status for ${lead.person}`} value={lead.email} options={EMAIL_STATUSES} onChange={(s) => onStatus(lead.id, s, "email")} /></dd></div>
        <div><dt>Size</dt><dd><span>{lead.size ?? "—"}{lead.industry && <span className="c-muted">&nbsp;· {lead.industry}</span>}</span></dd></div>
        <div><dt>Added from</dt><dd>{lead.source ?? "Corral search"}</dd></div>
      </dl>

      {lead.why.length > 0 && (
        <section className="l-sec"><h3>Why it fits ColdTrace Sensors</h3>
          <Receipts>{lead.why.map((w) => <Receipt key={w}>{w}</Receipt>)}</Receipts></section>
      )}

      <section className="l-sec"><h3>People <span className="c-faint">{d.people.length}</span></h3>
        <ul className="l-people">{d.people.map((p) => (
          <li key={p.email}>{p.avatar ? <Avatar id={p.avatar} size={28} /> : <Monogram name={p.name} size={28} />}
            <span className="l-people__txt"><span className="c-strong">{p.name}{p.primary && <span className="l-primary">Corral writes to</span>}</span><span className="c-muted">{p.title} · <span className="c-mono">{p.email}</span></span></span>
            <Tag status={p.status} /></li>))}</ul>
      </section>

      <section className="l-sec"><h3>Sequence</h3>
        <p className={cx("l-seq", !d.sequence && "c-muted")}>{d.sequence ?? (blocked ? `Can't be enrolled: ${lead.email === "Bounced" ? "email bounced" : lead.reply.toLowerCase()}.` : "Not in a sequence.")}</p>
        {d.segments.length > 0 && <p className="l-segs">In {d.segments.map((s) => <span key={s} className="c-chip">{s}</span>)}</p>}
      </section>

      <section className="l-sec"><h3>Activity</h3>
        <ol className="l-activity">{d.activity.map((a, i) => (
          <li key={i} className={cx(a.tone && `is-${a.tone}`)}><span className="l-activity__when c-mono">{a.when}</span><span>{a.what}{a.who && <span className="c-muted"> · {a.who}</span>}</span></li>))}</ol>
      </section>

      {d.notes && <section className="l-sec"><h3>Note</h3><p className="l-note">{d.notes}</p></section>}

      <footer className="l-detail__foot">
        <Button variant="primary" disabled={blocked || !!lead.scoring} onClick={() => onEnroll(lead.id)}>Enroll in sequence</Button>
      </footer>
    </article>
  );
}
