"use client";
/* /styleguide: M2 knowledge base (ENG-52). Every piece live, in the place it is used. */
import { useState, type ReactNode } from "react";
import {
  AppDemo, FileTile, KNOWLEDGE, KnowledgeEditor, QueueRow, SOURCES, SourceDetail, SourceList, SourceState, UploadDialog, UploadTray,
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
          <div className="sg-kb__states">{pick("pitch", "install", "blog", "gateway", "cert").map((s) => <SourceState key={s.id} src={s} />)}</div></div>
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
        <div key={s.id}><Label>{s.status.s === "ready" ? "ready" : s.status.s === "partial" ? "partly read" : s.status.s === "failed" ? "couldn't read" : "reading"}</Label>
          <div className="sg-kb__detail c-app"><SourceDetail src={s} knowledge={KNOWLEDGE} /></div></div>
      ))}
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
  ["loading", "skeleton at real sizes"], ["error", "couldn't load, nothing lost, retry"], ["sources", "ledger with live, partial and failed rows"],
  ["source", "ready source in the detail panel"], ["partial", "31 of 38 pages read"], ["failed", "password-protected PDF"],
  ["upload", "Add sources mid-upload"], ["upload-errors", "stopped, unsupported, too large, password, duplicate"], ["dragging", "files over the page"],
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
