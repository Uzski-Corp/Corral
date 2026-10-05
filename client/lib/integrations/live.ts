/**
 * M14: a connected integration's detail page from real data (signed in), never the M8 sample account,
 * logs or mapping. The shapes below are what the page reads; review states fill them with placeholders.
 * Plain module: no React.
 */
import type { StatusKind } from "@/lib/status/tags";
import type { ErpField, FieldType, IntegrationId, LogResult, MapRow } from "./integrations";
import type { IntegrationDetailRow, IntegrationLogRow } from "@/lib/api/integrations";

/** The account on the other side, as the integration reports it. Phoenix (a webhook) has a host, no email. */
export type IntegrationAccount = { name: string; email?: string };
/** One row of the integration's own log. `at` is ISO; `detail` is one short line (ids and codes, never a body). */
export type IntegrationLog = { id: string; at: string; dir: "in" | "out"; event: string; result: LogResult; detail?: string };
/** The newest row of an integration's log, as the list shows it ("Last: BOOKING_CREATED · 18 min ago"). */
export type LastEvent = { event: string; at: string };
/** Why it stopped. `token-expired`: the sign-in Corral holds no longer works; Reconnect fixes it. */
export type IntegrationProblem = { kind: "token-expired" | "refused"; since: string; code?: string };

export type IntegrationDetail = {
  id: IntegrationId;
  /** Signed in, only what the connect flow stored: absent when the integration reported no account. */
  account?: IntegrationAccount;
  /** ISO time it was connected, and who did it (a member id; the name comes from the session or the member list).
   *  Absent for a connection made before Corral kept them: those rows aren't shown. */
  connectedAt?: string;
  connectedById?: string;
  /** Whether Corral can send it a test right now. Signed in, the API says (no integration can yet). */
  supportsTest?: boolean;
  /** "loading" while the log is on its way; [] once it's there and nothing has happened yet. */
  logs: IntegrationLog[] | "loading";
  /** Phoenix only: the saved mapping, or null when nobody has saved one (Corral uses the defaults). */
  mapping?: MapRow[] | null;
  problem?: IntegrationProblem;
  /** Reconnect pressed: waiting for the integration's sign-in to come back. */
  reconnecting?: boolean;
};

/** Whether the integration can take a test from Corral (a test deal, a test event). Cal.com can't. */
export const SUPPORTS_TEST: Record<IntegrationId, boolean> = { cal: false, phoenix: true, autosend: true };

export const LIVE_COPY = {
  account: "Account", since: "Connected", by: "Connected by", disconnect: "Disconnect",
  emptyTitle: "No activity yet", test: "Send a test",
  emptyLine: {
    cal: "Bookings show here as they arrive.",
    phoenix: "Deals Corral sends show here.",
    autosend: "Contacts and events Corral sends show here.",
  } satisfies Record<IntegrationId, string>,
  expired: "Sign-in expired", expiredLine: "Nothing is lost. It catches up once you reconnect.", reconnect: "Reconnect",
  reconnecting: "Waiting for the sign-in to come back.",
  defaults: "Defaults", edited: "Edited", reset: "Reset to defaults", save: "Save mapping",
  mapLine: "What fills each Phoenix field when Corral opens a deal.",
  logLoading: "Loading activity",
} as const;

/** Every log result reads in the shared status vocabulary. */
export const LOG_KIND: Record<LogResult, StatusKind> = { ok: "delivered", failed: "failed", retrying: "retrying", rejected: "rejected", duplicate: "ignored" };

/** The connection's own status tag: Failed for a problem, Connecting while it comes back, else Connected. */
export const connKind = (d: Pick<IntegrationDetail, "problem" | "reconnecting">): StatusKind => (d.reconnecting ? "connecting" : d.problem ? "failed" : "connected");

/** Phoenix's standard fields: what every Phoenix has. Custom fields (deal.custom.*) appear only once Phoenix lists them. */
export const STANDARD_ERP_FIELDS: ErpField[] = [
  { id: "account.name", label: "Account name", type: "text", required: true },
  { id: "account.website", label: "Website", type: "url" },
  { id: "account.country", label: "Country", type: "text" },
  { id: "contact.name", label: "Contact name", type: "text", required: true },
  { id: "contact.email", label: "Contact email", type: "email", required: true },
  { id: "contact.title", label: "Contact title", type: "text" },
  { id: "deal.stage", label: "Stage", type: "text", required: true },
  { id: "deal.owner_id", label: "Deal owner", type: "user", required: true },
  { id: "deal.next_meeting_at", label: "Next meeting", type: "datetime" },
  { id: "deal.source", label: "Source", type: "text" },
];
/** What Corral fills each standard field from until someone saves their own. */
export const DEFAULT_MAPPING: MapRow[] = [
  { erp: "account.name", from: "company" }, { erp: "account.website", from: "domain" }, { erp: "account.country", from: "country" },
  { erp: "contact.name", from: "person" }, { erp: "contact.email", from: "email" }, { erp: "contact.title", from: "title" },
  { erp: "deal.stage", from: "stage" }, { erp: "deal.owner_id", from: "owner" }, { erp: "deal.next_meeting_at", from: "meeting" },
  { erp: "deal.source", from: "source" },
];
export const sameMapping = (a: MapRow[], b: MapRow[]) =>
  a.length === b.length && a.every((r) => { const o = b.find((x) => x.erp === r.erp); return !!o && o.from === r.from && o.as === r.as; });
/** The payload preview without anyone's data: each value is its Corral field as a token, `{company}`. */
export const tokenValues = (ids: string[]): Record<string, string> => Object.fromEntries(ids.map((id) => [id, `{${id}}`]));

/** Newest first, the way the log reads. */
export const newestFirst = (rows: IntegrationLog[]) => [...rows].sort((a, b) => b.at.localeCompare(a.at));

const RESULTS: readonly LogResult[] = ["ok", "failed", "retrying", "rejected", "duplicate"];
const TYPES: readonly FieldType[] = ["text", "email", "number", "datetime", "url", "user"];
/** GET /integrations/:id and its /logs, as the page reads them. Only what the API knows: no account, time or
 *  person is made up when it's missing, and a test is offered only where the API says one can be sent. */
export function detailFromApi(id: IntegrationId, d: IntegrationDetailRow, logs: IntegrationLogRow[]): IntegrationDetail {
  const problem = d.problem && d.problem.since && (d.problem.kind === "token-expired" || d.problem.kind === "refused")
    ? { kind: d.problem.kind, since: d.problem.since } as IntegrationProblem : undefined;
  return {
    id,
    ...(d.account ? { account: d.account } : {}),
    ...(d.connectedAt ? { connectedAt: d.connectedAt } : {}),
    ...(d.connectedById ? { connectedById: d.connectedById } : {}),
    supportsTest: d.supportsTest,
    logs: logs.map((r) => ({ id: r.id, at: r.at, dir: r.dir, event: r.event, result: (RESULTS as readonly string[]).includes(r.result) ? r.result as LogResult : "ok", ...(r.detail ? { detail: r.detail } : {}) })),
    mapping: d.mapping ? d.mapping.map((r) => ({ erp: r.erp, ...(r.from ? { from: r.from } : {}), ...(r.as && (TYPES as readonly string[]).includes(r.as) ? { as: r.as as FieldType } : {}) })) : null,
    ...(problem ? { problem } : {}),
  };
}
