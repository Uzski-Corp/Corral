/* One AutoSend send (POST /v1/mails/send, https://docs.autosend.com/api-reference/mails/send): a template id plus
   `dynamicData`, which fills the template's Handlebars variables. Never throws and never logs the address or the
   variables: a failure is a status code in the log and `false` to the caller. */

export interface MailEnv {
  /** Worker secret, set with `wrangler secret put AUTOSEND_API_KEY` (already set on corral-landing). */
  AUTOSEND_API_KEY?: string;
}

export const AUTOSEND_SEND_URL = "https://api.autosend.com/v1/mails/send";
export const SEND_TIMEOUT_MS = 8000;

export type Mail = {
  to: { email: string; name?: string };
  from: { email: string; name: string };
  replyTo: { email: string };
  templateId: string;
  dynamicData: Record<string, unknown>;
};

export type SendResult = "sent" | "skipped" | "failed";

export async function sendMail(env: MailEnv, mail: Mail, fetcher: typeof fetch = fetch): Promise<SendResult> {
  if (!env.AUTOSEND_API_KEY || !mail.templateId) return "skipped";
  try {
    const res = await fetcher(AUTOSEND_SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${env.AUTOSEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return "sent";
    console.error("mail: AutoSend refused the send", res.status);
    return "failed";
  } catch (err) {
    console.error("mail: AutoSend send failed", err instanceof Error ? err.name : "error");
    return "failed";
  }
}
