/* M13 (Krak's gaps 1–2): the empty states, all from one <EmptyState glyph>: a small Open Range horizon mark with one
   Phosphor glyph, a 2–3 word title, one line, one action. The copy lives here so it reads as one voice. */
import type { ReactNode } from "react";
import { AddressBook, Binoculars, CalendarCheck, MoonStars, PaperPlaneTilt, Plugs, StackSimple, Tray, UploadSimple, Plus, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { Button } from "./primitives";
import { EmptyState } from "./States";

/** Every string the empty states use. Titles are 2–3 words; each line is one short sentence. */
export const EMPTY_COPY = {
  contacts: { title: "No contacts yet", line: "People appear here as Corral reads each company.", action: "Find companies" },
  discovery: { title: "Find your market", line: "Corral searches, reads and scores companies that fit what you sell.", action: "Start a run" },
  segments: { title: "No segments yet", line: "Save a set of filters to reuse it in sequences.", action: "Create segment", alt: "From an import" },
  sequences: { title: "No sequences yet", line: "A few short emails that stop the moment someone replies.", action: "Draft with Corral", alt: "Start blank" },
  uniboxNeeds: { title: "Nothing needs you", line: "New replies land here first.", action: "See what Corral handled" },
  uniboxSnoozed: { title: "Nothing snoozed", line: "Press H on a thread to bring it back later." },
  uniboxMeetings: { title: "No meetings yet", line: "Threads move here when someone books." },
  hosts: { title: "No hosts connected", line: "Connect Cursor, Claude or any MCP client.", action: "Connect a client" },
  hostsWaiting: { title: "No hosts connected", line: "Waiting for the first call." },
} as const;

const ic = { size: 14, weight: "regular" } as const;

export function ContactsEmpty({ onFind }: { onFind: () => void }) {
  const c = EMPTY_COPY.contacts;
  return <EmptyState id="contacts" glyph={AddressBook} title={c.title} actions={<Button variant="primary" onClick={onFind}><MagnifyingGlass {...ic} />{c.action}</Button>}>{c.line}</EmptyState>;
}

export function DiscoveryEmpty({ onStart }: { onStart: () => void }) {
  const c = EMPTY_COPY.discovery;
  return <EmptyState id="discovery" glyph={Binoculars} title={c.title} actions={<Button variant="primary" onClick={onStart}><Plus {...ic} />{c.action}</Button>}>{c.line}</EmptyState>;
}

/** Gap 2. `onImport` only when CSV import is available; then the alternative shows. */
export function SegmentsEmpty({ onCreate, onImport }: { onCreate: () => void; onImport?: () => void }) {
  const c = EMPTY_COPY.segments;
  return <EmptyState id="segments" glyph={StackSimple} title={c.title} actions={<>
    <Button variant="primary" onClick={onCreate}><Plus {...ic} />{c.action}</Button>
    {onImport && <Button variant="quiet" onClick={onImport}><UploadSimple {...ic} />{c.alt}</Button>}</>}>{c.line}</EmptyState>;
}

export function SequencesEmpty({ onDraft, onBlank }: { onDraft: () => void; onBlank: () => void }) {
  const c = EMPTY_COPY.sequences;
  return <EmptyState id="sequences" glyph={PaperPlaneTilt} title={c.title} actions={<>
    <Button variant="primary" onClick={onDraft}>{c.action}</Button><Button variant="quiet" onClick={onBlank}>{c.alt}</Button></>}>{c.line}</EmptyState>;
}

/** The Unibox's three empty tabs. Inside the pane the mark is the hairline horizon (no photo next to mail). */
export function UniboxEmpty({ tab, onHandled }: { tab: "needs" | "snoozed" | "meetings" | string; onHandled?: () => void }) {
  if (tab === "snoozed") { const c = EMPTY_COPY.uniboxSnoozed; return <EmptyState id="unibox-snoozed" glyph={MoonStars} mark="line" title={c.title}>{c.line}</EmptyState>; }
  if (tab === "meetings") { const c = EMPTY_COPY.uniboxMeetings; return <EmptyState id="unibox-meetings" glyph={CalendarCheck} mark="line" title={c.title}>{c.line}</EmptyState>; }
  const c = EMPTY_COPY.uniboxNeeds;
  return <EmptyState id="unibox" glyph={Tray} title={c.title} actions={onHandled ? <Button onClick={onHandled}>{c.action}</Button> : undefined}>{c.line}</EmptyState>;
}

/** Gap 4: Settings → MCP before any host has called, and inside the Waiting dialog (`waiting`, hairline mark). */
export function HostsEmpty({ onConnect, waiting, extra }: { onConnect?: () => void; waiting?: boolean; extra?: ReactNode }) {
  const c = waiting ? EMPTY_COPY.hostsWaiting : EMPTY_COPY.hosts;
  return <EmptyState id={waiting ? "hosts-waiting" : "hosts"} glyph={Plugs} mark={waiting ? "line" : "crop"} compact={waiting} title={c.title}
    actions={!waiting && onConnect ? <Button variant="primary" onClick={onConnect}><Plugs {...ic} />{EMPTY_COPY.hosts.action}</Button> : extra}>{c.line}</EmptyState>;
}
