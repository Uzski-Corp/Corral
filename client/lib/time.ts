/**
 * Dates as people read them in the app, in the viewer's time zone and Bau's formats:
 * "Today" / "Yesterday" / "Sep 27" for a day, "just now" / "12 min ago" / "2h ago" / "yesterday" /
 * "3 days ago" / "Sep 22" for how long ago, and "Today, 09:14" for a moment.
 * `now` is a parameter so tests (and the fixed demo date) stay deterministic.
 */
const MIN = 60_000;
const HOUR = 60 * MIN;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Whole calendar days from `d` to `now` (0 = same day, 1 = yesterday; negative = the future). */
export function daysBetween(d: Date, now: Date): number {
  return Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / (24 * HOUR));
}

const monthDay = (d: Date, now: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) });
const hhmm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export function parseTime(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Today", "Yesterday", "Sep 27" (with the year when it isn't this year). */
export function dayLabel(d: Date, now: Date): string {
  const days = daysBetween(d, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return monthDay(d, now);
}

/** "just now", "12 min ago", "2h ago", "yesterday", "3 days ago", then "Sep 22". Future times read "just now". */
export function agoLabel(d: Date, now: Date): string {
  const ms = now.getTime() - d.getTime();
  if (ms < MIN) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  const days = daysBetween(d, now);
  if (days === 0) return `${Math.floor(ms / HOUR)}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return monthDay(d, now);
}

/** "Today, 09:14", "Yesterday, 18:02", "Sep 27, 09:14". */
export function momentLabel(d: Date, now: Date): string {
  return `${dayLabel(d, now)}, ${hhmm(d)}`;
}
