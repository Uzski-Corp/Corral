/* Builds and sends the pricing email: the variables for the AutoSend template, from PRICING_CONFIG and the lead.
   Plan structure lives only in PRICING_CONFIG.rows. Every value that goes into HTML is escaped here. */
import { sendMail, type MailEnv, type SendResult } from "./mail";
import { PRICING_CONFIG, type PricingRow } from "./pricing-config";

export interface PricingMailEnv extends MailEnv {
  /** Var (wrangler.jsonc / cloudflare.config.ts): the "corral pricing" template in AutoSend. */
  PRICING_TEMPLATE_ID?: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** One tray row (email/pricing-row.template.html in the design handoff). */
export function rowHtml(row: PricingRow): string {
  const font = "font-family:Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
  return (
    `<tr><td style="padding:0 0 8px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:10px;border:1px solid #E4E4E6"><tr>` +
    `<td style="padding:16px;${font};vertical-align:top"><div style="font-size:16px;line-height:22px;font-weight:600;color:#141414;letter-spacing:-0.2px">${escapeHtml(row.name)}</div>` +
    `<div style="padding-top:2px;font-size:14px;line-height:20px;color:#6A6A6A">${escapeHtml(row.line)}</div></td>` +
    `<td align="right" style="padding:16px;${font};vertical-align:top;white-space:nowrap"><div style="font-size:20px;line-height:24px;font-weight:600;color:#141414;letter-spacing:-0.4px">${escapeHtml(row.price)}</div>` +
    `<div style="padding-top:2px;font-size:12px;line-height:16px;color:#6A6A6A">${escapeHtml(row.billing)}</div></td></tr></table></td></tr>`
  );
}

export const pricingHtml = (rows: readonly PricingRow[]) => rows.map(rowHtml).join("");
export const pricingText = (rows: readonly PricingRow[]) =>
  rows.map((r) => `${r.name}: ${r.price}${r.billing ? ` ${r.billing}` : ""}${r.line ? `. ${r.line}` : ""}`).join("\n");

/** First word of the name, as typed. */
export const firstName = (fullName: string) => fullName.split(" ", 1)[0]!;

export type Lead = { email: string; fullName: string };

export function dynamicData(lead: Lead, config: typeof PRICING_CONFIG = PRICING_CONFIG): Record<string, string> {
  return {
    first_name: firstName(lead.fullName),
    pricing_html: pricingHtml(config.rows),
    pricing_text: pricingText(config.rows),
    pricing_note: config.note,
    booking_url: config.bookingUrl || `mailto:${config.contactEmail}?subject=Corral%20pricing`,
    waitlist_url: config.waitlistUrl,
    site_host: config.siteHost,
    unsubscribe_url: `mailto:${config.contactEmail}?subject=Unsubscribe`,
    privacy_url: config.privacyUrl,
    company_address: config.companyAddress,
    logo_url: config.logoUrl,
  };
}

/** "sent" | "skipped" (no key, no template id, or no pricing rows yet: logged as an alert) | "failed". */
export async function sendPricingEmail(
  env: PricingMailEnv,
  lead: Lead,
  fetcher: typeof fetch = fetch,
  config: typeof PRICING_CONFIG = PRICING_CONFIG,
): Promise<SendResult> {
  if (config.rows.length === 0) {
    console.error("pricing-intent: ALERT pricing rows are empty (src/pricing-config.ts), nothing was sent");
    return "skipped";
  }
  return sendMail(
    env,
    {
      to: { email: lead.email, name: lead.fullName },
      from: config.from,
      replyTo: { email: config.contactEmail },
      templateId: env.PRICING_TEMPLATE_ID ?? "",
      dynamicData: dynamicData(lead, config),
    },
    fetcher,
  );
}
