/* What the pricing email says, and the details around it. NOTHING here is invented: every value Sean has not
   confirmed is an empty placeholder, marked OPEN ITEM, and the email is not sent until the pricing rows are filled.

   The AutoSend template ("corral pricing", id in wrangler vars as PRICING_TEMPLATE_ID) names no plan structure: it only
   has a tray ({{{pricing_html}}} / {{pricing_text}}), built from `rows` below, so showing one price, three plans or a
   quote line is a change to this file and never to the template. */

export type PricingRow = { name: string; line: string; price: string; billing: string };

export const PRICING_CONFIG = {
  /** OPEN ITEM 1: the pricing the email shows (prices, billing periods, currency, and whether it names plans at all).
      Empty means "do not send, and log an alert". Shape per row: { name: "Plan name", line: "Who it is for", price: "$XX", billing: "a month" }. */
  rows: [] as PricingRow[],
  /** OPEN ITEM 1: an optional line under the tray ("Prices in US dollars", a quote line, ...). */
  note: "",
  /** OPEN ITEM 3: the Cal.com booking link. Until it is set the "Book a call" button opens a reply to the team. */
  bookingUrl: "",
  /** The address the button falls back to (the same reply-to the confirmation email uses). */
  contactEmail: "corral@uzskicorp.agency",
  /** OPEN ITEM 2: whether the site is still waitlist-only; the email's secondary line points here. */
  waitlistUrl: "https://corral.uzskicorp.agency/#join",
  siteHost: "corral.uzskicorp.agency",
  privacyUrl: "https://corral.uzskicorp.agency/legal/privacy",
  /** OPEN ITEM 3: the postal address for the footer (required for commercial mail in most places). Empty prints nothing. */
  companyAddress: "",
  /** A hosted 2x PNG of the mark (client/public/brand/corral-mark-black.png). */
  logoUrl: "https://corral.uzskicorp.agency/brand/corral-mark-black.png",
  from: { email: "hello@uzskicorp.agency", name: "Corral" },
} as const;

/** OPEN ITEM 7: Turnstile. Off until the TURNSTILE_SECRET Worker secret is set (and the site key is wired in the client). */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
