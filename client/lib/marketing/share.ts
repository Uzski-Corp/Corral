/**
 * Share images (M10): one 1200×630 card per public route, composed at /styleguide/share from live
 * components and saved as each route's static `opengraph-image.jpg` + `.alt.txt` (Next file convention).
 * `dir` is the app/ folder the image sits in; the alt text is written from here so the two can't drift.
 */
export type ShareCard = { id: string; dir: string; kicker: string; title: string; alt: string; piece: "fit" | "prov" | "hand" | "access" | "plans" | "change" | "unibox" };
export const SHARE_CARDS: ShareCard[] = [
  { id: "home", dir: "app", kicker: "Lead generation", title: "An agent finds your next leads.", piece: "fit",
    alt: "Corral lead generation: an agent finds your next leads. Kilima Dairies scores 94 for ColdTrace Sensors, with each check and its evidence." },
  { id: "fenceline", dir: "app/fenceline", kicker: "Corral", title: "Gather the few who fit.", piece: "unibox",
    alt: "Corral: gather the few who fit. Brian Kamau’s reply in the Unibox with Corral’s draft, citing the knowledge base." },
  { id: "pricing", dir: "app/pricing", kicker: "Pricing", title: "Priced by how much of the field you read.", piece: "plans",
    alt: "Corral pricing: Field, Range and Territory plans, priced by how many companies Corral reads a month." },
  { id: "security", dir: "app/security", kicker: "Security", title: "Nothing sends without a person.", piece: "hand",
    alt: "Corral security: nothing sends without a person. A booked meeting and what Corral did about it, step by step." },
  { id: "mcp", dir: "app/mcp", kicker: "MCP server", title: "Keys draft. People send.", piece: "access",
    alt: "Corral’s MCP server: an API key’s access by area. Keys can draft but can’t send; sending needs a signed-in connection." },
  { id: "changelog", dir: "app/changelog", kicker: "Changelog", title: "Corral 1.0, October 7.", piece: "change",
    alt: "Corral changelog: Corral 1.0 on October 7, 2026, from the first product page to a booked Thursday." },
];
