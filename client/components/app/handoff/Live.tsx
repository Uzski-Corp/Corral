"use client";
/* M14: a connected integration's page from real data. The account comes from the integration, "connected by"
   from the session, the activity from its log (or "No activity yet"), Phoenix's mapping from what was saved
   (or the defaults, tagged), and a broken sign-in reads Failed with one Reconnect. No sample content. */
import { useState } from "react";
import { ArrowClockwise, ArrowDownLeft, ArrowUpRight, CalendarBlank, Handshake, PaperPlaneTilt } from "@phosphor-icons/react/dist/ssr";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { Select } from "../Form";
import { Tabs } from "../Tabs";
import { Banner, EmptyState, Skeleton, Spinner } from "../States";
import { StatusTag } from "../StatusTag";
import { useToast } from "../Toaster";
import { useNow } from "../useNow";
import { agoLabel, dayLabel, daysBetween, momentLabel } from "@/lib/time";
import { dealPayload, mappingIssues, type IntegrationId, type MapRow } from "@/lib/integrations/integrations";
import { DEFAULT_MAPPING, LIVE_COPY, LOG_KIND, STANDARD_ERP_FIELDS, SUPPORTS_TEST, connKind, newestFirst, sameMapping, tokenValues, type IntegrationDetail, type IntegrationLog } from "@/lib/integrations/live";
import { CORRAL_FIELDS, integration } from "./data";
import { Tile } from "./Handoff";
import { IntegrationScopes } from "./Integrations";

/** "3 h ago", "yesterday", "19 days ago": how long it has been connected, always relative (dayLabel gives the date). */
const sinceWords = (d: Date, now: Date) => { const n = daysBetween(d, now); return n < 2 ? agoLabel(d, now) : `${n} days ago`; };

type Tab = "overview" | "mapping" | "logs" | "scopes";
const GLYPH: Record<IntegrationId, typeof CalendarBlank> = { cal: CalendarBlank, phoenix: Handshake, autosend: PaperPlaneTilt };
const TILE: Record<IntegrationId, string> = { cal: "Ca", phoenix: "Px", autosend: "As" };
const TEST_EVENT: Record<IntegrationId, string> = { cal: "PING", phoenix: "deal.test", autosend: "event test" };

export type LivePageProps = {
  detail: IntegrationDetail | "loading";
  /** For the skeleton, before the detail arrives. */
  id: IntegrationId;
  tab: Tab; setTab: (t: Tab) => void;
  /** Who "connectedById" is: the session's own id and name; anyone else by the member list. */
  people: { meId?: string; meName?: string; names?: Record<string, string> };
  onBack: () => void; onDisconnect: () => void;
  /** Starts the integration's sign-in again. Review builds resolve it on a timer. */
  onReconnect?: () => void;
  /** Review builds play the transitions locally (reconnect, a test). */
  local?: boolean;
  /** Signed in: PUT the mapping (an empty list means Corral's defaults). */
  onSaveMapping?: (rows: MapRow[]) => Promise<boolean>;
};

export function LiveIntegrationPage({ detail: initial, id, tab, setTab, people, onBack, onDisconnect, onReconnect, local, onSaveMapping }: LivePageProps) {
  const toast = useToast();
  const now = useNow();
  const [detail, setDetail] = useState(initial);
  const i = integration(id);

  const back = <button type="button" className="i-back" onClick={onBack}><Icon name="back" />Integrations</button>;
  if (detail === "loading") return (
    <div className="i-page i-detail" aria-busy="true">{back}
      <header className="i-dhead"><Tile label={TILE[id]} /><div className="i-dhead__t"><h2>{i.name}</h2><span className="i-dhead__sub"><Skeleton w={90} h={20} r={6} /></span></div></header>
      <span className="u-sr" role="status">Loading {i.name}</span>
      <div className="l-acct" aria-hidden="true">{[160, 120, 140].map((w) => <div key={w} className="l-acct__row"><Skeleton w={96} h={10} /><Skeleton w={w} /></div>)}</div>
    </div>
  );

  const d = detail;
  const kind = connKind(d);
  const by = d.connectedById === undefined ? undefined : d.connectedById === people.meId || (d.connectedById === "me" && !people.meId) ? (people.meName ?? "You") : (people.names?.[d.connectedById] ?? "A teammate");
  const logs = d.logs === "loading" ? "loading" : newestFirst(d.logs);
  const canTest = (d.supportsTest ?? SUPPORTS_TEST[id]) && !d.problem;
  const tabs = [{ id: "overview", label: "Overview" }, ...(id === "phoenix" ? [{ id: "mapping", label: "Field mapping" }] : []), { id: "logs", label: "Activity" }, { id: "scopes", label: "Permissions" }];

  const reconnect = () => {
    if (onReconnect) onReconnect();
    setDetail({ ...d, reconnecting: true });
    if (local) setTimeout(() => {
      setDetail((x) => (x === "loading" ? x : { ...x, reconnecting: false, problem: undefined }));
      toast({ tone: "success", children: `${i.name} reconnected`, meta: "caught up, nothing was lost" });
    }, 1600);
  };
  const test = () => {
    const row: IntegrationLog = { id: `t${Date.now()}`, at: new Date().toISOString(), dir: "out", event: TEST_EVENT[id], result: "ok", detail: `Test · ${i.name} throws it away` };
    if (local) setDetail({ ...d, logs: d.logs === "loading" ? [row] : [row, ...d.logs] });
    toast({ icon: "send", children: `Test sent to ${i.name}`, meta: "marked test, it isn’t kept" });
  };

  return (
    <div className="i-page i-detail l-page">
      {back}
      <header className="i-dhead"><Tile label={TILE[id]} />
        <div className="i-dhead__t"><h2>{i.name}</h2><span className="i-dhead__sub"><span className="c-faint">{i.role}</span><StatusTag kind={kind} /></span></div>
        <div className="i-dhead__acts">{d.problem && !d.reconnecting && <Button variant="primary" onClick={reconnect}><ArrowClockwise size={14} />{LIVE_COPY.reconnect}</Button>}</div>
      </header>
      {d.reconnecting ? <p className="l-note" role="status"><Spinner size={12} />{LIVE_COPY.reconnecting}</p>
        : d.problem && <Banner tone="caution" title={`${LIVE_COPY.expired} ${agoLabel(new Date(d.problem.since), now)}.`}>{LIVE_COPY.expiredLine}</Banner>}
      <div className="i-tabs"><Tabs label={`${i.name} sections`} tabs={tabs} value={tab} onChange={(v) => setTab(v as Tab)} /></div>

      {tab === "overview" && <div className="l-over">
        <dl className="l-acct" aria-label="Connected account">
          {d.account && <div className="l-acct__row"><dt>{LIVE_COPY.account}</dt><dd><span className="c-strong">{d.account.name}</span>{d.account.email && <span className="c-mono c-faint">{d.account.email}</span>}</dd></div>}
          {d.connectedAt && <div className="l-acct__row"><dt>{LIVE_COPY.since}</dt><dd><time dateTime={d.connectedAt}>{dayLabel(new Date(d.connectedAt), now)}</time><span className="c-faint">{sinceWords(new Date(d.connectedAt), now)}</span></dd></div>}
          {by && <div className="l-acct__row"><dt>{LIVE_COPY.by}</dt><dd>{by}</dd></div>}
          <div className="l-acct__row l-acct__end"><dt className="u-sr">Disconnect</dt><dd><Button variant="secondary-destructive" onClick={onDisconnect}>{LIVE_COPY.disconnect}</Button></dd></div>
        </dl>
        <section className="i-sec"><h3>Recent activity</h3>
          <Activity id={id} logs={logs === "loading" ? logs : logs.slice(0, 3)} now={now} onTest={canTest ? test : undefined} />
          {logs !== "loading" && logs.length > 3 && <button type="button" className="c-link k-linkbtn l-more" onClick={() => setTab("logs")}>All activity</button>}
        </section>
        <section className="i-sec"><h3>What Corral does with it</h3><ul className="i-does">{i.does.map((x) => <li key={x}><Icon name="check" size={12} />{x}</li>)}</ul></section>
      </div>}
      {tab === "mapping" && id === "phoenix" && <DefaultsMapping saved={d.mapping ?? null} onSave={onSaveMapping} />}
      {tab === "logs" && <Activity id={id} logs={logs} now={now} onTest={canTest ? test : undefined} full />}
      {tab === "scopes" && <IntegrationScopes id={id} />}
    </div>
  );
}

/** The log as a list: time, event, status tag, one line. Skeleton while loading; "No activity yet" when it's empty. */
export function Activity({ id, logs, now, onTest, full }: { id: IntegrationId; logs: IntegrationLog[] | "loading"; now: Date; onTest?: () => void; full?: boolean }) {
  if (logs === "loading") return (
    <div className="l-log" aria-busy="true"><span className="u-sr" role="status">{LIVE_COPY.logLoading}</span>
      <ul className="l-log__list" aria-hidden="true">{[150, 110, 170, 130, 90].slice(0, full ? 5 : 3).map((w, k) => (
        <li key={k} className="l-log__row"><Skeleton w={84} h={10} /><Skeleton w={w} h={10} /><Skeleton w={68} h={20} r={6} /><Skeleton w={w + 40} h={10} /></li>))}</ul></div>
  );
  if (logs.length === 0) return (
    <div className="l-empty"><EmptyState id={`activity-${id}`} glyph={GLYPH[id]} mark="line" compact title={LIVE_COPY.emptyTitle}
      actions={onTest ? <Button onClick={onTest}><PaperPlaneTilt size={14} />{LIVE_COPY.test}</Button> : undefined}>{LIVE_COPY.emptyLine[id]}</EmptyState></div>
  );
  return (
    <div className="l-log">
      <ul className="l-log__list" aria-label={`${integration(id).name} activity`}>
        {logs.map((r) => (
          <li key={r.id} className={cx("l-log__row", (r.result === "failed" || r.result === "rejected") && "is-bad")}>
            <time className="l-log__at c-mono" dateTime={r.at}>{momentLabel(new Date(r.at), now)}</time>
            <span className="l-log__ev">{r.dir === "in" ? <ArrowDownLeft size={12} aria-label="In" /> : <ArrowUpRight size={12} aria-label="Out" />}<span className="c-mono">{r.event}</span></span>
            <StatusTag kind={LOG_KIND[r.result]} />
            <span className="l-log__detail">{r.detail}</span>
          </li>
        ))}
      </ul>
      {full && <p className="c-faint l-log__keep">Kept 30 days · secrets never logged</p>}
    </div>
  );
}

/** Phoenix with no saved mapping: Corral's defaults as editable rows, tagged Defaults until someone changes one. */
export function DefaultsMapping({ saved, onSave }: { saved: MapRow[] | null; onSave?: (rows: MapRow[]) => Promise<boolean> }) {
  const toast = useToast();
  const [stored, setStored] = useState<MapRow[] | null>(saved);
  const [rows, setRows] = useState<MapRow[]>(saved ?? DEFAULT_MAPPING);
  const fields = STANDARD_ERP_FIELDS;
  const issues = mappingIssues(rows, fields, CORRAL_FIELDS);
  const defaults = sameMapping(rows, DEFAULT_MAPPING);
  const dirty = !sameMapping(rows, stored ?? DEFAULT_MAPPING);
  const payload = dealPayload(rows, tokenValues(CORRAL_FIELDS.map((c) => c.id)), fields);
  const pick = (erp: string, from: string) => setRows((rs) => rs.map((r) => (r.erp === erp ? { erp, from: from === "none" ? undefined : from } : r)));
  const save = async () => {
    // Saving Corral's own defaults stores nothing: the tag reads Defaults again.
    const next = defaults ? null : rows;
    if (onSave && !(await onSave(next ?? []))) { toast({ tone: "error", children: "Couldn’t save the mapping. Try again." }); return; }
    setStored(next); toast({ tone: "success", children: "Mapping saved", meta: "the next deal uses it" });
  };
  const opts = [{ value: "none", label: "Nothing" }, ...CORRAL_FIELDS.map((c) => ({ value: c.id, label: c.label, meta: c.type }))];
  return (
    <div className="i-map l-map">
      <div className="l-map__head"><p className="c-muted">{LIVE_COPY.mapLine}</p>
        <span className={cx("d-runtag", defaults ? "is-neutral" : "is-info")} data-status={defaults ? "defaults" : "edited"}>{defaults ? LIVE_COPY.defaults : LIVE_COPY.edited}</span></div>
      <table className="i-table i-maptable l-maptable"><caption className="u-sr">Phoenix field mapping</caption>
        <thead><tr><th scope="col">Phoenix field</th><th scope="col">Filled from</th></tr></thead>
        <tbody>{fields.map((f) => {
          const r = rows.find((x) => x.erp === f.id); const iss = issues.filter((x) => x.erp === f.id);
          return (
            <tr key={f.id} className={cx(iss.length > 0 && "is-bad")}>
              <th scope="row"><span className="i-map__f">{f.label}{f.required && <span className="i-req">Required</span>}</span><span className="c-mono c-faint">{f.id}</span></th>
              <td><Select label={`Fill ${f.label} from`} value={r?.from ?? "none"} onChange={(x) => pick(f.id, x)} options={opts} width={240} menuWidth={280} />
                {iss.map((x) => <span key={x.kind} className="i-map__issue"><Icon name="alert" size={12} />{x.text}</span>)}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <details className="l-payload"><summary>What Phoenix gets</summary><pre className="c-mono i-payload" aria-label="Payload preview">{JSON.stringify(payload.body, null, 2)}</pre></details>
      <div className="i-map__foot">
        <Button variant="primary" disabled={issues.length > 0 || !dirty} onClick={() => void save()}>{LIVE_COPY.save}</Button>
        {!defaults && <Button variant="quiet" onClick={() => setRows(DEFAULT_MAPPING)}><Icon name="refresh" />{LIVE_COPY.reset}</Button>}
        {issues.length > 0 && <span className="c-faint">Fix {issues.length === 1 ? "the field" : `the ${issues.length} fields`} above to save.</span>}
      </div>
    </div>
  );
}
