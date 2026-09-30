/**
 * Unibox triage (M7, ENG-57). What a reply is, the key that marks it, and what Corral does next.
 * Plain module: no React. The design data and the review states build on it.
 */
import type { Status } from "@/components/app/primitives";

export type Triage = "interested" | "objection" | "referral" | "ooo" | "unsubscribe" | "bounce";
export type TriageDef = { id: Triage; key: string; label: string; status: Status; then: string; handled: boolean };

/** In key order (1–6). `handled`: Corral acts on its own and the thread never needs you. */
export const TRIAGE: TriageDef[] = [
  { id: "interested", key: "1", label: "Interested", status: "Interested", then: "Corral drafts a reply that moves to a meeting", handled: false },
  { id: "objection", key: "2", label: "Objection", status: "Objection", then: "Corral drafts an answer from the battlecards", handled: false },
  { id: "referral", key: "3", label: "Referral", status: "Referral", then: "Corral finds the person and drafts an intro", handled: false },
  { id: "ooo", key: "4", label: "Out of office", status: "OOO", then: "Pauses the sequence; back in Needs you the day they return", handled: true },
  { id: "unsubscribe", key: "5", label: "Unsubscribe", status: "Unsubscribed", then: "Stops every sequence and never writes to them again", handled: true },
  { id: "bounce", key: "6", label: "Bounce", status: "Bounced", then: "Marks the address bad and looks for another contact", handled: true },
];
export const triageDef = (id: Triage) => TRIAGE.find((t) => t.id === id)!;
export const triageByKey = (key: string) => TRIAGE.find((t) => t.key === key);

/** Map a thread's existing M1 status to a triage (statuses outside the six map to none). */
export function triageOfStatus(s: Status): Triage | undefined {
  return TRIAGE.find((t) => t.status === s)?.id;
}

/** The fields filters need; the Thread type in components/app/data.ts has them. */
export type Filterable = { id: string; status: Status; unread?: boolean; triage?: Triage; handled?: boolean };
export type Filters = { triage: Triage[]; unread: boolean };
export const NO_FILTERS: Filters = { triage: [], unread: false };

export const triageOf = (t: Filterable) => t.triage ?? triageOfStatus(t.status);
export function filterThreads<T extends Filterable>(list: T[], f: Filters): T[] {
  return list.filter((t) => (!f.unread || t.unread) && (!f.triage.length || f.triage.includes(triageOf(t) as Triage)));
}
/** Counts per triage for the filter chips, within the list the chips filter. */
export function triageCounts(list: Filterable[]): Record<Triage, number> {
  const out = Object.fromEntries(TRIAGE.map((t) => [t.id, 0])) as Record<Triage, number>;
  for (const t of list) { const k = triageOf(t); if (k) out[k]++; }
  return out;
}
export const isFiltered = (f: Filters) => f.unread || f.triage.length > 0;
/** Toggle one triage in the filter. */
export const toggleTriage = (f: Filters, id: Triage): Filters => ({ ...f, triage: f.triage.includes(id) ? f.triage.filter((x) => x !== id) : [...f.triage, id] });
/** Next / previous thread for J / K, wrapping. */
export function step<T extends { id: string }>(list: T[], active: string, dir: 1 | -1): string | undefined {
  if (!list.length) return undefined;
  const i = list.findIndex((t) => t.id === active);
  return list[(i < 0 ? 0 : i + dir + list.length) % list.length].id;
}
