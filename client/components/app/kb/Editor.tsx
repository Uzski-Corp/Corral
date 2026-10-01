"use client";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../icons";
import { Button, cx } from "../primitives";
import { DropdownMenu } from "../Overlays";
import { FormField, Switch, TextInput, Textarea } from "../Form";
import { Banner, Spinner } from "../States";
import { PRODUCT, sourceName, type Cite, type KItem, type KSection, type Source } from "./data";
import { FileTile } from "./parts";

export type SaveState = "idle" | "saving" | "saved" | "error";
export type EditorAttention = { id: string; section: string; kind: "review" | "stale" | "conflict" };
export const attentionOf = (sections: KSection[]): EditorAttention[] =>
  sections.flatMap((s) => s.items.filter((i) => i.flag).map((i) => ({ id: i.id, section: s.title, kind: i.flag!.f })));

const ATTN_LABEL = { review: "new line to check", stale: "source was removed", conflict: "sources disagree" } as const;
const scrollToItem = (id: string) => document.getElementById(`k-item-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });

/* ------------------------------------------------------------ citation chip */
export function CiteChip({ cite, sources, onOpen, onRemove }: { cite: Cite; sources: Source[]; onOpen?: (id: string) => void; onRemove?: () => void }) {
  const src = sources.find((s) => s.id === cite.src);
  const name = sourceName(cite.src, sources);
  const gone = !src;
  const body = <><FileTile kind={src?.kind ?? "pdf"} size={20} host={src?.host} /><span className="k-cite__name">{name}</span>{cite.loc && <span className="k-cite__loc">{cite.loc}</span>}</>;
  return (
    <span className={cx("k-cite", gone && "is-gone")}>
      {gone || !onOpen ? <span className="k-cite__btn">{body}{gone && <span className="k-sr"> (removed)</span>}</span>
        : <button type="button" className="k-cite__btn" onClick={() => onOpen(cite.src)} aria-label={`Open source ${name}${cite.loc ? `, ${cite.loc}` : ""}`}>{body}</button>}
      {onRemove && <button type="button" className="k-cite__x" aria-label={`Remove citation ${name}`} onClick={onRemove}><Icon name="x" size={11} /></button>}
    </span>
  );
}

/* ------------------------------------------------------------ one line of knowledge */
function ItemEditor({ item, sources, save, onSave, onCancel, section }: {
  item: KItem; sources: Source[]; save: SaveState; section: KSection; onSave: (next: KItem) => void; onCancel: () => void;
}) {
  const [q, setQ] = useState(item.q ?? "");
  const [body, setBody] = useState(item.body);
  const [cites, setCites] = useState(item.cites);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => { const a = wrap.current?.querySelector("textarea"); if (a) { a.focus(); a.setSelectionRange(a.value.length, a.value.length); } }, []);
  const isObj = section.id === "objections";
  const submit = () => { if (body.trim()) onSave({ ...item, q: isObj ? q : item.q, body: body.trim(), cites }); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
  };
  const addable = sources.filter((s) => s.status.s !== "failed" && !cites.some((c) => c.src === s.id));
  return (
    <div ref={wrap} className="k-edit" onKeyDown={onKey}>
      {save === "error" && <Banner tone="error" title="Couldn’t save this line." action={<Button onClick={submit}>Try again</Button>}>Your edit is still here. Corral keeps using the previous version until it saves.</Banner>}
      {isObj && <FormField label="When they say"><TextInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="We already use data loggers." /></FormField>}
      <FormField label={isObj ? "Corral answers" : "What Corral can say"}>
        <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      </FormField>
      <div className="k-edit__cites">
        <span className="k-edit__label">Sources</span>
        {cites.map((c, i) => <CiteChip key={c.src + i} cite={c} sources={sources} onRemove={() => setCites((l) => l.filter((_, j) => j !== i))} />)}
        <DropdownMenu width={280} label="Cite a source" items={addable.length ? addable.map((s) => ({ label: s.name, lead: <FileTile kind={s.kind} size={20} host={s.host} />, onSelect: () => setCites((l) => [...l, { src: s.id }]) })) : [{ label: "Every source is cited", disabled: true }]}
          trigger={(tp) => <button type="button" className="c-chip c-chip--add" {...tp}><Icon name="plus" size={12} />Cite a source</button>} />
        {!cites.length && <span className="k-edit__nocite">{section.id === "never" ? "Rules don't need a source." : "Without a source, Corral treats this as your claim."}</span>}
      </div>
      <div className="k-edit__foot">
        <span className="k-edit__keys"><span className="c-kbd">⌘</span><span className="c-kbd">↵</span> save · <span className="c-kbd">Esc</span> cancel</span>
        <Button variant="quiet" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={save === "saving" || !body.trim()}>{save === "saving" ? <><Spinner size={12} />Saving</> : "Save"}</Button>
      </div>
    </div>
  );
}

function Provenance({ item }: { item: KItem }) {
  const n = item.cites.length;
  return item.by === "you"
    ? <span className="k-prov"><span className="k-prov__who is-you">Edited by you</span> · {item.when}</span>
    : <span className="k-prov"><span className="k-prov__who">Drafted by Corral</span> from {n} {n === 1 ? "source" : "sources"} · {item.when}</span>;
}

function Item({ item, section, sources, editing, save, onEdit, onSave, onCancel, onResolve, onRemove, onOpenSource }: {
  item: KItem; section: KSection; sources: Source[]; editing: boolean; save: SaveState;
  onEdit: () => void; onSave: (n: KItem) => void; onCancel: () => void; onResolve: (n: KItem) => void; onRemove: () => void; onOpenSource: (id: string) => void;
}) {
  const f = item.flag;
  return (
    <div id={`k-item-${item.id}`} className={cx("k-item", f && `has-${f.f}`, editing && "is-editing")}>
      {editing ? <ItemEditor item={item} section={section} sources={sources} save={save} onSave={onSave} onCancel={onCancel} /> : <>
        <div className="k-item__main">
          {item.q && <p className="k-item__q">“{item.q}”</p>}
          <p className="k-item__body">{item.body}</p>
          {f?.f === "review" && (
            <div className="k-flag"><span className="k-flag__txt"><b>New.</b> {f.note} Check it reads right before Corral uses it.</span>
              <span className="k-flag__acts"><Button onClick={() => onResolve({ ...item, flag: undefined })}>Looks right</Button><Button variant="quiet" onClick={onRemove}>Remove</Button></span></div>
          )}
          {f?.f === "stale" && (
            <div className="k-flag"><span className="k-flag__txt"><b>Its source was removed.</b> {f.removed} was removed on {f.when}. Corral won&rsquo;t quote this until you keep it as your own claim or cite another source.</span>
              <span className="k-flag__acts"><Button onClick={() => onResolve({ ...item, flag: undefined, cites: [], by: "you", when: "just now" })}>Keep as my claim</Button><Button variant="quiet" onClick={onEdit}>Cite another</Button></span></div>
          )}
          {f?.f === "conflict" && (
            <div className="k-flag k-flag--conflict">
              <span className="k-flag__txt"><b>Two sources disagree.</b> Corral is using the newer one. Pick the one that&rsquo;s right and it&rsquo;ll stop asking.</span>
              <ul className="k-opts">
                {f.options.map((o) => (
                  <li key={o.src}>
                    <span className="k-opts__txt"><b>{o.text}</b><span>{sourceName(o.src, sources)}{o.loc && ` · ${o.loc}`} · {o.when}{o.newer && <span className="k-newer">newer</span>}</span></span>
                    <Button onClick={() => onResolve({ ...item, flag: undefined, by: "you", when: "just now", body: item.body.replace(/\$\d+ per sensor per month/, o.text), cites: [{ src: o.src, loc: o.loc }] })}>Use this</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="k-item__foot">
            <Provenance item={item} />
            <button type="button" className="k-item__edit" onClick={onEdit} aria-label={`Edit: ${item.q ?? item.body.slice(0, 48)}`}><Icon name="pen" size={12} />Edit</button>
          </div>
        </div>
        <div className="k-item__cites" aria-label="Sources">
          {item.cites.map((c, i) => <CiteChip key={c.src + i} cite={c} sources={sources} onOpen={onOpenSource} />)}
          {!item.cites.length && <span className="k-nil">{section.id === "never" ? "Your rule" : "Your claim · no source"}</span>}
        </div>
      </>}
    </div>
  );
}

/* ------------------------------------------------------------ the document */
export function KnowledgeEditor({ sections, onChange, sources, initialEditing, failFirstSave, initialFocus, onOpenSource, onShowSources }: {
  sections: KSection[]; onChange: (s: KSection[]) => void; sources: Source[];
  /** item id to open in edit mode (review states) */ initialEditing?: string;
  /** open with the save-error banner showing (state=save-error); Try again then saves */ failFirstSave?: boolean;
  initialFocus?: string; onOpenSource: (id: string) => void; onShowSources: () => void;
}) {
  const [editing, setEditing] = useState<string | undefined>(initialEditing);
  const [save, setSave] = useState<SaveState>(failFirstSave ? "error" : "idle");
  const [savedAt, setSavedAt] = useState("2 min ago");
  const [quote, setQuote] = useState(false);
  useEffect(() => { if (initialFocus ?? initialEditing) setTimeout(() => scrollToItem((initialFocus ?? initialEditing)!), 60); }, [initialFocus, initialEditing]);
  const attention = attentionOf(sections);
  const busy = sources.filter((s) => s.status.s === "processing").length;
  const passages = sources.reduce((t, s) => t + (s.status.s === "ready" || s.status.s === "partial" ? s.passages ?? 0 : 0), 0);

  const put = useCallback((id: string, next: KItem | null) => onChange(sections.map((s) => ({ ...s, items: next ? s.items.map((i) => (i.id === id ? next : i)) : s.items.filter((i) => i.id !== id) }))), [sections, onChange]);
  const commit = (next: KItem) => {
    setSave("saving");
    setTimeout(() => {
      put(next.id, { ...next, by: "you", when: "just now", flag: next.flag?.f === "stale" && next.cites.length ? undefined : next.flag });
      setSave("saved"); setSavedAt("just now"); setEditing(undefined);
    }, 700);
  };
  const added = useRef(0);
  const add = (sid: string) => {
    const id = `new-${sid}-${++added.current}`;
    onChange(sections.map((s) => (s.id === sid ? { ...s, items: [...s.items, { id, body: "", cites: [], by: "you", when: "just now", q: sid === "objections" ? "" : undefined }] } : s)));
    setEditing(id);
  };
  const cancel = (it: KItem) => { if (!it.body) put(it.id, null); setEditing(undefined); if (save === "error") setSave("idle"); };

  return (
    <div className="k-doc">
      <nav className="k-index" aria-label="Sections">
        <span className="k-index__label">On this page</span>
        <ul>
          {sections.map((s) => {
            const flags = s.items.filter((i) => i.flag).length;
            const onlyReview = flags > 0 && s.items.every((i) => !i.flag || i.flag.f === "review");
            return <li key={s.id}><a href={`#k-sec-${s.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`k-sec-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
              <span>{s.title}</span>{flags ? <span className={cx("k-index__flag", onlyReview && "is-info")} aria-label={`${flags} to review`}>{flags}</span> : <span className="k-index__n">{s.items.length}</span>}</a></li>;
          })}
        </ul>
        <button type="button" className="k-index__src" onClick={onShowSources}>
          <span>{sources.length} sources · {passages} passages</span>
          {busy > 0 && <em><span className="k-live" aria-hidden="true" />{busy} being read</em>}
        </button>
      </nav>

      <article className="k-page" aria-labelledby="k-title">
        <header className="k-page__head">
          <span className="k-eyebrow">Product knowledge</span>
          <h1 id="k-title">{PRODUCT.name}</h1>
          <p className="k-lede">What Corral knows about this product. It uses every line here to score companies, write first lines and answer replies, and cites where each one came from. Change anything; your edits win over the sources.</p>
          <p className="k-save" role="status" aria-live="polite">
            {save === "saving" ? <><Spinner size={11} />Saving…</> : save === "error" ? <span className="is-error"><Icon name="alert" size={12} />Last change not saved</span> : <><Icon name="check" size={12} />All changes saved · {savedAt}</>}
          </p>
        </header>

        {attention.length > 0 && (
          <div className="k-attn" role="region" aria-label="Needs you">
            <p><b>{attention.length} {attention.length === 1 ? "line needs" : "lines need"} you</b> before Corral uses {attention.length === 1 ? "it" : "them"} in emails.</p>
            <ul>{attention.map((a) => <li key={a.id}><button type="button" onClick={() => scrollToItem(a.id)}><span className={cx("k-dot", a.kind === "review" ? "is-info" : "is-warn")} aria-hidden="true" />{a.section}<em>{ATTN_LABEL[a.kind]}</em><Icon name="arrow" size={12} /></button></li>)}</ul>
          </div>
        )}

        {sections.map((s) => (
          <section key={s.id} id={`k-sec-${s.id}`} className="k-sec" aria-labelledby={`k-sec-${s.id}-t`}>
            <header className="k-sec__head">
              <h2 id={`k-sec-${s.id}-t`}>{s.title}</h2>
              <p>{s.hint}</p>
            </header>
            {s.id === "pricing" && <div className="k-sec__opt"><Switch checked={quote} onChange={setQuote} label="Corral may quote prices in emails" description={quote ? "Prices below can appear in first emails and replies." : "Off: Corral says “happy to share pricing on a call” instead."} /></div>}
            {s.items.map((it) => (
              <Item key={it.id} item={it} section={s} sources={sources} editing={editing === it.id} save={editing === it.id ? save : "idle"}
                onEdit={() => { setEditing(it.id); setSave("idle"); }}
                onSave={commit} onCancel={() => cancel(it)} onResolve={(n) => put(it.id, n)} onRemove={() => put(it.id, null)} onOpenSource={onOpenSource} />
            ))}
            <button type="button" className="k-add" onClick={() => add(s.id)}><Icon name="plus" size={12} />{s.add}</button>
          </section>
        ))}
      </article>
    </div>
  );
}
