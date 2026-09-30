/**
 * Out of office (M8 decision, HANDOFF §15): an auto-reply is handled by Corral and leaves Needs you. When the
 * reply says when they’re back and Corral can read it, the thread comes back to Needs you on that date.
 * Plain module: no React.
 */
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_SHORT = MONTHS.map((m) => m[0].toUpperCase() + m.slice(1, 3));
/** Month index for "Oct", "October" or "Sept"; -1 for anything else ("Octopus"). */
const month = (w: string) => { const x = w.toLowerCase(); return MONTHS.findIndex((m) => m.startsWith(x)); };

/**
 * The return date in an auto-reply, or undefined when there isn’t one Corral can trust.
 * Reads "until 14 October", "back on Oct 14", "returning 14/10" (day first, as East Africa writes it).
 * A date before `today` rolls to next year ("until 3 January" written in December).
 */
export function returnDate(text: string, today: Date): Date | undefined {
  const t = text.replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  // Not "from": "away from 5 Oct until 14 Oct" gives the leaving day, not the return.
  const cue = "(?:until|till|back on|back|returning(?: on)?|return(?:ing)? on)";
  const make = (d: number, m: number) => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return undefined;
    const x = new Date(today.getFullYear(), m, d);
    if (x.getMonth() !== m) return undefined;
    if (x < new Date(today.getFullYear(), today.getMonth(), today.getDate())) x.setFullYear(x.getFullYear() + 1);
    return x;
  };
  let r = new RegExp(`${cue}\\s+(?:\\w+day,?\\s+)?(\\d{1,2})\\s+([A-Za-z]{3,})`, "i").exec(t);
  if (r && month(r[2]) >= 0) return make(Number(r[1]), month(r[2]));
  r = new RegExp(`${cue}\\s+(?:\\w+day,?\\s+)?([A-Za-z]{3,})\\.?\\s+(\\d{1,2})\\b`, "i").exec(t);
  if (r && month(r[1]) >= 0) return make(Number(r[2]), month(r[1]));
  r = new RegExp(`${cue}\\s+(\\d{1,2})/(\\d{1,2})\\b`, "i").exec(t);
  if (r) return make(Number(r[1]), Number(r[2]) - 1);
  return undefined;
}

/** When the thread comes back to Needs you: 08:00 on the return date, or never on its own (you’ll see it in All). */
export function backInNeedsYou(text: string, today: Date): { on?: Date; label: string } {
  const d = returnDate(text, today);
  if (!d) return { label: "No return date Corral could read. It stays in All; the sequence waits 14 days, then carries on." };
  d.setHours(8, 0, 0, 0);
  return { on: d, label: `Back in Needs you ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}, 08:00` };
}
