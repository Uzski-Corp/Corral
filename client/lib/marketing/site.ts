/**
 * The marketing site (M10, ENG-60 → build ENG-87): routes, navigation, the footer, the changelog, and the
 * things that must be confirmed before launch (Oct 7, 2026). Plain data so pages, tests and the sitemap agree.
 */
export const SITE_URL = "https://corral.app"; // placeholder host, see HANDOFF §18 open questions
export const LAUNCH = "2026-10-07";

/** Every public marketing route. The sitemap, the nav, the footer and the tests read this. */
export const ROUTES = {
  home: "/",
  fenceline: "/fenceline",
  pricing: "/pricing",
  security: "/security",
  mcp: "/mcp",
  changelog: "/changelog",
  terms: "/legal/terms",
  privacy: "/legal/privacy",
  dpa: "/legal/dpa",
  signIn: "/sign-in",
} as const;
export type SiteRoute = (typeof ROUTES)[keyof typeof ROUTES];
export const PUBLIC_ROUTES: SiteRoute[] = Object.values(ROUTES);

/** Which landing is home. Open Range is `/` since ENG-87 (Aegon's call) and has no other address (/open-range was
    removed); Fenceline stays live at /fenceline, noindex (HANDOFF §18 "Pick /"). */
export type Landing = "open-range" | "fenceline";
export const HOME: Landing = "open-range";
export const homeOf = (l: Landing = HOME) => (l === "open-range" ? ROUTES.home : ROUTES.fenceline);

/** What the sitemap lists: every public page except sign-in, Fenceline (live but noindex while Open Range is home),
    and the legal stubs until counsel's text is in. */
export function sitemapRoutes(legalConfirmed = isConfirmed("legal")): SiteRoute[] {
  const legal: string[] = [ROUTES.terms, ROUTES.privacy, ROUTES.dpa];
  return PUBLIC_ROUTES.filter((r) => r !== ROUTES.signIn && r !== ROUTES.fenceline && (legalConfirmed || !legal.includes(r)));
}

export const NAV: { label: string; href: SiteRoute }[] = [
  { label: "Pricing", href: ROUTES.pricing },
  { label: "Security", href: ROUTES.security },
  { label: "MCP", href: ROUTES.mcp },
  { label: "Changelog", href: ROUTES.changelog },
];

export const FOOTER: { title: string; links: { label: string; href: SiteRoute | `${SiteRoute}#${string}` }[] }[] = [
  { title: "Product", links: [
    { label: "Segments and fit", href: `${ROUTES.home}#product` }, { label: "Unibox", href: `${ROUTES.home}#unibox` },
    { label: "Sequences and pools", href: `${ROUTES.home}#sequences` }, { label: "Handoffs", href: `${ROUTES.home}#handoffs` }] },
  { title: "Corral", links: [
    { label: "Pricing", href: ROUTES.pricing }, { label: "Changelog", href: ROUTES.changelog }, { label: "Security", href: ROUTES.security }, { label: "Sign in", href: ROUTES.signIn }] },
  { title: "Developers", links: [
    { label: "MCP server", href: ROUTES.mcp }, { label: "Tools", href: `${ROUTES.mcp}#tools` }, { label: "API keys", href: `${ROUTES.mcp}#keys` }, { label: "Errors", href: `${ROUTES.mcp}#errors` }] },
  { title: "Legal", links: [
    { label: "Terms", href: ROUTES.terms }, { label: "Privacy", href: ROUTES.privacy }, { label: "Data processing", href: ROUTES.dpa }] },
];

/** The sign-up CTA. There is no self-serve sign-up route yet; both land on /sign-in (open question). */
export const CTA = { start: ROUTES.signIn, walkthrough: "mailto:hello@corral.app?subject=Walkthrough" } as const;
/** Where the same CTAs go for a signed-in visitor (M10c question 5, Bau's follow-up): the app, and /mcp's connect
 *  straight to Settings → Developers → MCP via the `tab` param (works in production; `state` is review-only). */
export const CTA_SIGNED_IN = { start: "/app", mcpConnect: "/app?view=settings&tab=mcp" } as const;

export const SAMPLE_NOTE =
  "Sample workspace: people, companies, quotes and numbers are illustrative. Photographs are reference-only stand-ins, not model-released, and are replaced before launch.";

/* ------------------------------------------------------------ changelog */
export type Change = { date: string; version: string; title: string; lede: string; items: { area: string; text: string; href?: string }[] };
export const CHANGELOG: Change[] = [
  { date: "2026-10-07", version: "1.0", title: "Corral 1.0", lede: "Everything from the first product page to a booked Thursday, in one place.",
    items: [
      { area: "Knowledge base", text: "Drop in a deck or a product page; Corral drafts what it sells, who feels it and what not to say, with every line cited." },
      { area: "Discovery", text: "Search reads the market, not a list: a real browser reads each site, and every contact detail shows where it came from." },
      { area: "Fit", text: "A score per product with its reasons. Under eighty it turns grey and stays out of sequences unless you pull it in." },
      { area: "Segments", text: "Saved rules that stay live as Corral re-scores; build them with a count that answers as you type." },
      { area: "Sequences", text: "Steps, conditions and a mailbox pool that sends at a human pace, with launch checks that stop a bad send." },
      { area: "Unibox", text: "Replies sorted in about a second and drafted from your knowledge base. Nothing leaves without a 10-second undo." },
      { area: "Handoffs", text: "A yes books through Cal.com, opens the deal in Phoenix ERP and hands nurture to AutoSend." },
      { area: "MCP and API keys", text: "Cursor, Claude and other clients sign in as you. API keys for jobs that run alone: they can draft but can’t send.", href: ROUTES.mcp },
    ] },
];

/* ------------------------------------------------------------ what must be true before launch */
/** A claim on the site that someone has to confirm. Unconfirmed ones show a visible "to confirm" mark, on purpose. */
export type Claim = { id: string; text: string; confirmed: boolean; owner: "Krak" | "Aegon" | "Counsel" };
export const CLAIMS: Claim[] = [
  { id: "prices", text: "Plan prices and limits", confirmed: false, owner: "Aegon" },
  { id: "region", text: "Where workspace data is stored", confirmed: false, owner: "Krak" },
  { id: "encryption", text: "Encryption at rest and in transit", confirmed: false, owner: "Krak" },
  { id: "subprocessors", text: "The subprocessor list", confirmed: false, owner: "Counsel" },
  { id: "retention", text: "Deletion 30 days after a workspace closes", confirmed: false, owner: "Krak" },
  { id: "legal", text: "Terms, privacy notice and DPA text", confirmed: false, owner: "Counsel" },
  { id: "host", text: "The MCP host, the key prefix and whether Test keys ship", confirmed: false, owner: "Aegon" },
];
export const claim = (id: string) => CLAIMS.find((c) => c.id === id);
export const isConfirmed = (id: string) => !!claim(id)?.confirmed;
