"use client";
import { useId, useState } from "react";
import { Button, cx } from "../primitives";
import { Icon, type IconName } from "../icons";
import { Banner } from "../States";
import {
  FIELD_LABEL, SOURCE, STALE_AFTER, ageDays, chainSummary, confidenceWord, formatAge, freshness, latest, shortAge, staleFields,
  type Evidence, type FieldProv, type ProvField, type SourceKind,
} from "@/lib/discovery/provenance";

const KIND_ICON: Record<SourceKind, IconName> = {
  search: "search", site: "globe", corral: "bolt", hunter: "user", dropcontact: "user", zerobounce: "mail", csv: "upload", you: "pen",
};

/** One piece of evidence: who said it, what they saw, where, when, how sure. */
function EvidenceRow({ e, today, first }: { e: Evidence; today: Date; first: boolean }) {
  const conf = confidenceWord(e.confidence);
  return (
    <li className="d-ev">
      <span className="d-ev__icon" aria-hidden="true"><Icon name={KIND_ICON[e.kind]} size={11} /></span>
      <span className="d-ev__body">
        <span className="d-ev__top"><span className="c-strong">{SOURCE[e.kind].label}</span><span className="c-faint">{first ? "found it" : "checked"} · {formatAge(ageDays(e.at, today))}</span></span>
        <span className="d-ev__what">{e.what}{conf && <span className="c-muted"> · {e.confidence}% {conf}</span>}</span>
        {e.url && <span className="c-mono d-ev__url">{e.url.replace(/^https?:\/\//, "")}</span>}
      </span>
    </li>
  );
}

/**
 * Provenance for every field of one company: value, where it came from, how fresh it is. Each row
 * expands into its evidence chain (first entry found it, the rest checked it). Stale rows get a
 * caution clock; what you typed yourself never goes stale.
 */
export function ProvenanceList({ list, today, initialOpen, onRecheck, rechecking }: {
  list: FieldProv[]; today: Date; initialOpen?: ProvField; onRecheck?: () => void; rechecking?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState<ProvField | null>(initialOpen ?? null);
  const kinds = new Set(list.flatMap((p) => p.chain.map((e) => e.kind)));
  const newest = Math.min(...list.map((p) => freshness(p, today).days));
  return (
    <div className="d-provlist">
      <p className="d-provlist__sum c-muted">{list.length} fields from {kinds.size} sources · newest check {formatAge(newest)}</p>
      <ul className="d-provrows">
        {list.map((p) => {
          const fr = freshness(p, today);
          const on = open === p.field;
          const rid = `${id}-${p.field}`;
          return (
            <li key={p.field} className={cx("d-provrow", on && "is-open", fr.stale && "is-stale")}>
              <button type="button" className="d-provrow__btn" aria-expanded={on} aria-controls={rid} onClick={() => setOpen(on ? null : p.field)}>
                <span className="d-provrow__field">{FIELD_LABEL[p.field]}</span>
                <span className={cx("d-provrow__value", (p.field === "email" || p.field === "phone") && "c-mono")}>{p.field === "fit" ? `${p.value} / 100` : p.value}</span>
                <span className={cx("d-provchip", fr.stale && "is-stale")}>
                  {fr.stale && <Icon name="clock" size={11} />}{SOURCE[latest(p).kind].short} · {shortAge(fr.days)}
                </span>
                <Icon name={on ? "up" : "down"} size={12} />
              </button>
              {on && (
                <div id={rid} className="d-provrow__chain">
                  <p className="d-provrow__summary">{chainSummary(p)}.</p>
                  <ol className="d-evs">{p.chain.map((e, i) => <EvidenceRow key={i} e={e} today={today} first={i === 0} />)}</ol>
                  <p className="d-provrow__foot c-faint">
                    {fr.stale ? <>Last checked {formatAge(fr.days)}. {FIELD_LABEL[p.field]} is worth re-checking after {STALE_AFTER[p.field]} days.</>
                      : latest(p).kind === "you" ? <>Entered by you, so Corral won&rsquo;t overwrite it.</>
                      : <>Fresh for {STALE_AFTER[p.field] - fr.days} more days, then Corral re-checks it before sending.</>}
                    {fr.stale && onRecheck && <> <button type="button" className="c-link k-linkbtn" onClick={onRecheck} disabled={rechecking}>{rechecking ? "Re-checking…" : "Re-check now"}</button></>}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The caution banner at the top of a detail whose contact details are stale. */
export function StaleBanner({ list, today, person, onRecheck, rechecking }: { list: FieldProv[]; today: Date; person?: string; onRecheck?: () => void; rechecking?: boolean }) {
  const stale = staleFields(list, today).filter((p) => p.field === "email" || p.field === "person" || p.field === "title" || p.field === "phone");
  if (!stale.length) return null;
  const days = freshness(stale[0], today).days;
  return (
    <Banner tone="caution" icon="clock" title={`Contact details checked ${formatAge(days)}`}
      action={onRecheck && <Button onClick={onRecheck} disabled={rechecking}>{rechecking ? "Re-checking…" : "Re-check · 2 credits"}</Button>}>
      People change jobs{person ? `, and ${person.split(" ")[0]} may have moved on` : ""}. Corral re-checks the email before it sends anything; re-check now to see it here first.
    </Banner>
  );
}
