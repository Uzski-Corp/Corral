/**
 * Plans, shared by both landings and /pricing so a price can only be wrong in one place.
 * Monthly USD and the allowances below are confirmed. Yearly prices are not. Territory is agreed, not priced.
 */
export type PlanId = "field" | "range" | "territory";
/** `includes`: the four lines a plan card shows; the full comparison is COMPARE. */
export type Plan = { id: PlanId; name: string; tag: string; price: number | null; line: string; cta: string; primary?: boolean; reads: number | null; meter: number; includes: string[] };
export const PLANS: Plan[] = [
  { id: "field", name: "Field", tag: "for one", price: 49, line: "One product, one founder doing their own outbound.", cta: "Start with one product", reads: 500, meter: 0.12,
    includes: ["1 product", "500 companies a month", "200 AI drafts", "2 mailboxes"] },
  { id: "range", name: "Range", tag: "for a team", price: 149, line: "A small team working a real territory.", cta: "Start a 7-day trial", primary: true, reads: 2000, meter: 0.5,
    includes: ["3 products", "2,000 companies a month", "1,000 AI drafts", "10 mailboxes, 5 teammates"] },
  { id: "territory", name: "Territory", tag: "for many", price: null, line: "Several products, several markets, one Unibox.", cta: "Book a walkthrough", reads: null, meter: 0.95,
    includes: ["Products agreed", "Companies agreed", "Mailboxes agreed", "Walkthrough before a price"] },
];
export const priceWords = (p: Plan) => (p.price === null ? "Let’s talk" : `$${p.price}`);

/** The comparison, grouped the way the product is. A string is shown as is; true is "Included", false is "—". */
export type Cell = string | boolean;
export const COMPARE: { group: string; rows: { label: string; note?: string; cells: Record<PlanId, Cell> }[] }[] = [
  { group: "Reading the market", rows: [
    { label: "Products", cells: { field: "1", range: "3", territory: "Unlimited" } },
    { label: "Companies read a month", note: "Shown on the plan. Corral does not count-enforce this yet.", cells: { field: "500", range: "2,000", territory: "Agreed" } },
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
