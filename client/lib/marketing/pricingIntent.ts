/* The pricing gate's contract with the Worker (hosting/landing/src/pricing-intent.ts) and its field rules.
   The server is the authority; these mirror it for instant feedback. Design: Bau's pricing-gate handoff (Oct 17).

   POST /api/pricing-intent  JSON { fullName, industry, otherText?, email, phone?, source, website }
     202 { status: "queued" }  ->  "queued"        422 { error: "invalid_field", field }  ->  { invalid: field }
     429 + Retry-After         ->  "rate_limited"  anything else, a network failure or a 10 s timeout  ->  "error"
   In development the request is mocked in the browser (no route exists in the Next app): 700 ms, then an email
   containing "fail" -> error, "limit" -> rate_limited, else queued. NEXT_PUBLIC_PRICING_MOCK=0 turns the mock off and
   =1 forces it on a build. */
import { isEmail } from "./waitlist";

export const PRICING_INTENT_ENDPOINT = "/api/pricing-intent";
export const REQUEST_TIMEOUT_MS = 10_000;
export const DEFAULT_RETRY_SECONDS = 600;
export const NAME_MAX = 80;
export const OTHER_MAX = 60;

export const INDUSTRIES = [
  { value: "agriculture-food", label: "Agriculture and food" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "logistics-transport", label: "Logistics and transport" },
  { value: "retail-ecommerce", label: "Retail and e-commerce" },
  { value: "software-it", label: "Software and IT" },
  { value: "financial-services", label: "Financial services" },
  { value: "healthcare", label: "Healthcare" },
  { value: "construction-real-estate", label: "Construction and real estate" },
  { value: "energy-utilities", label: "Energy and utilities" },
  { value: "education", label: "Education" },
  { value: "professional-services", label: "Professional services" },
  { value: "media-marketing", label: "Media and marketing" },
  { value: "hospitality-travel", label: "Hospitality and travel" },
  { value: "telecoms", label: "Telecoms" },
  { value: "nonprofit-public", label: "Non-profit and public sector" },
  { value: "other", label: "Other" },
] as const;
export type IndustryValue = (typeof INDUSTRIES)[number]["value"];

export type GateSource = "hero" | "nav" | "footer" | "pricing-page";
export type Field = "fullName" | "industry" | "otherText" | "email" | "phone";
export const FIELD_ORDER: Field[] = ["fullName", "industry", "otherText", "email", "phone"];

export type Values = { fullName: string; industry: IndustryValue | ""; otherText: string; email: string; phone: string };
export const EMPTY: Values = { fullName: "", industry: "", otherText: "", email: "", phone: "" };

/** Strip control characters, collapse whitespace, trim. */
export const cleanText = (v: string) => v.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();

/** "+254 712 345 678" -> "+254712345678"; "" when empty; null when it is not a number we accept (no guessing a country). */
export function cleanPhone(raw: string): string | null {
  const tidy = raw.replace(/[\s\-.()]/g, "");
  if (tidy === "") return "";
  const e164 = tidy.startsWith("00") ? `+${tidy.slice(2)}` : tidy;
  return /^\+[1-9]\d{6,14}$/.test(e164) ? e164 : null;
}

/** "+254712345678" -> "+254 712 345 678". Only Kenya's code is grouped (we don't guess other countries' lengths): null means "leave it as typed". */
export function groupPhone(e164: string): string | null {
  const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return m ? `+254 ${m[1]} ${m[2]} ${m[3]}` : null;
}

const FREE_MAIL = [
  /^(gmail|googlemail|ymail|outlook|msn|icloud|me|mac|aol|protonmail|mail)\.com$/,
  /^proton\.me$/,
  /^(yahoo|hotmail|live|gmx|yandex)\.[a-z]+(\.[a-z]+)?$/,
];
export const isFreeMail = (email: string) => FREE_MAIL.some((re) => re.test(email.slice(email.lastIndexOf("@") + 1).trim().toLowerCase()));

export type Errors = Partial<Record<Field, true>>;

/** Which fields are bad right now (the dialog maps each to its message). */
export function validate(v: Values): Errors {
  const errors: Errors = {};
  const name = cleanText(v.fullName);
  if (name.length < 1 || name.length > NAME_MAX) errors.fullName = true;
  if (!INDUSTRIES.some((i) => i.value === v.industry)) errors.industry = true;
  if (v.industry === "other") {
    const other = cleanText(v.otherText);
    if (other.length < 1 || other.length > OTHER_MAX) errors.otherText = true;
  }
  if (!isEmail(v.email)) errors.email = true;
  if (cleanPhone(v.phone) === null) errors.phone = true;
  return errors;
}

export const firstInvalid = (errors: Errors): Field | null => FIELD_ORDER.find((f) => errors[f]) ?? null;

export type PricingResult =
  | { status: "queued" }
  | { status: "invalid"; field: Field }
  | { status: "rate_limited"; retryAfter: number }
  | { status: "error" };

const mockOn = () => {
  const flag = process.env.NEXT_PUBLIC_PRICING_MOCK;
  return flag === "1" || (flag !== "0" && process.env.NODE_ENV === "development");
};

async function mock(email: string): Promise<PricingResult> {
  await new Promise((r) => setTimeout(r, 700));
  const e = email.toLowerCase();
  if (e.includes("fail")) return { status: "error" };
  if (e.includes("limit")) return { status: "rate_limited", retryAfter: DEFAULT_RETRY_SECONDS };
  return { status: "queued" };
}

const isField = (v: unknown): v is Field => FIELD_ORDER.includes(v as Field);

/** `website` is the honeypot: always empty for a person. */
export async function requestPricing(v: Values, source: GateSource, honeypot = ""): Promise<PricingResult> {
  if (mockOn()) return mock(v.email);
  const phone = cleanPhone(v.phone);
  const payload = {
    fullName: cleanText(v.fullName), industry: v.industry, ...(v.industry === "other" ? { otherText: cleanText(v.otherText) } : {}),
    email: v.email.trim().toLowerCase(), ...(phone ? { phone } : {}), source, website: honeypot,
  };
  try {
    const res = await fetch(PRICING_INTENT_ENDPOINT, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 202) return { status: "queued" };
    if (res.status === 429) {
      const seconds = Number(res.headers.get("retry-after"));
      return { status: "rate_limited", retryAfter: Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_RETRY_SECONDS };
    }
    if (res.status === 422) {
      const body = (await res.json().catch(() => ({}))) as { field?: unknown };
      if (isField(body.field)) return { status: "invalid", field: body.field };
    }
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

/** "Try again in 10 minutes" from a Retry-After in seconds (minutes, rounded up, at least 1). */
export function waitWords(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
