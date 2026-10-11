"use client";
/* Settings → Developers (M9): the pieces the keys, the connections and the docs share. */
import { useState, type ReactNode } from "react";
import { Button, Segmented, cx } from "../primitives";
import { Icon } from "../icons";
import { useToast } from "../Toaster";
import { AREAS, accessOf, levelsFor, maySend, scopesOf, type Access, type AccessMap, type Area, type Holder } from "@/lib/mcp/keys";

/** Copy to the clipboard; says so either way (the clipboard can be blocked). */
export function useCopy() {
  const toast = useToast();
  const [done, setDone] = useState<string>();
  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    setDone(what); toast({ tone: "success", icon: "copy", children: `Copied ${what}` });
  };
  return { copy, done };
}

/** A snippet you copy: what it is and where it goes, the text in mono, one Copy. */
export function CopyBlock({ label, where, text, what, secret, tall }: { label: string; where?: ReactNode; text: string; what: string; secret?: boolean; tall?: boolean }) {
  const { copy, done } = useCopy();
  return (
    <div className={cx("m-code", secret && "m-code--secret", tall && "m-code--tall")}>
      <div className="m-code__bar"><span className="m-code__label">{label}</span>{where && <span className="c-mono m-code__where">{where}</span>}<span style={{ flex: 1 }} />
        <Button variant={secret ? "primary" : "quiet"} onClick={() => copy(text, what)} aria-label={`Copy ${what}`}><Icon name={done ? "check" : "copy"} size={12} />{done ? "Copied" : "Copy"}</Button></div>
      <pre className="m-code__pre" tabIndex={0} aria-label={label}><code>{text}</code></pre>
    </div>
  );
}

const WORD: Record<Access, string> = { none: "None", read: "Read", write: "Write", send: "Send" };
const FROM_WORD: Record<string, Access> = { None: "none", Read: "read", Write: "write", Send: "send" };

/** Per-area access: None, Read, Write (and Send, Unibox only, for a signed-in connection). What each level lets it do, in words.
    holder="key": the Unibox stops at Write and says why (a job drafts; a person sends). */
export function AccessPicker({ value, onChange, invalid, holder = "oauth" }: { value: AccessMap; onChange?: (a: AccessMap) => void; invalid?: boolean; holder?: Holder }) {
  return (
    <ul className={cx("m-access", invalid && "is-error")} aria-label="What it may do">
      {AREAS.map((a) => {
        const v = value[a.id];
        const opts = levelsFor(a.id, holder).map((l) => WORD[l]);
        const locked = !!a.send && !maySend(holder);
        return (
          <li key={a.id} className={cx("m-access__row", v === "send" && "is-send")}>
            <div className="m-access__txt"><span className="c-strong">{a.label}</span>
              <span className="m-access__what">{v === "none" ? "No access" : v === "read" ? a.read : v === "write" ? a.write : a.send}</span>
              {locked && <span className="m-access__lock"><Icon name="lock" size={11} />Keys can draft but can’t send. Sending needs a signed-in MCP connection.</span>}</div>
            <Segmented label={a.label} options={opts} value={WORD[v]} onChange={onChange ? (o) => onChange({ ...value, [a.id]: FROM_WORD[o] }) : undefined} />
          </li>
        );
      })}
    </ul>
  );
}

/** Scopes as short tags: leads:write, unibox:read… A key's column and a connection's row. */
export function Scopes({ scopes, max = 4 }: { scopes: readonly string[]; max?: number }) {
  const top = topScopes(scopes);
  const shown = top.slice(0, max);
  return (
    <span className="m-scopes">{shown.map((s) => <span key={s} className={cx("m-scope", s.endsWith(":send") && "is-send", s.endsWith(":write") && "is-write")}>{s}</span>)}
      {top.length > max && <span className="m-scope is-more">+{top.length - max}</span>}</span>
  );
}
/** The highest scope per area (write implies read, so only write shows). */
export function topScopes(scopes: readonly string[]): string[] {
  const m = accessOf(scopes);
  return (Object.keys(m) as Area[]).filter((a) => m[a] !== "none").map((a) => `${a}:${m[a]}`);
}
export const scopeCount = (a: AccessMap) => scopesOf(a).length;

/** A client's mark: two letters on a tile (no third-party logos in the product). */
/** Client logos from svgl.app (public/corral/logos); a client without one keeps its two letters. */
const LOGO: Record<string, string> = {
  cursor: "/corral/logos/cursor.svg", claude: "/corral/logos/claude.svg", "claude-code": "/corral/logos/claude.svg",
  vscode: "/corral/logos/vscode.svg", n8n: "/corral/logos/n8n.svg",
};
export const Mark = ({ label, tone }: { label: string; tone?: string }) => {
  const logo = tone ? LOGO[tone] : undefined;
  // eslint-disable-next-line @next/next/no-img-element
  if (logo) return <span className="m-mark is-logo" aria-hidden="true"><img src={logo} alt="" width={18} height={18} /></span>;
  return <span className={cx("m-mark", tone && `is-${tone}`)} aria-hidden="true">{label}</span>;
};

/** A small status word with a dot. */
export const Status = ({ tone, children }: { tone: "ok" | "caution" | "bad" | "off" | "live"; children: ReactNode }) =>
  <span className={cx("m-status", `is-${tone}`)}><span className="m-status__dot" aria-hidden="true" />{children}</span>;
