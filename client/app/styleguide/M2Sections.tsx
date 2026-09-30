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
          <div className="sg-kb__states">{[...pick("pitch", "install", "blog", "gateway", "cert"), REVIEW_SOURCES.unreadable, REVIEW_SOURCES.interrupted].map((s) => <SourceState key={s.id} src={s} />)}</div></div>
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

/* M10b (PR #67): the three source failures the KB backend adds or reshapes, beside the existing ones. */
const SOURCE_FAILURES: { code: string; when: string; says: string; does: string }[] = [
  { code: "unreadable", when: "status failed · failure unreadable · parse or scan", says: "Corral couldn’t read this file. It may be damaged, or it took too long to open.", does: "Replace file (replace_source_id). What happened: stage, reason (the server’s note), cause, your file." },
  { code: "partial", when: "status partial · pages_read / pages_total / skipped / note", says: "31 of 38 pages used · 7 skipped. They’re scanned images with no text layer; no OCR yet.", does: "Upload a text version (replace). Page strip: used in ink, skipped hatched." },
  { code: "interrupted", when: "status failed · failure interrupted · any stage", says: "Reading stopped. Corral tried again on its own and still couldn’t finish. Your file is kept.", does: "Try again (POST …/reread). What happened, open: stage, reason, retries, last try. At upload: Upload again." },
];

export function SourceFailuresDemo() {
  const unread = REVIEW_SOURCES.unreadable, slow = REVIEW_SOURCES["unreadable-timeout"], stop = REVIEW_SOURCES.interrupted;
  const lost = { ...stop, id: "fleet-lost", name: "Installer checklist.md", kind: "md" as const, meta: "9 KB", status: { s: "failed" as const, failure: "interrupted" as const, at: "upload" as const, note: "The upload wasn't stored.", when: "Today, 09:31" } };
  return (
    <div className="sg-kb">
      <div className="sg-kb__details">
        {([["unreadable · damaged file", unread], ["unreadable · parse timeout", slow], ["interrupted · retries used up", stop], ["interrupted at upload · file lost", lost]] as const).map(([l, s]) => (
          <div key={s.id}><Label>{l}</Label><div className="sg-kb__detail c-app"><SourceDetail src={s} knowledge={KNOWLEDGE} /></div></div>
        ))}
      </div>
      <div className="sg-kb__row sg-kb__row--top">
        <div className="sg-card c-app"><Label>partial · the page strip at 38, 12 and 3 pages</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 336 }}>
            <PageStrip total={38} skipped={[12, 13, 14, 15, 16, 17, 18]} why="scanned" />
            <PageStrip total={12} skipped={[1, 12]} why="scanned" />
            <PageStrip total={3} skipped={[2]} why="scanned" />
          </div></div>
        <div className="sg-card c-app"><Label>the three, against PR #67</Label>
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
  ["unreadable", "damaged PDF, Replace file"], ["interrupted", "retries used up, Try again, what happened"],
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
