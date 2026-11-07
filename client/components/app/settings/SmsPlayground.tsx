"use client";

import { useEffect, useMemo, useState } from "react";
import { createApiClient } from "@/lib/api/client";
import { createSmsApi } from "@/lib/api/sms";
import { useSession } from "@/components/session/SessionProvider";
import { FormField, Textarea, TextInput } from "../Form";
import { Button } from "../primitives";

const PLACEHOLDER = /\[([A-Za-z][A-Za-z0-9_]{0,31})\]/g;

function preview(recipients: string, message: string): string {
  const line = recipients.split(/\n|;/).map((part) => part.trim()).find(Boolean) ?? "";
  const cells = line.split(",").map((part) => part.trim()).filter(Boolean);
  if (!message.trim()) return "The message shows here before it sends.";
  const names = [...message.matchAll(PLACEHOLDER)].map((match) => match[1]);
  if (!names.length || cells.length < 2) return message.trim();
  let text = message;
  names.forEach((name, index) => {
    text = text.replaceAll(`[${name}]`, cells[index + 1] ?? `[${name}]`);
  });
  return text.trim();
}

export function SmsPlayground() {
  const session = useSession();
  const config = session?.config;
  const api = useMemo(() => {
    if (!config?.apiUrl) return null;
    return createSmsApi(createApiClient({ baseUrl: config.apiUrl, timeoutMs: config.apiTimeoutMs }));
  }, [config]);
  const [recipients, setRecipients] = useState("");
  const [message, setMessage] = useState("Hello from Corral.");
  const [senderId, setSenderId] = useState("ThriveVas");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    void api.status().then((result) => {
      if (cancelled || !result.ok) return;
      setAvailable(result.value.available);
      if (result.value.senderId) setSenderId(result.value.senderId);
    });
    return () => { cancelled = true; };
  }, [api]);

  async function send() {
    if (!api) {
      setNotice("Sign in to send from this workspace.");
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await api.send({ recipients, message, senderId });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }
    const who = result.value.recipients === 1 ? "1 number" : `${result.value.recipients} numbers`;
    const how = result.value.customized ? "Each person got their own text." : "Everyone got the same text.";
    setNotice(`${result.value.detail} Sent to ${who}. ${how}`);
  }

  return (
    <div className="i-page b-page">
      <div className="i-head"><h2>SMS</h2></div>
      <p className="c-faint">
        Separate numbers with commas. To change a word for each person, use one line per number, like +254712345678, Ada, and write Hello [name].
      </p>
      <FormField label="Numbers">
        <Textarea rows={4} value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder="+254712345678, +254700000000" autoComplete="off" spellCheck={false} />
      </FormField>
      <FormField label="Message" help={preview(recipients, message)}>
        <Textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} maxLength={480} />
      </FormField>
      <FormField label="Sender ID" help="3 to 11 letters or digits. It must be registered with ThriveVAS.">
        <TextInput value={senderId} onChange={(event) => setSenderId(event.target.value)} maxLength={11} autoComplete="off" />
      </FormField>
      {available === false ? <p role="status">The SMS key is not configured on this server, so nothing can send yet.</p> : null}
      <div className="b-sms__actions">
        <Button variant="primary" disabled={busy || available === false || !recipients.trim() || !message.trim()} onClick={() => void send()}>
          {busy ? "Sending" : "Send SMS"}
        </Button>
      </div>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
