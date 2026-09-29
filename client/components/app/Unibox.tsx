"use client";
import { useEffect, useState } from "react";
import { LEADS, THREADS, type Thread } from "./data";
import { Avatar, FitBar, Kbd, Logo, Receipt, Receipts, Tag, cx } from "./primitives";
import { ReplyCard } from "./ReplyCard";

export function ThreadList({ threads, active, onPick, title = "Needs you", count = 12 }: { threads: Thread[]; active: string; onPick?: (id: string) => void; title?: string; count?: number }) {
  return (
    <div className="c-threads" role="listbox" aria-label={title}>
      <div className="c-threads__head"><span><span className="c-strong" style={{ fontSize: 14 }}>{title}</span> <span className="c-faint">{count}</span></span><span style={{ display: "flex", gap: 4 }}><Kbd>J</Kbd><Kbd>K</Kbd></span></div>
      {threads.map((t) => (
        <button key={t.id} role="option" aria-selected={t.id === active} className={cx("c-thread", t.id === active && "is-active", t.unread && t.id !== active && "is-unread")} onClick={() => onPick?.(t.id)}>
          <Avatar id={t.avatar} size={28} />
          <div className="c-thread__body">
            <div className="c-thread__top"><span className="c-strong">{t.name}</span><span className="c-faint" style={{ fontSize: 12 }}>{t.time}</span></div>
            <span className="c-muted" style={{ fontSize: 12.5 }}>{t.company}</span>
            <div className="c-thread__snip">{t.snippet}</div>
            <div style={{ paddingTop: 4 }}><Tag status={t.status} /></div>
          </div>
        </button>
      ))}
    </div>
  );
}

export function ReadingPane({ t }: { t: Thread }) {
  return (
    <div className="c-pane">
      <div className="c-pane__head"><Avatar id={t.avatar} size={36} />
        <div className="c-person__txt"><span className="c-strong" style={{ fontSize: 14 }}>{t.name}</span><span style={{ fontSize: 12.5 }}>{t.title} · {t.company} · Fit {t.fit} for ColdTrace Sensors</span></div>
        <span style={{ flex: 1 }} /><Tag status={t.status} /></div>
      <div className="c-pane__body">
        {t.id === "brian" && (
          <div className="c-quoted"><div className="c-faint" style={{ display: "flex", gap: 8, fontSize: 12.5, whiteSpace: "nowrap" }}>
            <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>You</span><span>· Cold-room pilot, step 2 · Thu 24 Sep, 08:10</span><span style={{ flex: 1 }} /><span>Opened 3×</span></div>
            <p>Brian, your March post about the Likoni container stuck with me. Four rooms, fish and dairy, and no one gets paged when a door is left open…</p></div>
        )}
        <div className="c-faint" style={{ fontSize: 12.5 }}>{t.name} replied · {t.subject} · {t.time}</div>
        <p className="c-message">{t.body}</p>
        <Receipts>{t.receipts.map(([a, b]) => <Receipt key={a} meta={b}>{a}</Receipt>)}</Receipts>
        {t.draft && <ReplyCard paragraphs={t.draft} highlight={t.id === "brian" ? "paid the sensors back in one quarter" : undefined} />}
        {t.next && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}><span className="c-rail__label">If {t.name.split(" ")[0]} goes quiet</span>
            {t.next.map(([d, s, m]) => <div key={s} className="c-next"><span className="c-mono">{d}</span><span>{s}</span><span style={{ flex: 1 }} /><span className="c-faint">{m}</span></div>)}</div>
        )}
      </div>
    </div>
  );
}

export function ContextRail({ t }: { t: Thread }) {
  const lead = LEADS.find((l) => l.company === t.company)!;
  const pwani = t.company === "Pwani Fresh";
  const people: [string, string, string, string][] = pwani
    ? [["kamau", "Brian Kamau", "COO", "Replied"], ["mark", "Mark Ellison", "CFO", "—"], ["lena", "Lena Fischer", "Head of Quality", "—"]]
    : [[t.avatar, t.name, t.title, "Replied"]];
  return (
    <aside className="c-rail">
      <div className="c-rail__sec"><div style={{ display: "flex", alignItems: "center", gap: 9 }}><Logo company={t.company} /><span className="c-strong" style={{ fontSize: 14 }}>{t.company}</span></div><span className="c-mono">{lead.domain}{pwani ? " · Mombasa · 200–500" : ""}</span></div>
      <div className="c-rail__sec"><span className="c-rail__label">Fit for ColdTrace Sensors</span><FitBar value={t.fit} size="lg" /><span style={{ lineHeight: "20px" }}>{pwani ? "Four cold rooms, fish and dairy, no live alerting. Lost a container in March, per their own blog." : lead.why.join(". ") + "."}</span></div>
      <div className="c-rail__sec" style={{ gap: 0 }}><span className="c-rail__label" style={{ paddingBottom: 4 }}>Key people</span>
        {people.map(([a, n, ti, s]) => <div key={n} className="c-person"><Avatar id={a} size={24} /><div className="c-person__txt"><span className="c-strong">{n}</span><span>{ti}</span></div><span style={{ flex: 1 }} /><span className="c-faint" style={{ fontSize: 12 }}>{s}</span></div>)}</div>
      <div className="c-rail__sec"><span className="c-rail__label">Sequence</span><span style={{ color: "var(--color-text-body)" }}>Cold-room pilot · step 2 of 4 · paused on reply</span></div>
      {pwani && <div className="c-rail__sec"><span className="c-rail__label">Signals</span><Receipts><Receipt meta="LinkedIn · 6d">Hiring: cold-chain supervisor</Receipt><Receipt meta="blog · 3w">New site: Kilifi depot</Receipt></Receipts></div>}
    </aside>
  );
}

/** Live Unibox: click a thread (or J / K while hovered) to read it. */
export function Unibox({ className, rail = true, initial = "brian" }: { className?: string; rail?: boolean; initial?: string }) {
  const [active, setActive] = useState(initial);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "j" && e.key !== "k") return;
      const i = THREADS.findIndex((t) => t.id === active);
      const n = THREADS[(i + (e.key === "j" ? 1 : THREADS.length - 1)) % THREADS.length];
      setActive(n.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hover, active]);
  const t = THREADS.find((x) => x.id === active)!;
  return (
    <div className={cx("c-win", className)} aria-label="Corral app: Unibox" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <ThreadList threads={THREADS} active={active} onPick={setActive} />
      <ReadingPane t={t} />
      {rail && <ContextRail t={t} />}
    </div>
  );
}
