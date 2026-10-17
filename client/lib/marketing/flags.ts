/* Build-time switches for the marketing site (static export: read at build, so a change needs a rebuild + deploy). */

/** The pricing gate (Bau's pricing-gate design). On: /pricing is one headline and a "See pricing" button that opens an
    intent form, and no plan, tier or price appears anywhere on the site, in its structured data, or in its share
    metadata. Off (default): /pricing is exactly what it was. Set NEXT_PUBLIC_PRICING_GATE=1 to turn it on. */
export const pricingGateOn = (): boolean => process.env.NEXT_PUBLIC_PRICING_GATE === "1";
