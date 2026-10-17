/* Field rules for POST /api/pricing-intent. The client (client/lib/marketing/pricingIntent.ts) mirrors these for
   instant feedback; this file is the authority. Every function takes `unknown` and never throws. */
import { normalizeEmail } from "./waitlist";

export const INDUSTRIES = [
  { slug: "agriculture-food", label: "Agriculture and food" },
  { slug: "manufacturing", label: "Manufacturing" },
  { slug: "logistics-transport", label: "Logistics and transport" },
  { slug: "retail-ecommerce", label: "Retail and e-commerce" },
  { slug: "software-it", label: "Software and IT" },
  { slug: "financial-services", label: "Financial services" },
  { slug: "healthcare", label: "Healthcare" },
  { slug: "construction-real-estate", label: "Construction and real estate" },
  { slug: "energy-utilities", label: "Energy and utilities" },
  { slug: "education", label: "Education" },
  { slug: "professional-services", label: "Professional services" },
  { slug: "media-marketing", label: "Media and marketing" },
  { slug: "hospitality-travel", label: "Hospitality and travel" },
  { slug: "telecoms", label: "Telecoms" },
  { slug: "nonprofit-public", label: "Non-profit and public sector" },
  { slug: "other", label: "Other" },
] as const;
export type IndustrySlug = (typeof INDUSTRIES)[number]["slug"];

export const SOURCES = ["hero", "nav", "footer", "pricing-page"] as const;
export type PricingSource = (typeof SOURCES)[number];
export const DEFAULT_SOURCE: PricingSource = "pricing-page";

export const NAME_MAX = 80;
export const OTHER_MAX = 60;
export type Field = "fullName" | "industry" | "otherText" | "email" | "phone";

const CONTROL = /\p{Cc}/gu;
/** Strip control characters, collapse runs of whitespace to one space, trim. */
export function cleanText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return raw.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

export function cleanName(raw: unknown): string | null {
  const text = cleanText(raw);
  return text && text.length <= NAME_MAX ? text : null;
}

export function cleanIndustry(raw: unknown): IndustrySlug | null {
  const hit = INDUSTRIES.find((i) => i.slug === raw);
  return hit ? hit.slug : null;
}

export function cleanOther(raw: unknown): string | null {
  const text = cleanText(raw);
  return text && text.length <= OTHER_MAX ? text : null;
}

/** E.164 after tidying: spaces, dashes, dots and brackets go; a leading 00 becomes +. No guessing a country.
    Returns "" for "not given", null for invalid, the number otherwise. (Open item: a leading 0 as +254 for KE.) */
export const PHONE_RULE: "strict" = "strict";
export function cleanPhone(raw: unknown): string | null {
  if (raw === undefined || raw === null) return "";
  if (typeof raw !== "string") return null;
  const tidy = raw.replace(/[\s\-.()]/g, "");
  if (tidy === "") return "";
  const e164 = tidy.startsWith("00") ? `+${tidy.slice(2)}` : tidy;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

export function normalizeSource(raw: unknown): PricingSource {
  return (SOURCES as readonly unknown[]).includes(raw) ? (raw as PricingSource) : DEFAULT_SOURCE;
}

/** Personal-mail providers (soft policy: the server stores the flag and never rejects). Open item: block or not. */
export const FREE_MAIL_POLICY: "flag" = "flag";
const FREE_MAIL: RegExp[] = [
  /^(gmail|googlemail|ymail|outlook|msn|icloud|me|mac|aol|protonmail|mail)\.com$/,
  /^proton\.me$/,
  /^(yahoo|hotmail|live|gmx|yandex)\.[a-z]+(\.[a-z]+)?$/,
];
export function isFreeMail(email: string): boolean {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  return FREE_MAIL.some((re) => re.test(domain));
}

export type Valid = {
  fullName: string;
  industry: IndustrySlug;
  otherText: string | null;
  email: string;
  phone: string | null;
  source: PricingSource;
  freeMail: boolean;
};
export type Checked = { ok: true; value: Valid } | { ok: false; field: Field };

/** Checks in the order the form shows them (name, industry, other, email, phone) and names the first bad field. */
export function checkFields(input: Record<string, unknown>): Checked {
  const fullName = cleanName(input.fullName);
  if (!fullName) return { ok: false, field: "fullName" };
  const industry = cleanIndustry(input.industry);
  if (!industry) return { ok: false, field: "industry" };
  let otherText: string | null = null;
  if (industry === "other") {
    otherText = cleanOther(input.otherText);
    if (!otherText) return { ok: false, field: "otherText" };
  }
  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, field: "email" };
  const phone = cleanPhone(input.phone);
  if (phone === null) return { ok: false, field: "phone" };
  return { ok: true, value: { fullName, industry, otherText, email, phone: phone || null, source: normalizeSource(input.source), freeMail: isFreeMail(email) } };
}
