"use client";
import { DropdownMenu, type MenuEntry } from "../Overlays";
import { STATUS, Tag, cx, type Status } from "../primitives";
import { Icon } from "../icons";

/** The lead statuses a person can set. Corral sets the same ones from replies; a manual change sticks until they reply again. */
export const LEAD_STATUSES: Status[] = ["Not contacted", "Contacted", "Interested", "Objection", "Meeting booked", "Referral", "OOO", "Not interested", "Unsubscribed", "Disqualified"];
/** Signed in (ENG-81): the API has no "Disqualified", so it isn't offered (review states keep Bau's full list). */
export const LIVE_STATUSES: Status[] = LEAD_STATUSES.filter((s) => s !== "Disqualified");
export const EMAIL_STATUSES: Status[] = ["Verified", "Catch-all", "Unverified", "Bounced"];
export const STATUS_HELP: Partial<Record<Status, string>> = {
  "Not contacted": "Never written to", Contacted: "Written to, no reply yet", Interested: "Wants to talk or try it", Objection: "Replied with a concern",
  "Meeting booked": "On the calendar", Referral: "Pointed to someone else", OOO: "Away; sequence paused", "Not interested": "Said no; stops sequences",
  Unsubscribed: "Asked not to be emailed; never enrolled again", Disqualified: "Not a fit; hidden from Fit 80+",
  Verified: "Mailbox exists", "Catch-all": "Domain accepts everything; may bounce", Unverified: "Not checked yet", Bounced: "Mail came back; not sent to again",
};

/** A status tag that opens the status menu. `label` names what is being changed, for screen readers. */
export function StatusMenu({ value, onChange, label, defaultOpen, align = "start", side, options = LEAD_STATUSES }: {
  value?: Status; onChange: (s: Status) => void; label: string; defaultOpen?: boolean; align?: "start" | "end"; side?: "top" | "bottom"; options?: Status[];
}) {
  const items: MenuEntry[] = [{ heading: value ? "Set status" : "Set status for the selection" },
    ...options.map((s): MenuEntry => ({ label: s, lead: <span className={cx("l-dot", STATUS[s])} aria-hidden="true" />, meta: STATUS_HELP[s], checked: value ? s === value : undefined, danger: s === "Unsubscribed", onSelect: () => onChange(s) }))];
  return (
    <DropdownMenu label={label} items={items} align={align} side={side} width={320} defaultOpen={defaultOpen}
      trigger={(tp) => value
        ? <button type="button" className="l-tagbtn" aria-label={`${label}: ${value}`} {...tp}><Tag status={value} /><Icon name="down" size={11} /></button>
        : <button type="button" className="c-btn" {...tp}><Icon name="pen" />Set status<Icon name="down" size={12} /></button>} />
  );
}

/** Multi-pick for a rule value: a button that shows the picks and a checkable menu. `searchable` filters a long list and keeps the menu open. */
export function MultiPick({ values, options, onChange, label, invalid, searchable }: {
  values: string[]; options: string[]; onChange: (v: string[]) => void; label: string; invalid?: boolean; searchable?: boolean;
}) {
  const shown = values.length === 0 ? "Pick…" : values.length > 2 ? `${values.slice(0, 2).join(", ")} +${values.length - 2}` : values.join(", ");
  const choices = [...new Set([...options, ...values])].sort((a, b) => a.localeCompare(b));
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  return (
    <DropdownMenu label={label} width={260} searchable={searchable} closeOnSelect={!searchable}
      onCreate={searchable ? (name) => { if (!values.includes(name)) onChange([...values, name]); } : undefined}
      items={choices.map((o): MenuEntry => ({ label: o, checked: values.includes(o), onSelect: () => toggle(o) }))}
      trigger={(tp) => <button type="button" className={cx("c-input c-select l-pick", values.length === 0 && "is-placeholder", invalid && "is-error")} aria-label={`${label}: ${values.length ? values.join(", ") : "none picked"}`} {...tp}>
        <span className="c-select__v">{shown}</span><Icon name="down" size={12} /></button>} />
  );
}
