"use client";
/* A real Corral screen on the marketing site (M10). Not a picture: the M1–M9 components themselves, on the
   sample workspace, at the frame's real width (so at 390 you see the phone layout). Quiet until you ask:
   the screen is inert and described in words; "Try it" hands you the controls. It mounts as it nears the
   viewport, showing the app's own skeleton until then, so the landing stays light. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/app/primitives";
import { AppSkeleton } from "@/components/app/States";

export function ProductFrame({ label, caption, children, height = 720, phone = 620, tone = "light", className, eager }: {
  /** What the screen shows, for screen readers and the Try it button: "the Unibox with Brian's objection drafted". */
  label: string;
  /** A line under the frame; the button sits beside it. Omit for a bare frame (captions elsewhere). */
  caption?: ReactNode;
  children: ReactNode;
  /** Frame height at desktop and at phone widths, in px. */
  height?: number; phone?: number;
  /** "photo": the caption sits on an image, light type. */
  tone?: "light" | "photo";
  className?: string;
  /** Mount at once (the hero), instead of when it nears the viewport. */
  eager?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (eager || !el || typeof IntersectionObserver === "undefined") { setMounted(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setMounted(true); io.disconnect(); } }, { rootMargin: "900px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, eager]);
  useEffect(() => { if (live) ref.current?.querySelector<HTMLElement>("button, a[href], input, [tabindex='0']")?.focus(); }, [live]);

  return (
    <figure className={cx("pf", `pf--${tone}`, live && "is-live", className)} style={{ "--pf-h": `${height}px`, "--pf-hp": `${phone}px` } as CSSProperties}>
      <div className="pf__win" role={live ? "region" : "img"} aria-label={live ? `${label}, sample data` : `Corral screen: ${label}. Sample data.`}>
        <div ref={ref} className="pf__app" inert={!live}>
          {mounted ? children : <AppSkeleton frame="contained" label={`Loading ${label}`} />}
        </div>
      </div>
      <figcaption className="pf__cap">
        {caption && <span className="pf__txt">{caption}</span>}
        <button type="button" className="pf__try" aria-pressed={live} onClick={() => setLive((v) => !v)}>
          <span className="pf__dot" aria-hidden="true" />{live ? "Done" : "Try it"}<span className="u-sr">{live ? `: stop using ${label}` : `: use ${label} with sample data`}</span>
        </button>
      </figcaption>
    </figure>
  );
}
