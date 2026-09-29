"use client";
/* Full-shell fallback for when the session check can't reach the API (M1 follow-up 4).
   The shell frame stays up so the product still feels like itself; the body says what failed,
   that nothing is lost, and offers one retry. It also retries on its own, calmly (every 30s). */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { Button } from "./primitives";
import { Spinner } from "./States";

export type SessionUnavailableProps = {
  /** Re-run the session check. Resolve `false` when it still fails. */
  onRetry?: () => Promise<boolean> | boolean | void;
  /** The request that failed, e.g. "GET /api/v1/auth/me · 503". Shown last, in mono. */
  detail?: string;
  /** When the check last failed, preformatted ("23:14"). */
  checkedAt?: string;
  /** Seconds between automatic retries. 0 turns them off. */
  autoRetrySeconds?: number;
  statusHref?: string;
};

export function SessionUnavailable({ onRetry, detail = "GET /api/v1/auth/me · 503 Service Unavailable", checkedAt, autoRetrySeconds = 30, statusHref = "#status" }: SessionUnavailableProps) {
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(autoRetrySeconds);
  const [tries, setTries] = useState(0);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const retry = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const ok = await Promise.resolve(onRetry?.());
    // Still here means it still failed (success unmounts this view).
    if (!mounted.current) return;
    setBusy(false);
    if (ok !== true) setTries((t) => t + 1);
    setLeft(autoRetrySeconds);
  }, [busy, onRetry, autoRetrySeconds]);

  useEffect(() => {
    if (!autoRetrySeconds || busy) return;
    const t = setTimeout(() => { if (left <= 1) void retry(); else setLeft(left - 1); }, 1000);
    return () => clearTimeout(t);
  }, [left, busy, autoRetrySeconds, retry]);

  return (
    <div className="c-offline" role="alert" aria-live="assertive">
      <div className="c-offline__box">
        <span className="c-offline__ic"><Icon name="alert" size={16} /></span>
        <h1>Corral can’t reach its servers</h1>
        <p>We couldn’t confirm your session because the Corral API isn’t answering. Nothing you’ve done is lost, and you’re still signed in.</p>
        <div className="c-actions">
          <Button variant="primary" onClick={() => void retry()} disabled={busy}>{busy ? <><Spinner />Checking…</> : <><Icon name="refresh" />Try again</>}</Button>
          <a className="c-btn" href={statusHref}>Status page</a>
        </div>
        <p className="c-offline__meta c-num">
          <span>{tries ? `Still unreachable after ${tries + 1} checks` : "Last check failed"}{checkedAt ? ` at ${checkedAt}` : ""}</span>
          <span aria-hidden="true">·</span>
          <span>{busy ? "Checking now" : autoRetrySeconds ? `Trying again in 0:${String(Math.max(left, 0)).padStart(2, "0")}` : "Automatic retries off"}</span>
        </p>
        <span className="c-mono c-offline__detail">{detail}</span>
      </div>
    </div>
  );
}
