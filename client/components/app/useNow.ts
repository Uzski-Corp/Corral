"use client";
import { useEffect, useState } from "react";

/** M13 (gap 4): the real "now" for anything measured against the clock (key expiry, last used). Never a fixed sample date.
 *  Read once on mount (a lazy initialiser keeps render pure), then refreshed every `everyMs` so "Expires in 3 days" turns over. */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!everyMs) return;
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
