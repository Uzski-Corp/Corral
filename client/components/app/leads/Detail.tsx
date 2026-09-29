"use client";
import { Avatar, Button, FitBar, Logo, Monogram, Receipt, Receipts, Tag, cx, type Status } from "../primitives";
import { Icon } from "../icons";
import { Banner } from "../States";
import type { Lead } from "../data";
import { StatusMenu, EMAIL_STATUSES } from "./parts";
import { detailOf, leadById } from "./data";
import { ProvenanceList, StaleBanner } from "../discovery/Provenance";
import { enrichBusy, enrichLabel, fitPending } from "@/lib/discovery/run";
import type { FieldProv, ProvField } from "@/lib/discovery/provenance";

/**
 * Lead detail: one company, the person Corral writes to, why it fits, where it is in a sequence, and
 * everything that happened. Opens beside the table (rail 400) or full screen on a phone.
 */
export function LeadDetail({ lead, onClose, onStatus, onEnroll, onMerge, onKeepBoth, onOpenLead, prov, today, provOpen, onRecheck, rechecking, foundVia, backLabel = "All companies" }: {
  lead: Lead; onClose: () => void; onStatus: (id: string, s: Status, field?: "reply" | "email") => void; onEnroll: (id: string) => void;
  onMerge?: (id: string) => void; onKeepBoth?: (id: string) => void; onOpenLead?: (id: string) => void;
  /** M4 provenance: every field with its evidence chain. `today` anchors freshness (the demo's fixed date). */
  prov?: FieldProv[]; today?: Date; provOpen?: ProvField; onRecheck?: (id: string) => void; rechecking?: boolean;
  /** M4: how a discovery run found this company ("Search · … · #3"). */ foundVia?: string; backLabel?: string;
}) {
  const d = detailOf(lead);
  const dup = lead.dupOf ? leadById(lead.dupOf) : undefined;
  const blocked = lead.reply === "Unsubscribed" || lead.reply === "Not interested" || lead.email === "Bounced";
  const e = lead.enrich?.kind;
  const pending = !!lead.scoring || fitPending(lead.enrich);
  const noone = e === "no-people" || e === "below-bar" || e === "unreadable" || !lead.person;
  const waitWhy = enrichBusy(lead.enrich) ? `Corral is still ${e === "verifying" ? "verifying the email" : e === "finding" ? "finding people" : "reading the site"}.`
    : e === "unreadable" ? "Corral couldn't read the website, so there's no fit or contact yet."
    : e === "below-bar" ? `Fit is under ${lead.enrich && "bar" in lead.enrich ? lead.enrich.bar : 70}, so Corral didn't spend credits finding people.`
    : e === "no-people" ? "Corral didn't find a decision-maker with a work email." : null;
  return (
    <article className="l-detail" aria-label={`${lead.company} details`}>
      <button type="button" className="l-detail__back" onClick={onClose}><Icon name="back" />{backLabel}</button>
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

      {prov && today && <StaleBanner list={prov} today={today} person={lead.person} onRecheck={onRecheck && (() => onRecheck(lead.id))} rechecking={rechecking} />}

      <dl className="l-facts">
        <div><dt>Fit</dt><dd>{pending ? <span className="c-scoring"><span>{lead.scoring ? "Scoring" : enrichLabel(lead.enrich)} · reading {lead.domain}</span></span>
          : e === "unreadable" ? <span className="c-muted">Not scored: couldn&rsquo;t read the site</span> : <FitBar value={lead.fit} size="md" />}</dd></div>
        <div><dt>Status</dt><dd><StatusMenu label={`Status for ${lead.company}`} value={lead.reply} onChange={(s) => onStatus(lead.id, s)} /></dd></div>
        <div><dt>Email</dt><dd><StatusMenu label={`Email status for ${lead.person}`} value={lead.email} options={EMAIL_STATUSES} onChange={(s) => onStatus(lead.id, s, "email")} /></dd></div>
        <div><dt>Size</dt><dd><span>{lead.size ?? "—"}{lead.industry && <span className="c-muted">&nbsp;· {lead.industry}</span>}</span></dd></div>
        <div><dt>Added from</dt><dd>{lead.source ?? "Corral search"}</dd></div>
        {foundVia && <div><dt>Found via</dt><dd className="l-facts__via">{foundVia}</dd></div>}
      </dl>

      {lead.why.length > 0 && (
        <section className="l-sec"><h3>Why it fits ColdTrace Sensors</h3>
          <Receipts>{lead.why.map((w) => <Receipt key={w}>{w}</Receipt>)}</Receipts></section>
      )}

      <section className="l-sec"><h3>People <span className="c-faint">{noone ? 0 : d.people.length}</span></h3>
        {noone ? <p className="c-muted l-seq">{waitWhy ?? "No people yet."}</p> : <ul className="l-people">{d.people.map((p) => (
          <li key={p.email}>{p.avatar ? <Avatar id={p.avatar} size={28} /> : <Monogram name={p.name} size={28} />}
            <span className="l-people__txt"><span className="c-strong">{p.name}{p.primary && <span className="l-primary">Corral writes to</span>}</span><span className="c-muted">{p.title} · <span className="c-mono">{p.email}</span></span></span>
            <Tag status={p.status} /></li>))}</ul>}
      </section>

      {prov && today && prov.length > 0 && (
        <section className="l-sec"><h3>Where this data came from</h3>
          <ProvenanceList list={prov} today={today} initialOpen={provOpen} onRecheck={onRecheck && (() => onRecheck(lead.id))} rechecking={rechecking} /></section>
      )}

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
        <Button variant="primary" disabled={blocked || pending || noone || enrichBusy(lead.enrich)} onClick={() => onEnroll(lead.id)}>Enroll in sequence</Button>
        {(pending || noone || enrichBusy(lead.enrich)) && waitWhy && <span className="l-detail__why c-faint">{waitWhy}</span>}
      </footer>
    </article>
  );
}
