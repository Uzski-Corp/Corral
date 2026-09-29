import type { Failure, SourceKind, Stage } from "@/lib/kb/upload";

/* Sample knowledge base for ColdTrace Sensors (M2 design data; ENG-65 shapes the real one). */

export type SourceStatus =
  | { s: "ready" }
  | { s: "processing"; stage: Stage; pct: number; note?: string }
  | { s: "partial"; read: number; total: number; unit: "pages"; note: string; skipped: string }
  | { s: "failed"; failure: Failure; at: Stage };

export type Source = {
  id: string; name: string; kind: SourceKind; host?: string;
  /** "18 pages · 4.2 MB" / "38 pages read · weekly" */
  meta: string; passages?: number; cited: number;
  by: { name: string; avatar?: string }; added: string; updated: string; status: SourceStatus;
};

export const PRODUCT = { name: "ColdTrace Sensors", slug: "coldtrace-sensors", letter: "S" };

export const SOURCES: Source[] = [
  { id: "gateway", name: "Gateway spec sheet v4.pdf", kind: "pdf", meta: "38 pages · 11 MB", passages: 71, cited: 2, by: { name: "Tomás Ibarra", avatar: "tomas" }, added: "Sep 27", updated: "2 days ago",
    status: { s: "partial", read: 31, total: 38, unit: "pages", note: "7 pages are scanned images with no text layer.", skipped: "pages 12–18" } },
  { id: "cert", name: "Calibration certificate 2026.pdf", kind: "pdf", meta: "2 pages · 380 KB", cited: 0, by: { name: "Wanjiru Kamau", avatar: "wanjiru" }, added: "Sep 28", updated: "yesterday",
    status: { s: "failed", failure: "encrypted", at: "scan" } },
  { id: "install", name: "Warehouse install guide.pdf", kind: "pdf", meta: "24 pages · 6.8 MB", cited: 0, by: { name: "Tomás Ibarra", avatar: "tomas" }, added: "Today", updated: "just now",
    status: { s: "processing", stage: "chunk", pct: 40 } },
  { id: "blog", name: "coldtrace.io/blog", kind: "url", host: "coldtrace.io", meta: "Whole section · ~40 pages", cited: 0, by: { name: "Wanjiru Kamau", avatar: "wanjiru" }, added: "Today", updated: "just now",
    status: { s: "processing", stage: "parse", pct: 30, note: "Page 12 of about 40" } },
  { id: "pitch", name: "ColdTrace pitch 2026.pdf", kind: "pdf", meta: "18 pages · 4.2 MB", passages: 46, cited: 9, by: { name: "Tomás Ibarra", avatar: "tomas" }, added: "Sep 22", updated: "Sep 22", status: { s: "ready" } },
  { id: "site", name: "coldtrace.io", kind: "url", host: "coldtrace.io", meta: "38 pages · re-read weekly", passages: 212, cited: 6, by: { name: "Wanjiru Kamau", avatar: "wanjiru" }, added: "Sep 14", updated: "2h ago", status: { s: "ready" } },
  { id: "kilima", name: "Kilima Dairies case study.docx", kind: "docx", meta: "6 pages · 1.1 MB", passages: 14, cited: 3, by: { name: "Tomás Ibarra", avatar: "tomas" }, added: "Sep 22", updated: "Sep 22", status: { s: "ready" } },
  { id: "objections", name: "Objection handling v3.docx", kind: "docx", meta: "11 pages · 820 KB", passages: 22, cited: 4, by: { name: "Amara Njoroge", avatar: "amara" }, added: "Sep 19", updated: "Sep 25", status: { s: "ready" } },
  { id: "pricing", name: "Pricing 2026.md", kind: "md", meta: "2,140 words · 14 KB", passages: 9, cited: 2, by: { name: "Tomás Ibarra", avatar: "tomas" }, added: "Sep 27", updated: "Sep 27", status: { s: "ready" } },
  { id: "pharmacy", name: "coldtrace.io/pharmacy", kind: "url", host: "coldtrace.io", meta: "1 page · re-read weekly", passages: 7, cited: 1, by: { name: "Wanjiru Kamau", avatar: "wanjiru" }, added: "Yesterday", updated: "yesterday", status: { s: "ready" } },
  { id: "haccp", name: "HACCP logging whitepaper.pdf", kind: "pdf", meta: "12 pages · 2.9 MB", passages: 27, cited: 2, by: { name: "Amara Njoroge", avatar: "amara" }, added: "Sep 16", updated: "Sep 16", status: { s: "ready" } },
  { id: "faq", name: "Sales FAQ.md", kind: "md", meta: "3,480 words · 22 KB", passages: 19, cited: 3, by: { name: "Tomás Ibarra", avatar: "tomas" }, added: "Sep 14", updated: "Sep 24", status: { s: "ready" } },
];

/** A few passages per source, as retrieval sees them (ENG-65 chunks). */
export const PASSAGES: Record<string, { loc: string; text: string }[]> = {
  pitch: [
    { loc: "p.2", text: "ColdTrace Sensors are wireless temperature and humidity sensors for cold rooms, reefer trucks and pharmacy fridges. One gateway covers up to 40 sensors across a site." },
    { loc: "p.4", text: "When a reading crosses its limit, the on-duty manager gets an SMS and a call within two minutes. Median alert time across our installed base is 94 seconds." },
    { loc: "p.12", text: "Pricing: $39 per sensor per month, billed annually. Gateway and installation included for sites of six rooms or more." },
  ],
  gateway: [
    { loc: "p.3", text: "The gateway uses sub-GHz radio (868 MHz) to reach sensors through two concrete walls, then backhauls over 4G with automatic fallback to the site's Ethernet." },
    { loc: "p.9", text: "Operating range −30 °C to +60 °C. Enclosure rated IP65. Internal battery keeps the gateway online for 12 hours during a power cut." },
    { loc: "p.19", text: "Sensor battery life is five years at a 60-second reading interval. Replacement cells are standard CR123A." },
  ],
};

export type Cite = { src: string; loc?: string };
export type KFlag =
  | { f: "review"; note: string }
  | { f: "stale"; removed: string; when: string }
  | { f: "conflict"; options: { text: string; src: string; loc?: string; when: string; newer?: boolean }[] };
export type KItem = { id: string; q?: string; body: string; cites: Cite[]; by: "corral" | "you"; when: string; flag?: KFlag };
export type KSection = { id: string; title: string; hint: string; add: string; items: KItem[] };

export const KNOWLEDGE: KSection[] = [
  { id: "pitch", title: "In one line", hint: "How Corral introduces the product in a first email.", add: "Add a line", items: [
    { id: "one", body: "Wireless sensors that tell a cold room's manager within two minutes when something is going wrong, and keep the temperature log inspectors ask for.", cites: [{ src: "pitch", loc: "p.2" }, { src: "site", loc: "/how-it-works" }], by: "you", when: "Sep 28" },
  ] },
  { id: "who", title: "Who it's for", hint: "Used to score companies. Specific beats broad.", add: "Add a buyer", items: [
    { id: "who-1", body: "Operations and quality leads at dairies, meat processors and cold-chain logistics firms with three or more cold rooms.", cites: [{ src: "pitch", loc: "p.5" }, { src: "faq" }], by: "corral", when: "Sep 22" },
    { id: "who-2", body: "Pharmacy chains that must prove vaccines stayed between 2 and 8 °C, store by store.", cites: [{ src: "pharmacy" }], by: "corral", when: "yesterday",
      flag: { f: "review", note: "New from coldtrace.io/pharmacy, read yesterday." } },
  ] },
  { id: "pains", title: "Pains it solves", hint: "What Corral listens for in replies and on company sites.", add: "Add a pain", items: [
    { id: "pain-1", body: "Spoilage is found in the morning, after a compressor failed overnight and nobody knew.", cites: [{ src: "kilima", loc: "p.1" }, { src: "objections", loc: "p.3" }], by: "corral", when: "Sep 22" },
    { id: "pain-2", body: "Paper temperature logs get filled in from memory the week before an audit.", cites: [{ src: "haccp", loc: "p.4" }], by: "corral", when: "Sep 22" },
    { id: "pain-3", body: "Wi-Fi loggers drop out in basement and concrete cold rooms, so the gaps show up exactly where the risk is.", cites: [{ src: "gateway", loc: "p.3" }], by: "corral", when: "Sep 27" },
  ] },
  { id: "proof", title: "Proof", hint: "Numbers and names Corral can quote. Each needs a source.", add: "Add proof", items: [
    { id: "proof-kilima", body: "Kilima Dairies cut spoilage by 31% in its first quarter and passed its KEBS audit using the log ColdTrace wrote for it.", cites: [{ src: "kilima", loc: "p.2" }], by: "you", when: "Sep 28" },
    { id: "proof-alert", body: "Median alert time is 94 seconds across 1,200 installed sensors.", cites: [{ src: "pitch", loc: "p.4" }], by: "corral", when: "Sep 22" },
    { id: "proof-battery", body: "Sensor batteries last five years on a standard cell.", cites: [{ src: "brochure", loc: "p.6" }], by: "corral", when: "Sep 14",
      flag: { f: "stale", removed: "Warehouse brochure 2024.pdf", when: "Sep 26" } },
  ] },
  { id: "objections", title: "Objections and answers", hint: "Corral drafts replies from these. Keep answers short and true.", add: "Add an objection", items: [
    { id: "obj-loggers", q: "We already use data loggers.", body: "Loggers tell you what went wrong yesterday. ColdTrace tells you while there's still time to move the stock, and the log writes itself.", cites: [{ src: "objections", loc: "p.2" }], by: "corral", when: "Sep 25" },
    { id: "obj-install", q: "We can't take rooms offline to install.", body: "Nothing goes offline. Sensors stick on and the gateway plugs into a socket; a six-room site is usually live in an afternoon.", cites: [{ src: "objections", loc: "p.4" }, { src: "faq" }], by: "corral", when: "Sep 25" },
    { id: "obj-signal", q: "Our cold rooms have no signal.", body: "The sensors talk to the gateway over long-range radio that gets through two concrete walls. Only the gateway needs 4G or Ethernet.", cites: [{ src: "gateway", loc: "p.3" }], by: "corral", when: "Sep 27" },
  ] },
  { id: "pricing", title: "Pricing and terms", hint: "Corral only quotes prices in emails if you allow it below.", add: "Add a term", items: [
    { id: "price", body: "$35 per sensor per month, billed annually. Gateway and installation included for sites of six rooms or more.", cites: [{ src: "pricing" }, { src: "pitch", loc: "p.12" }], by: "corral", when: "Sep 27",
      flag: { f: "conflict", options: [
        { text: "$35 per sensor per month", src: "pricing", when: "Sep 27", newer: true },
        { text: "$39 per sensor per month", src: "pitch", loc: "p.12", when: "Sep 22" },
      ] } },
    { id: "trial", body: "A 30-day pilot on up to three rooms, free, with the sensors left in place if they sign.", cites: [{ src: "faq" }], by: "corral", when: "Sep 24" },
  ] },
  { id: "never", title: "Never say", hint: "Claims Corral must not make, even if a source says so.", add: "Add a rule", items: [
    { id: "never-fda", body: "Don't call ColdTrace “FDA approved”. The logging meets 21 CFR Part 11; the device itself isn't approved by anyone.", cites: [], by: "you", when: "Sep 23" },
    { id: "never-install", body: "Don't promise same-day installation outside Nairobi and Mombasa.", cites: [], by: "you", when: "Sep 23" },
  ] },
];

/** Where each knowledge line points, for the source detail's "Used in". */
export const citedBy = (src: string, sections = KNOWLEDGE) =>
  sections.flatMap((s) => s.items.filter((i) => i.cites.some((c) => c.src === src)).map((i) => ({ section: s.title, item: i })));

export const sourceName = (id: string, sources = SOURCES) => sources.find((s) => s.id === id)?.name ?? (id === "brochure" ? "Warehouse brochure 2024.pdf" : id);
