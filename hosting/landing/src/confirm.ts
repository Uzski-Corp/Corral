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

/** The AutoSend template "corral waitlist": its HTML, text and subject are edited in the AutoSend dashboard. */
export const CONFIRM_TEMPLATE_ID = "A-ea1416cfba6f0fddccb6";

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
        templateId: CONFIRM_TEMPLATE_ID,
      }),
    });
    if (!res.ok) console.error("waitlist: confirmation not sent", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (err) {
    console.error("waitlist: confirmation failed", err);
    return false;
  }
}
