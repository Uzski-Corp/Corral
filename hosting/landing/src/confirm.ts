/* The "you're on the list" email, sent once per new address through AutoSend (POST /v1/mails/send).
   Only for a new row: an address already on the list hears "exists" and gets nothing. Without AUTOSEND_API_KEY
   (local dev, tests) it does nothing. A failed send is logged and never changes the signup's answer. */

export interface ConfirmEnv {
  /** AutoSend API key for the "Uzski Corp Mail" project, set with `wrangler secret put AUTOSEND_API_KEY`. */
  AUTOSEND_API_KEY?: string;
}

export const AUTOSEND_SEND_URL = "https://api.autosend.com/v1/mails/send";
export const CONFIRM_FROM = { email: "hello@uzskicorp.agency", name: "Corral" } as const;
export const CONFIRM_REPLY_TO = "corral@uzskicorp.agency";
export const CONFIRM_SUBJECT = "You’re on the Corral waitlist";

const TEXT = [
  "You’re on the list.",
  "",
  "Thanks for joining the Corral waitlist. We’re opening workspaces a few at a time, and we’ll write to this address when yours is ready.",
  "",
  "Corral finds companies that fit what you sell, emails the person who decides and sorts the replies. Run it in Corral, or from Claude, ChatGPT and Cursor.",
  "",
  "Questions? Just reply to this email.",
  "",
  "Corral · https://corral.uzskicorp.agency",
].join("\n");

const HTML = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F9F9FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9F9FA;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:12px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#141414;">
<tr><td style="font-size:15px;font-weight:600;padding-bottom:24px;">Corral</td></tr>
<tr><td style="font-size:24px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;padding-bottom:16px;">You’re on the list.</td></tr>
<tr><td style="font-size:15px;line-height:1.55;color:#3F3F3F;padding-bottom:16px;">Thanks for joining the Corral waitlist. We’re opening workspaces a few at a time, and we’ll write to this address when yours is ready.</td></tr>
<tr><td style="font-size:15px;line-height:1.55;color:#3F3F3F;padding-bottom:24px;">Corral finds companies that fit what you sell, emails the person who decides and sorts the replies. Run it in Corral, or from Claude, ChatGPT and Cursor.</td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#6A6A6A;border-top:1px solid #E4E4E6;padding-top:16px;">Questions? Just reply to this email.<br><a href="https://corral.uzskicorp.agency" style="color:#224FD1;text-decoration:none;">corral.uzskicorp.agency</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;

export async function sendConfirmation(env: ConfirmEnv, email: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (!env.AUTOSEND_API_KEY) return false;
  try {
    const res = await fetcher(AUTOSEND_SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.AUTOSEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        to: { email },
        from: CONFIRM_FROM,
        replyTo: { email: CONFIRM_REPLY_TO },
        subject: CONFIRM_SUBJECT,
        html: HTML,
        text: TEXT,
      }),
    });
    if (!res.ok) console.error("waitlist: confirmation not sent", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("waitlist: confirmation failed", err);
    return false;
  }
}
