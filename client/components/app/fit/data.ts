/* M5 sample fit scores (ENG-55). Kilima is written out in full; every other company gets a plausible
   score built from its row, so the panel works for any lead. Review states swap in the edge cases. */
import type { Lead } from "../data";
import type { FitBasis, FitCheck, FitEvidence, FitScore, FitStatus, Verdict } from "@/lib/fit/score";
import type { LeadsReviewState } from "@/lib/leads/state";

export const FIT_PRODUCT = "ColdTrace Sensors";

const B = {
  rooms: { section: "who", title: "Who it's for", text: "Operations and quality leads at dairies, meat processors and cold-chain logistics firms with three or more cold rooms." },
  pain: { section: "pains", title: "Pains it solves", text: "Spoilage is found in the morning, after a compressor failed overnight and nobody knew." },
  size: { section: "who", title: "Who it's for", text: "Companies of 51–1,000 people (the product's ICP sizes)." },
  buyer: { section: "who", title: "Who it's for", text: "Operations and quality leads …" },
  region: { section: "who", title: "Who it's for", text: "Kenya, Uganda, Tanzania and Rwanda (where ColdTrace installs)." },
  alerting: { section: "pains", title: "Pains it solves", text: "Wi-Fi loggers drop out in basement and concrete cold rooms, so the gaps show up exactly where the risk is." },
} satisfies Record<string, FitBasis>;

const LABEL = {
  rooms: "Runs its own cold rooms",
  pain: "Loses stock when a cold room fails",
  size: "Between 51 and 1,000 people",
  buyer: "Has an operations or quality lead to write to",
  region: "In a country ColdTrace installs in",
  alerting: "No live alerting today",
};
const W = { rooms: 30, pain: 25, size: 15, buyer: 10, region: 10, alerting: 10 };
type Id = keyof typeof W;

const ck = (id: Id, verdict: Verdict, points: number, finding: string, evidence: FitEvidence[], missing?: FitCheck["missing"]): FitCheck =>
  ({ id, label: LABEL[id], weight: W[id], verdict, points, finding, evidence, basis: B[id], missing });

/** Kilima Dairies: the full story, every check with its source. */
export const KILIMA_FIT: FitScore = {
  product: FIT_PRODUCT, value: 94, at: "2026-09-27", pages: 38, kbLines: 5,
  history: [{ at: "2026-09-12", value: 94, why: [] }],
  checks: [
    ck("rooms", "met", 30, "Runs three cold rooms at its Nakuru plant, about 400 tonnes", [
      { kind: "site", quote: true, text: "Our Nakuru plant runs three cold rooms holding up to 400 tonnes of milk and yoghurt.", where: "kilima.co.ke/about", at: "2026-09-02", field: "industry" }]),
    ck("pain", "met", 25, "Lost a night's milk to a compressor failure in March", [
      { kind: "site", quote: true, text: "In March a compressor failed overnight and we lost 6,000 litres before the morning shift found it.", where: "kilima.co.ke/news/march-update", at: "2026-09-02" }]),
    ck("size", "partly", 12, "201–1,000 people: in range, at the top end, where groups sometimes buy centrally", [
      { kind: "dropcontact", text: "Company size 201–1,000", where: "Dropcontact", at: "2026-09-03", field: "size" },
      { kind: "corral", text: "Careers page lists 14 openings across 2 sites", where: "kilima.co.ke/careers", at: "2026-09-02", field: "size" }]),
    ck("buyer", "met", 10, "Wanjiru Mwangi, Head of Supply Chain, is named and reachable", [
      { kind: "site", text: "Named on the Team page", where: "kilima.co.ke/team", at: "2026-09-02", field: "person" },
      { kind: "hunter", text: "Same name and company, 91% confidence", where: "Hunter", at: "2026-09-03", field: "person" }]),
    ck("region", "met", 10, "Kenya", [{ kind: "site", text: "Address in the site footer: Nakuru, Kenya", where: "kilima.co.ke", at: "2026-09-02", field: "country" }]),
    ck("alerting", "partly", 7, "Uses paper logs; tried Wi-Fi loggers last year and dropped them", [
      { kind: "site", quote: true, text: "We trialled Wi-Fi loggers in 2025, but they kept dropping out in the basement rooms, so we went back to paper.", where: "kilima.co.ke/blog/haccp-audit", at: "2026-09-02" }]),
  ],
};

/** A plausible score for any lead: checks follow the row's size, country and person; the rest carry the remaining points. */
export function scoreFor(l: Lead, value = l.fit, at = "2026-09-27"): FitScore {
  if (l.id === "kilima" && value === 94) return KILIMA_FIT;
  const site = (path = "") => `${l.domain}${path}`;
  const size: [Verdict, number, string] = l.size === "51–200" || l.size === "201–1,000" ? ["met", 15, `${l.size} people`]
    : l.size === "1–50" ? ["missed", 3, "1–50 people: smaller than the range; owners buy, but budgets are tight"]
    : l.size === "1,000+" ? ["partly", 8, "1,000+ people: bigger than the range; likely a central buyer"] : ["unknown", 0, "Company size not found"];
  const inRegion = ["Kenya", "Uganda", "Tanzania", "Rwanda"].includes(l.country ?? "");
  const region: [Verdict, number, string] = inRegion ? ["met", 10, l.country!] : ["missed", 0, `${l.country ?? "Unknown country"}: outside where ColdTrace installs`];
  const buyerOk = /ops|operat|quality|supply|plant|cold|logistics|fleet|warehouse|qa/i.test(l.title);
  const buyer: [Verdict, number, string] = !l.person ? ["unknown", 0, "No one found to write to yet"] : buyerOk ? ["met", 10, `${l.person}, ${l.title}, is named and reachable`] : ["partly", 5, `${l.person} (${l.title}) is reachable, but not the usual buyer`];
  const fixed = size[1] + region[1] + buyer[1];
  // Rooms, pain and alerting share what's left, in proportion to their weight.
  let rest = Math.max(0, value - fixed);
  const share = (w: number, cap: number) => { const p = Math.min(cap, Math.round((rest * w) / 65)); return p; };
  const rooms = share(30, 30), pain = share(25, 25);
  let alerting = Math.min(10, rest - rooms - pain);
  if (alerting < 0) alerting = 0;
  rest = value - fixed - rooms - pain - alerting; // rounding spill goes to rooms, within its weight
  const roomsP = Math.min(30, rooms + Math.max(0, rest));
  const v = (p: number, w: number): Verdict => (p >= w * 0.85 ? "met" : p >= w * 0.35 ? "partly" : "missed");
  const ind = (l.industry ?? "food").toLowerCase();
  const read = "2026-09-02";
  return {
    product: FIT_PRODUCT, value: fixed + roomsP + pain + alerting, at, pages: 14 + (l.company.length % 20), kbLines: 5,
    checks: [
      ck("rooms", v(roomsP, 30), roomsP, roomsP >= 26 ? `Runs cold rooms for its ${ind} business` : roomsP >= 11 ? `Stores ${ind} cold, but the rooms may be rented` : `No sign of cold rooms of its own`,
        [{ kind: "site", text: l.why[0] ?? `Read the About page of ${l.domain}`, where: site("/about"), at: read, field: "industry" }]),
      ck("pain", v(pain, 25), pain, pain >= 21 ? (l.why[1] ?? "Mentions spoilage and a failed cold room") : pain >= 9 ? "Mentions temperature audits, not losses" : "Nothing about spoilage or monitoring",
        [{ kind: "site", text: l.why[1] ?? "Read the News and Quality pages", where: site("/news"), at: read }]),
      ck("size", size[0], size[1], size[2], [{ kind: "dropcontact", text: `Company size ${l.size ?? "unknown"}`, where: "Dropcontact", at: "2026-09-03", field: "size" }]),
      ck("buyer", buyer[0], buyer[1], buyer[2], l.person ? [{ kind: "site", text: "Named on the Team page", where: site("/team"), at: read, field: "person" }] : []),
      ck("region", region[0], region[1], region[2], [{ kind: "site", text: "Address in the site footer", where: l.domain, at: read, field: "country" }]),
      ck("alerting", v(alerting, 10), alerting, alerting >= 9 ? "Paper or manual temperature logs; no alerting vendor named" : alerting >= 4 ? "A logger brand is named, without alerts" : "Already uses a monitoring vendor",
        [{ kind: "site", text: l.why[2] ?? "Read the Quality page", where: site("/quality"), at: read }]),
    ],
  };
}

/** Zanzibar Spice Cold Rooms: a one-page site. Two checks have nothing behind them, so the score is a floor. */
function zanzibarLow(l: Lead): FitScore {
  return {
    product: FIT_PRODUCT, value: 53, at: "2026-09-28", pages: 1, kbLines: 5,
    checks: [
      ck("rooms", "met", 30, "The home page offers cold-room space for spice exporters", [
        { kind: "site", quote: true, text: "Temperature-controlled rooms for cloves and vanilla, by the pallet or by the month.", where: `${l.domain}`, at: "2026-09-28", field: "industry" }]),
      ck("pain", "unknown", 0, "Nothing on the site about spoilage, audits or losses", [], { field: "industry", ask: "Tell Corral what they struggle with" }),
      ck("size", "missed", 3, "1–50 people: smaller than the range; the owner buys, but budgets are tight", [
        { kind: "dropcontact", text: "Company size 1–50", where: "Dropcontact", at: "2026-09-28", field: "size" }]),
      ck("buyer", "met", 10, "Fatma Said, Owner, signs the home page", [{ kind: "site", text: "Signed “Fatma Said, Owner”", where: `${l.domain}`, at: "2026-09-28", field: "person" }]),
      ck("region", "met", 10, "Tanzania (Zanzibar)", [{ kind: "site", text: "Address on the home page", where: `${l.domain}`, at: "2026-09-28", field: "country" }]),
      ck("alerting", "unknown", 0, "No word on how they watch temperatures today", [], { field: "industry", ask: "Tell Corral how they monitor today" }),
    ],
  };
}

const withHistory = (s: FitScore, h: FitScore["history"]): FitScore => ({ ...s, history: h });

/** Which company each fit review state opens, and the tab it needs. */
export const FIT_OPEN: Partial<Record<LeadsReviewState, { id: string; tab?: "all" | "fit" }>> = {
  fit: { id: "kilima" }, "fit-scoring": { id: "tamu" }, "fit-none": { id: "savanna", tab: "all" }, "fit-low": { id: "zanzibar", tab: "all" },
  "fit-changed": { id: "nyota" }, "fit-override": { id: "bahari" }, "fit-disagree": { id: "rift" }, "fit-error": { id: "kigali" },
};

/**
 * The fit status of a lead in a review state. Outside the fit states everything is scored as usual.
 * The table shows a few neighbours in the same state, so the column can be read at a glance.
 */
export function fitStatusFor(l: Lead, state?: LeadsReviewState): FitStatus {
  const s = () => scoreFor(l);
  switch (state) {
    case "fit-scoring":
      if (l.id === "tamu") return { kind: "scoring", pages: 12, of: 38, checked: 2, last: { ...scoreFor(l, 86, "2026-09-12") } };
      if (l.id === "nyota" || l.id === "jinja") return { kind: "scoring", pages: 4, of: 20, checked: 0, last: scoreFor(l, l.fit, "2026-09-12") };
      break;
    case "fit-none":
      if (l.id === "savanna") return { kind: "none", why: "queued", since: "2 min ago" };
      if (l.id === "bahari" || l.id === "arusha") return { kind: "none", why: "queued", since: "2 min ago" };
      if (l.id === "mara") return { kind: "none", why: "no-site" };
      break;
    case "fit-low":
      if (l.id === "zanzibar") return { kind: "scored", score: zanzibarLow(l) };
      break;
    case "fit-changed":
      if (l.id === "nyota") return { kind: "scored", score: withHistory(s(), [{ at: "2026-09-12", value: 58, why: [
        "The Careers page now lists a “Cold chain lead” (read Sep 27)",
        "You added beverage makers to Who it's for (Sep 22)",
        "A news post from Sep 20 mentions a lost batch after a power cut"] }]) };
      if (l.id === "rift") return { kind: "scored", score: withHistory(s(), [{ at: "2026-09-12", value: 90, why: ["The Eldoret depot page is gone; the site now lists one site, not three"] }]) };
      if (l.id === "mombasa") return { kind: "scored", score: withHistory(s(), [{ at: "2026-09-12", value: 78, why: ["Found a Fleet Director to write to (Hunter, Sep 26)"] }]) };
      break;
    case "fit-override":
      if (l.id === "bahari") return { kind: "scored", score: { ...scoreFor(l, 61), override: { value: 83, by: "Tomás Ibarra", at: "2026-09-28", note: "Their CFO signs off every cold-room spend, and we met him at the Nairobi expo." } } };
      break;
    case "fit-disagree":
      if (l.id === "rift") return { kind: "scored", score: { ...s(), disagree: { by: "Tomás Ibarra", at: "2026-09-28", note: "They rent their cold rooms from Mombasa Reefer; they don't run them." } } };
      break;
    case "fit-error":
      if (l.id === "kigali") return { kind: "error", code: "POST /fit/score · 504", at: "Sep 29, 14:02", tries: 2, last: scoreFor(l, 85, "2026-09-12") };
      if (l.id === "dodoma") return { kind: "error", code: "POST /fit/score · 504", at: "Sep 29, 14:02", tries: 2 };
      break;
  }
  return { kind: "scored", score: s() };
}
