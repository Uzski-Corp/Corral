/* /mcp (M10): the public page for Corral's MCP server. The same tools, errors and limits the server serves
   (lib/mcp/tools.ts) and the in-app docs show (Settings → Developers → Docs). */
import { RATE, ROTATE_OVERLAP_HOURS, DEFAULT_EXPIRY } from "@/lib/mcp/keys";
import { AREA_TITLE, ERRORS, MCP_URL, TOOLS, byArea, keyMayCall } from "@/lib/mcp/tools";
import { CTA, CTA_SIGNED_IN, ROUTES, claim } from "@/lib/marketing/site";
import { VisitorLink } from "./VisitorLink";
import { Section, SitePage, ToConfirm } from "./Chrome";
import { KeyAccessPiece, McpClientsPiece } from "./Pieces";

const KIND = { read: "Read", write: "Write", send: "Sends email" } as const;

export function McpPage() {
  const host = claim("host")!;
  return (
    <SitePage current={ROUTES.mcp} kicker="MCP server" title={<>Corral, from the tools<br />you already work in.</>}
      lede="Cursor, Claude and any client that speaks MCP can look up a lead, read the Unibox and draft a reply the way you would: cited from your knowledge base, checked against Never say, and waiting for you before anything goes out."
      aside={<dl className="sn-facts">
        <div><dt>Server</dt><dd className="c-mono">{MCP_URL}</dd></div>
        <div><dt>Transport</dt><dd>Streamable HTTP</dd></div>
        <div><dt>Sign-in</dt><dd>OAuth 2.1, or an API key</dd></div>
        <div><dt>Tools</dt><dd>{TOOLS.length}, across six areas</dd></div>
        {!host.confirmed && <div><dt>Host</dt><dd><ToConfirm who={host.owner} /></dd></div>}
      </dl>}>

      <Section n="01" id="connect" title="Connect a client." wide>
        <p className="sn-body">Add the server, then the first call opens Corral in your browser: you pick what the client may do, per area, and Allow. Or connect from Settings → Developers → MCP, which writes this for you and tells you when the first call lands.</p>
        <McpClientsPiece />
      </Section>

      <Section n="02" id="keys" title="A person signs in. A job gets a key.">
        <div className="sn-pair">
          <div><p className="sn-pair__k">For a person’s AI client</p><h3>Sign in with Corral</h3>
            <p>OAuth, no key to paste or leak. The client acts as you: your Unibox, your mailboxes, your Never say. It’s the only way to hold <span className="c-mono">unibox:send</span>, and even then a send waits out the same undo as the button.</p></div>
          <div><p className="sn-pair__k">For a job that runs without you</p><h3>An API key</h3>
            <p>A <span className="c-mono">Bearer</span> key for n8n, Zapier or your own code, scoped per area and shown once. It expires after {DEFAULT_EXPIRY} days by default; rotating keeps the old one working {ROTATE_OVERLAP_HOURS} hours. Keys read and draft. They never send.</p></div>
        </div>
        <div className="sn-piece"><KeyAccessPiece /><p className="sn-cap">Create key → What it may do. The Unibox stops at Write for a key.</p></div>
      </Section>

      <Section n="03" id="tools" title={`${TOOLS.length} tools, and nothing else.`} wide>
        <p className="sn-body">A client only sees the tools its access allows; the rest aren’t listed. Billing, team and mailbox settings stay in the app, on purpose.</p>
        {byArea().map((g) => (
          <div key={g.area} className="sn-tools">
            <h3>{AREA_TITLE[g.area]}</h3>
            <ul>{g.tools.map((t) => (
              <li key={t.name}>
                <span className="c-mono sn-tools__name">{t.name}</span>
                <span className={`sn-kind is-${t.kind}`}>{KIND[t.kind]}</span>
                <span className="sn-tools__does">{t.does}{!keyMayCall(t) && <em> Signed-in clients only.</em>}{t.credits ? <em> {t.credits} credit, the same as in the app.</em> : null}</span>
                <span className="c-mono sn-tools__scope">{t.scope}</span>
              </li>))}</ul>
          </div>
        ))}
      </Section>

      <Section n="04" id="guardrails" title="The same rules as the Send button.">
        <ul className="sn-rules">
          <li><b>Nothing sends by default.</b> Only a signed-in connection can hold <span className="c-mono">unibox:send</span>, and a send waits out the 10-second undo and the Never-say check.</li>
          <li><b>Drafts show their work.</b> <span className="c-mono">draft_reply</span> cites the knowledge base and lists what it left out.</li>
          <li><b>A thread that moved stops a send.</b> If the lead or a teammate wrote since the draft, <span className="c-mono">send_reply</span> answers 409 and nothing goes out.</li>
          <li><b>Enrolling isn’t launching.</b> Step one waits for the sequence’s launch checks. New knowledge sources wait in Review.</li>
        </ul>
      </Section>

      <Section n="05" id="errors" title="When it says no." wide>
        <table className="sn-table">
          <thead><tr><th scope="col">Status</th><th scope="col">Code</th><th scope="col">What it means</th><th scope="col">What to do</th></tr></thead>
          <tbody>{ERRORS.map((e) => <tr key={e.code}><td className="c-mono">{e.status}</td><td className="c-mono">{e.code}</td><td>{e.means}</td><td>{e.fix}</td></tr>)}</tbody>
        </table>
      </Section>

      <Section n="06" id="limits" title="Limits.">
        <dl className="sn-facts sn-facts--row">
          <div><dt>Calls</dt><dd>{RATE.perMinute} a minute per key or connection</dd></div>
          <div><dt>Writes</dt><dd>{RATE.writesPerMinute} a minute</dd></div>
          <div><dt>Sends</dt><dd>{RATE.sendsPerHour} an hour, never past a mailbox’s daily cap</dd></div>
          <div><dt>Log</dt><dd>Every call, 90 days</dd></div>
        </dl>
        <p className="sn-body sn-mt"><VisitorLink className="c-btn c-btn--primary c-btn--lg" href={CTA.start} signedInHref={CTA_SIGNED_IN.mcpConnect}>Sign in and connect</VisitorLink></p>
      </Section>
    </SitePage>
  );
}
