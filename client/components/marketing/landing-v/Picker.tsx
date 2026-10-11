"use client";
/* The prototype picker, from Emil Kowalski's `prototype` skill (PICKER.md), markup and styles verbatim. Harness chrome,
   not part of the design: it is styled by picker.css, never by the landing tokens. Each variant is its own route
   (/v/1–/v/4, the static build needs real pages), so switching navigates instead of using ?v=; the swap is instant.
   Keys: 1–4 and ←/→ switch, R replays the entrance. Delete this file and picker.css when a variant is promoted. */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "./picker.css";

export function Picker({ names, current }: { names: string[]; current: number }) {
  const router = useRouter();
  const nav = useRef<HTMLElement>(null);
  const hl = useRef<HTMLSpanElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const move = () => {
      const el = items.current[current]; const h = hl.current;
      if (!el || !h) return;
      h.style.width = `${el.offsetWidth}px`;
      h.style.transform = `translateX(${el.offsetLeft}px)`;
    };
    move();
    window.addEventListener("resize", move);
    return () => window.removeEventListener("resize", move);
  }, [current]);
  useEffect(() => { const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true))); return () => cancelAnimationFrame(id); }, []);

  useEffect(() => {
    const go = (i: number) => { if (i >= 0 && i < names.length && i !== current) router.push(`/v/${i + 1}`, { scroll: false }); };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= names.length) go(n - 1);
      else if (e.key === "ArrowRight") go((current + 1) % names.length);
      else if (e.key === "ArrowLeft") go((current - 1 + names.length) % names.length);
      else if (e.key === "r" || e.key === "R") window.dispatchEvent(new Event("proto:replay"));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, names.length, router]);

  return (
    <nav ref={nav} className="proto-picker" aria-label="Prototype variants" data-ready={ready ? "" : undefined}>
      <span ref={hl} className="proto-picker-highlight" aria-hidden="true" />
      {names.map((n, i) => (
        <button key={n} ref={(el) => { items.current[i] = el; }} type="button" className="proto-picker-item"
          data-active={i === current ? "" : undefined} aria-current={i === current ? "true" : undefined}
          onClick={() => i !== current && router.push(`/v/${i + 1}`, { scroll: false })}>{n}</button>
      ))}
      <span className="proto-picker-divider" aria-hidden="true" />
      <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={() => window.dispatchEvent(new Event("proto:replay"))}>↻</button>
    </nav>
  );
}

/** Re-mounts its children on R / ↻ so the entrance runs again. */
export function Replay({ children }: { children: React.ReactNode }) {
  const [k, setK] = useState(0);
  useEffect(() => { const f = () => setK((x) => x + 1); window.addEventListener("proto:replay", f); return () => window.removeEventListener("proto:replay", f); }, []);
  return <div key={k} style={{ display: "contents" }}>{children}</div>;
}
