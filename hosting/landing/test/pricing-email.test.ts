import { afterEach, describe, expect, it, vi } from "vitest";
import { PRICING_CONFIG, type PricingRow } from "../src/pricing-config";
import { dynamicData, escapeHtml, firstName, pricingHtml, pricingText, rowHtml, sendPricingEmail } from "../src/pricing-email";

const rows: PricingRow[] = [
  { name: "Plan <one>", line: "For \"teams\" & more", price: "$XX", billing: "a month" },
  { name: "Quote", line: "", price: "Let’s talk", billing: "" },
];
const config = { ...PRICING_CONFIG, rows, note: "Sample note", bookingUrl: "https://cal.example/corral", companyAddress: "1 Sample Rd" } as unknown as typeof PRICING_CONFIG;
afterEach(() => vi.restoreAllMocks());

describe("config placeholders", () => {
  it("ships with no invented pricing, booking link or address", () => {
    expect(PRICING_CONFIG.rows).toEqual([]);
    expect(PRICING_CONFIG.note).toBe("");
    expect(PRICING_CONFIG.bookingUrl).toBe("");
    expect(PRICING_CONFIG.companyAddress).toBe("");
  });
});

describe("html building", () => {
  it("escapes every special character", () => expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;"));
  it("escapes user-controlled row values and keeps the designed markup", () => {
    const html = rowHtml(rows[0]!);
    expect(html).toContain("Plan &lt;one&gt;");
    expect(html).toContain("For &quot;teams&quot; &amp; more");
    expect(html).not.toContain("<one>");
    expect(html).toContain("border-radius:10px;border:1px solid #E4E4E6");
    expect(html).toContain(">$XX<");
  });
  it("joins rows and is empty for none", () => {
    expect(pricingHtml(rows).match(/<tr><td style="padding:0 0 8px 0">/g)).toHaveLength(2);
    expect(pricingHtml([])).toBe("");
  });
  it("builds the text version, leaving out empty parts", () => {
    expect(pricingText(rows)).toBe("Plan <one>: $XX a month. For \"teams\" & more\nQuote: Let’s talk");
    expect(pricingText([])).toBe("");
  });
});

describe("dynamicData", () => {
  it("fills every variable the template uses", () => {
    const d = dynamicData({ email: "w@acme.co", fullName: "Wanjiru Kamau" }, config);
    expect(Object.keys(d).sort()).toEqual([
      "booking_url", "company_address", "first_name", "logo_url", "pricing_html", "pricing_note", "pricing_text", "privacy_url", "site_host", "unsubscribe_url", "waitlist_url",
    ]);
    expect(d).toMatchObject({ first_name: "Wanjiru", pricing_note: "Sample note", booking_url: "https://cal.example/corral", company_address: "1 Sample Rd", site_host: "corral.uzskicorp.agency" });
    expect(d.unsubscribe_url).toBe("mailto:corral@uzskicorp.agency?subject=Unsubscribe");
  });
  it("opens a reply to the team while the booking link is unset", () => {
    expect(dynamicData({ email: "w@acme.co", fullName: "W" }, { ...config, bookingUrl: "" } as typeof PRICING_CONFIG).booking_url).toBe("mailto:corral@uzskicorp.agency?subject=Corral%20pricing");
  });
  it("uses the shipped config by default", () => {
    expect(dynamicData({ email: "a@b.co", fullName: "Ada" }).pricing_html).toBe("");
  });
  it("takes the first word as the first name", () => {
    expect(firstName("Wanjiru Kamau")).toBe("Wanjiru");
    expect(firstName("Cher")).toBe("Cher");
    expect(firstName("")).toBe("");
  });
});

describe("sendPricingEmail", () => {
  const lead = { email: "w@acme.co", fullName: "Wanjiru Kamau" };
  it("sends the template with the variables, replying to the team", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendPricingEmail({ AUTOSEND_API_KEY: "k", PRICING_TEMPLATE_ID: "A-tpl" }, lead, fetcher as unknown as typeof fetch, config)).toBe("sent");
    const body = JSON.parse(((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body) as string);
    expect(body).toMatchObject({ templateId: "A-tpl", to: { email: "w@acme.co", name: "Wanjiru Kamau" }, from: { email: "hello@uzskicorp.agency", name: "Corral" }, replyTo: { email: "corral@uzskicorp.agency" } });
    expect(body.dynamicData.pricing_html).toContain("Plan &lt;one&gt;");
  });
  it("does not send, and alerts, when the pricing rows are empty", async () => {
    const fetcher = vi.fn();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPricingEmail({ AUTOSEND_API_KEY: "k", PRICING_TEMPLATE_ID: "A-tpl" }, lead, fetcher as unknown as typeof fetch)).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith(expect.stringContaining("ALERT pricing rows are empty"));
  });
  it("skips without a template id", async () => {
    const fetcher = vi.fn();
    expect(await sendPricingEmail({ AUTOSEND_API_KEY: "k" }, lead, fetcher as unknown as typeof fetch, config)).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports a failed send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendPricingEmail({ AUTOSEND_API_KEY: "k", PRICING_TEMPLATE_ID: "A-tpl" }, lead, (async () => new Response("", { status: 500 })) as unknown as typeof fetch, config)).toBe("failed");
  });
});
