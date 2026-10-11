/**
 * Plans, shared by both landings and /pricing so a price can only be wrong in one place.
 * Prices and limits are placeholders until confirmed (lib/marketing/site.ts CLAIMS "prices").
 */
export type PlanId = "field" | "range" | "territory";
/** `includes`: the four lines a plan card shows; the full comparison is COMPARE. */
export type Plan = { id: PlanId; name: string; tag: string; price: number | null; line: string; cta: string; primary?: boolean; reads: number | null; meter: number; includes: string[] };
export const PLANS: Plan[] = [
  { id: "field", name: "Field", tag: "for one", price: 49, line: "One product, one founder doing their own outbound.", cta: "Start with one product", reads: 1000, meter: 0.12,
    includes: ["1 product", "1,000 companies read a month", "2 mailboxes", "Unibox drafts and Cal.com"] },
  { id: "range", name: "Range", tag: "for a team", price: 149, line: "A small team working a real territory.", cta: "Start a 14-day trial", primary: true, reads: 5000, meter: 0.5,
    includes: ["3 products", "5,000 companies read a month", "10 mailboxes, 5 teammates", "AutoSend nurture"] },
  { id: "territory", name: "Territory", tag: "for many", price: null, line: "Several products, several markets, one Unibox.", cta: "Book a walkthrough", reads: null, meter: 0.95,
    includes: ["Unlimited products", "25,000+ companies read a month", "Your own mailboxes", "Phoenix ERP and SSO"] },
];
export const priceWords = (p: Plan) => (p.price === null ? "Let’s talk" : `$${p.price}`);

/** The comparison, grouped the way the product is. A string is shown as is; true is "Included", false is "—". */
export type Cell = string | boolean;
export const COMPARE: { group: string; rows: { label: string; note?: string; cells: Record<PlanId, Cell> }[] }[] = [
  { group: "Reading the market", rows: [
    { label: "Products", cells: { field: "1", range: "3", territory: "Unlimited" } },
    { label: "Companies read a month", note: "A read is one company’s site, scored for one product.", cells: { field: "1,000", range: "5,000", territory: "25,000+" } },
    { label: "Fit with reasons", cells: { field: true, range: true, territory: true } },
  ] },
  { group: "Writing", rows: [
    { label: "Mailboxes in the pool", cells: { field: "2", range: "10", territory: "Bring your own" } },
    { label: "Sequences with conditions", cells: { field: true, range: true, territory: true } },
    { label: "Launch checks", cells: { field: true, range: true, territory: true } },
  ] },
  { group: "Replies", rows: [
    { label: "Unibox copilot drafts", cells: { field: true, range: true, territory: true } },
    { label: "Teammates in the Unibox", cells: { field: false, range: "Up to 5", territory: "Unlimited" } },
  ] },
  { group: "Handoffs", rows: [
    { label: "Cal.com booking", cells: { field: true, range: true, territory: true } },
    { label: "AutoSend nurture", cells: { field: false, range: true, territory: true } },
    { label: "Phoenix ERP deals", cells: { field: false, range: false, territory: true } },
  ] },
  { group: "Developers and admin", rows: [
    { label: "MCP server and API keys", cells: { field: true, range: true, territory: true } },
    { label: "Scoring over MCP", note: "score_company costs one credit, the same as in the app.", cells: { field: "1 credit", range: "1 credit", territory: "1 credit" } },
    { label: "SSO", cells: { field: false, range: false, territory: true } },
  ] },
];

export const FAQ: { q: string; a: string }[] = [
  { q: "What counts as a company read?", a: "Corral reading one company’s website and scoring it for one of your products. Re-scoring after you change a product counts again; opening a company you already read doesn’t." },
  { q: "Do you send from your mailboxes or ours?", a: "Yours. You connect Google or Microsoft mailboxes to a pool, and Corral sends from them at a human pace, capped per mailbox." },
  { q: "Does anything send without me?", a: "Sequence steps send on the schedule you launch. Replies never do: every reply is a draft until you send it, with a 10-second undo. API keys can draft but can’t send." },
  { q: "What happens when I hit the monthly reads?", a: "Corral stops starting new reads and tells you. Sequences, the Unibox and handoffs keep working." },
  { q: "Can I leave?", a: "Monthly, cancel whenever. Export your companies, contacts and threads as CSV before you go." },
];
