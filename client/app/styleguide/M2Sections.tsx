"use client";
/* /styleguide: M2 knowledge base (ENG-52). Every piece live, in the place it is used. */
import { useState, type ReactNode } from "react";
import {
  AppDemo, FileTile, KNOWLEDGE, KnowledgeEditor, PageStrip, QueueRow, REVIEW_SOURCES, SOURCES, SourceDetail, SourceList, SourceState, UploadDialog, UploadTray,
  DropZone, reviewQueue, useUploadQueue, type KSection, type SourceFilter,
} from "@/components/app";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const noop = () => {};
const pick = (...ids: string[]) => ids.map((id) => SOURCES.find((s) => s.id === id)!);

export function SourceListDemo() {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [sel, setSel] = useState<string | undefined>();
  return (
    <div className="sg-kb">
      <div className="c-win c-win--flat c-app sg-kb__win"><SourceList sources={SOURCES.slice(0, 7)} filter={filter} onFilter={setFilter} selected={sel} onOpen={setSel} /></div>
      <div className="sg-kb__row">
        <div className="sg-card c-app"><Label>file tiles · neutral for every format</Label>
          <div className="sg-kb__tiles"><FileTile kind="pdf" /><FileTile kind="docx" /><FileTile kind="md" /><FileTile kind="url" /><FileTile kind="pdf" label="KEY" /><FileTile kind="pdf" size={20} /><FileTile kind="pdf" size={36} /></div></div>
        <div className="sg-card c-app"><Label>row status · colour only for exceptions</Label>
          <div className="sg-kb__states">{[...pick("pitch", "install", "blog", "gateway", "cert"), REVIEW_SOURCES.unreadable, REVIEW_SOURCES.interrupted, REVIEW_SOURCES["partial-text-limit"], REVIEW_SOURCES.retrying].map((s) => <SourceState key={s.id} src={s} />)}</div></div>
      </div>
    </div>
  );
}

function QueueFrame({ state, label }: { state: "upload" | "upload-errors"; label: string }) {
  const q = useUploadQueue({ initial: reviewQueue(state), live: false });
  return <div><Label>{label}</Label><div className="sg-kb__dialog"><UploadDialog open inline onClose={noop} q={q} product="ColdTrace Sensors" /></div></div>;
}
function TrayFrame() {
  const q = useUploadQueue({ initial: reviewQueue("tray"), live: false });
  return <div><Label>tray · dialog closed, uploads keep going</Label><div className="sg-kb__tray"><UploadTray q={q} onOpen={noop} inline /></div></div>;
}

export function UploadDemo() {
  return (
    <div className="sg-kb">
      <div className="sg-kb__row sg-kb__row--top sg-kb__row--stack">
        <QueueFrame state="upload" label="in progress · two at a time, then checked" />
        <QueueFrame state="upload-errors" label="every failure · what happened + the one fix" />
      </div>
      <div className="sg-kb__row sg-kb__row--top">
        <div className="c-app"><Label>drop zone · full (first run) and compact (queue open)</Label><div className="sg-kb__drops"><DropZone onFiles={noop} /><DropZone compact onFiles={noop} /></div></div>
        <TrayFrame />
      </div>
      <div className="sg-card c-app"><Label>queue rows</Label>
        <ul className="sg-kb__rows">{reviewQueue("upload-errors").slice(0, 3).map((it) => <QueueRow key={it.id} it={it} />)}</ul></div>
    </div>
  );
}

export function SourceDetailDemo() {
  return (
    <div className="sg-kb__details">
      {pick("pitch", "gateway", "cert", "install").map((s) => (
        <div key={s.id}><Label>{s.status.s === "ready" ? "ready" : s.status.s === "partial" ? "partial · scanned pages skipped" : s.status.s === "failed" ? "failed · encrypted" : "reading"}</Label>
          <div className="sg-kb__detail c-app"><SourceDetail src={s} knowledge={KNOWLEDGE} /></div></div>
      ))}
    </div>
  );
}

/* M10b (PR #67): the three source failures the KB backend adds or reshapes, beside the existing ones.
   M10c (2f66f91): partial says why with skipped_reason, and every source row counts its tries in attempts. */
const SOURCE_FAILURES: { code: string; when: string; says: string; does: string }[] = [
  { code: "unreadable", when: "status failed · failure unreadable · parse or scan", says: "Corral couldn’t read this file. It may be damaged, or it took too long to open.", does: "Replace file (replace_source_id). What happened: stage, reason (the server’s note), cause, your file." },
  { code: "partial · scanned", when: "status partial · skipped_reason scanned", says: "31 of 38 pages used · 7 skipped. They’re scanned images with no text layer.", does: "Upload a text version (replace). Page strip: used in ink, skipped hatched." },
  { code: "partial · size-limit", when: "skipped_reason size-limit · counts optional (DOCX has none)", says: "500 of 620 pages used · 120 skipped. Corral reads up to 500 pages of one file.", does: "Replace with the first part, add the rest. No counts: “Partly read · the end was skipped”." },
  { code: "partial · unreadable", when: "skipped_reason unreadable · web pages that failed or had no text", says: "37 of 40 pages used · 3 skipped, with the paths in mono.", does: "Re-read (POST …/reread)." },
  { code: "partial · mixed", when: "skipped_reason mixed · scans and past the limit", says: "488 of 540 pages used · 52 skipped, for two reasons.", does: "Upload a text version, split into parts." },
  { code: "interrupted", when: "status failed · failure interrupted · attempts", says: "Reading stopped. Corral tried 5 times and couldn’t finish. Your file is kept. (attempts 1: “stopped partway”.)", does: "Try again (POST …/reread resets attempts to 0). What happened: stage, reason, Tries, last try. At upload: Upload again." },
  { code: "attempts", when: "every source row · 0 queued, 1 first read, 2+ retries", says: "While reading: “Embedding · try 3”. Failed: “Tried 3 times” in the step and the banner.", does: "Nothing to do: it only changes the words." },
];

export function SourceFailuresDemo() {
  const unread = REVIEW_SOURCES.unreadable, slow = REVIEW_SOURCES["unreadable-timeout"], stop = REVIEW_SOURCES.interrupted, R = REVIEW_SOURCES;
  const lost = { ...stop, id: "fleet-lost", name: "Installer checklist.md", kind: "md" as const, meta: "9 KB", status: { s: "failed" as const, failure: "interrupted" as const, at: "upload" as const, note: "The upload wasn't stored.", when: "Today, 09:31" } };
  return (
    <div className="sg-kb">
      <div className="sg-kb__details">
        {([["unreadable · damaged file", unread], ["unreadable · parse timeout", slow], ["interrupted · tried 5 times", stop], ["interrupted · tried once (a crash)", R["interrupted-crash"]], ["interrupted at upload · file lost", lost],
          ["partial · size-limit", R["partial-limit"]], ["partial · size-limit, no counts (DOCX)", R["partial-text-limit"]], ["partial · unreadable web pages", R["partial-web"]], ["partial · mixed", R["partial-mixed"]], ["reading · try 3", R.retrying]] as const).map(([l, s]) => (
          <div key={s.id}><Label>{l}</Label><div className="sg-kb__detail c-app"><SourceDetail src={s} knowledge={KNOWLEDGE} /></div></div>
        ))}
      </div>
      <div className="sg-kb__row sg-kb__row--top">
        <div className="sg-card c-app"><Label>partial · the page strip at 38, 12, 3 and 620 pages (one tick per 9, half-hatched when part skipped)</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 336 }}>
            <PageStrip total={38} skipped={[12, 13, 14, 15, 16, 17, 18]} why="scanned" />
            <PageStrip total={12} skipped={[1, 12]} why="scanned" />
            <PageStrip total={3} skipped={[2]} why="unreadable" />
            <PageStrip total={620} skipped={Array.from({ length: 120 }, (_, i) => 501 + i)} why="size-limit" />
            <PageStrip total={540} skipped={[...Array.from({ length: 12 }, (_, i) => 40 + i), ...Array.from({ length: 40 }, (_, i) => 501 + i)]} why="mixed" />
          </div></div>
        <div className="sg-card c-app"><Label>against PR #67 (2f66f91): skipped_reason and attempts</Label>
          <ul className="sg-anatomy">{SOURCE_FAILURES.map((f) => <li key={f.code}><code>{f.code}</code> · <span className="sg-faint">{f.when}</span><br />{f.says}<br /><span className="sg-faint">{f.does}</span></li>)}</ul></div>
      </div>
    </div>
  );
}

export function EditorDemo() {
  const [k, setK] = useState<KSection[]>(() => KNOWLEDGE.filter((s) => ["proof", "pricing"].includes(s.id)));
  return (
    <div className="c-win c-win--flat c-app sg-kb__doc">
      <KnowledgeEditor sections={k} onChange={setK} sources={SOURCES} onOpenSource={noop} onShowSources={noop} />
    </div>
  );
}

const KB_URLS: [string, string][] = [
  ["", "live: knowledge page, two sources still being read"], ["empty", "first run: the page is the drop zone"], ["drafting", "first source reading, page not drafted yet"],
  ["loading", "skeleton at real sizes"], ["error", "couldn’t load, nothing lost, retry"], ["sources", "ledger with live, partial and failed rows"],
  ["source", "ready source in the detail panel"], ["partial", "31 of 38 pages used, 7 scanned pages skipped"], ["failed", "password-protected PDF"],
  ["unreadable", "damaged PDF, Replace file"], ["interrupted", "tried 5 times, Try again, what happened"],
  ["partial-limit", "620-page manual, first 500 read, Replace with the first part"], ["partial-web", "3 web pages didn’t load, Re-read"], ["partial-mixed", "scans and past the limit"],
  ["upload", "Add sources mid-upload"], ["upload-errors", "upload stopped, unsupported, too large, password, duplicate"], ["dragging", "files over the page"],
  ["tray", "dialog closed, uploads continue"], ["editing", "a line open for editing"], ["save-error", "edit kept, retry"], ["conflict", "two sources disagree on price"],
];

export function KbShellDemo() {
  return (
    <div className="sg-shells">
      <div className="sg-shell sg-shell--full sg-shell--kb"><AppDemo frame="contained" hotkeys={false} initialView="knowledge" kb="sources" /></div>
      <div className="sg-shells__row">
        <div><Label>390px</Label><div className="sg-shell sg-shell--phone"><AppDemo frame="contained" hotkeys={false} initialView="knowledge" /></div></div>
        <div className="sg-card c-app"><Label>every state · /app?view=knowledge&amp;state=</Label>
          <ul className="sg-anatomy">{KB_URLS.map(([s, d]) => <li key={s || "live"}><a className="c-link" href={`/app?view=knowledge${s ? `&state=${s}` : ""}`}><code>{s || "(none)"}</code></a> · {d}</li>)}</ul>
          <p className="sg-faint" style={{ margin: "10px 0 0", fontSize: 12.5 }}>Review states are frozen snapshots; the live route runs the upload and reading simulators. Name a file “…password….pdf” to see the scan fail live.</p></div>
      </div>
    </div>
  );
}
