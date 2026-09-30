"use client";
/* Settings → Developers → Docs (M9, ENG-59): the MCP server and the API, inside the app. Written like a
   page, not a template: how to connect, every tool with a real call from this workspace, and the guardrails. */
import { useEffect, useId, useState } from "react";
import { Button, cx } from "../primitives";
import { Icon } from "../icons";
import { TextInput } from "../Form";
import { Tabs } from "../Tabs";
import { EmptyState } from "../States";
import { RATE, ROTATE_OVERLAP_HOURS } from "@/lib/mcp/keys";
import { AREA_TITLE, CLIENTS, ERRORS, MCP_URL, TOOLS, byArea, callBody, client, configFor, curlFor, searchTools, stepsFor, type ClientId, type Tool } from "@/lib/mcp/tools";
import type { DevSeed } from "./data";
import { CopyBlock } from "./Shared";

const KIND: Record<Tool["kind"], string> = { read: "Read", write: "Write", send: "Sends email" };
const TOC = [["connect", "Connect"], ["auth", "Sign-in and keys"], ["tools", `Tools · ${TOOLS.length}`], ["guardrails", "Guardrails"], ["errors", "Errors"], ["limits", "Limits"], ["changes", "Changes"]] as const;

export function McpDocs({ seed }: { seed: DevSeed }) {
  const [q, setQ] = useState(seed.docQuery ?? "");
  const [open, setOpen] = useState<string | undefined>(seed.docTool ?? "search_companies");
  const [cl, setCl] = useState<ClientId>("cursor");
  const found = searchTools(q);
  const groups = byArea(found);
  const c = client(cl);
  // A deep link to a tool (or a search) lands on it, not on the top of the page.
  useEffect(() => {
    const el = document.getElementById(seed.docTool ? `tool-${seed.docTool}` : seed.docQuery ? "tools" : "");
    el?.scrollIntoView?.({ block: "start" });
  }, [seed.docTool, seed.docQuery]);
  return (
    <div className="m-docs">
      <article className="m-docs__main">
        <header className="m-docs__hero">
          <span className="m-kicker">Developers · MCP server · API v1</span>
          <h2 className="m-docs__title">Corral, from the tools you already work in</h2>
          <p className="m-docs__lead">Corral runs an MCP server, so Cursor, Claude and any client that speaks MCP can look up a lead, read the Unibox and draft a reply the same way you would here: cited from your knowledge base, checked against Never say, and waiting for you before anything goes out.</p>
          <div className="m-docs__facts">
            <div><span className="m-label">Server</span><span className="c-mono">{MCP_URL}</span></div>
            <div><span className="m-label">Transport</span><span>Streamable HTTP</span></div>
            <div><span className="m-label">Sign-in</span><span>OAuth 2.1, or an API key</span></div>
            <div><span className="m-label">Version</span><span>2026-09 · stable</span></div>
          </div>
        </header>

        <section id="connect" className="m-docsec" aria-labelledby="d-connect">
          <h3 id="d-connect" className="m-docsec__h"><span className="m-docsec__n">01</span>Connect</h3>
          <p>Add the server to your client. Clients that support OAuth sign in with your Corral account the first time they call; you pick what they may do.</p>
          <Tabs variant="pill" label="Client" value={cl} onChange={(v) => setCl(v as ClientId)} tabs={CLIENTS.map((x) => ({ id: x.id, label: x.name }))} />
          <div className="m-docs__client">
            <ol className="m-steps">{stepsFor(cl, c.oauth ? "oauth" : "key").map((s, i) => <li key={i}><span className="m-steps__n">{i + 1}</span><span>{s}</span></li>)}</ol>
            <CopyBlock label={c.lang === "shell" ? "Command" : c.lang === "steps" ? "Connector" : "Config"} where={c.where} text={configFor(cl, c.oauth ? "oauth" : "key")} what={c.lang === "shell" ? "the command" : "the config"} />
          </div>
          <p className="m-docs__aside"><Icon name="plug" size={12} />Or connect from <a className="c-link" href="/app?view=settings&state=mcp-connect">Settings → MCP</a>: it writes the config and tells you when the first call lands.</p>
        </section>

        <section id="auth" className="m-docsec" aria-labelledby="d-auth">
          <h3 id="d-auth" className="m-docsec__h"><span className="m-docsec__n">02</span>Sign-in and keys</h3>
          <div className="m-docs__two">
            <div className="m-docs__card"><span className="m-docs__cardk">For a person’s AI client</span><h4>Sign in with Corral</h4>
              <p>OAuth 2.1 with PKCE. The client acts as the person who signed in: their Unibox, their mailboxes, their Never say. No secret in a file. Disconnect it in Settings → MCP.</p></div>
            <div className="m-docs__card"><span className="m-docs__cardk">For a job that runs without you</span><h4>An API key</h4>
              <p>A <span className="c-mono">crl_live_</span> key in an <span className="c-mono">Authorization: Bearer</span> header. Scoped per area, shown once, expires in 90 days by default. Rotating keeps the old one working {ROTATE_OVERLAP_HOURS} hours.</p></div>
          </div>
          <p>Both get the same scopes: <span className="c-mono">area:read</span>, <span className="c-mono">area:write</span>, and <span className="c-mono">unibox:send</span>, which is never given by default. A client only sees the tools its scopes allow; the others aren’t listed.</p>
        </section>

        <section id="tools" className="m-docsec" aria-labelledby="d-tools">
          <div className="m-docsec__top"><h3 id="d-tools" className="m-docsec__h"><span className="m-docsec__n">03</span>Tools</h3>
            <div className="m-docs__search"><TextInput icon="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools" aria-label="Search tools" /></div></div>
          {!found.length ? (
            <EmptyState compact icon="search" title={`No tool for “${q}”`} actions={<Button onClick={() => setQ("")}>Show all {TOOLS.length}</Button>}>
              Corral’s MCP covers leads, segments, sequences, the Unibox, the knowledge base and scoring. Billing, team and mailbox settings stay in the app, on purpose.</EmptyState>
          ) : groups.map((g) => (
            <div key={g.area} className="m-toolgroup">
              <h4 className="m-toolgroup__h">{AREA_TITLE[g.area]}<span className="c-faint">{g.tools.length}</span></h4>
              <ul className="m-tools">{g.tools.map((t) => <ToolRow key={t.name} t={t} open={open === t.name} onToggle={() => setOpen(open === t.name ? undefined : t.name)} />)}</ul>
            </div>
          ))}
        </section>

        <section id="guardrails" className="m-docsec" aria-labelledby="d-guard">
          <h3 id="d-guard" className="m-docsec__h"><span className="m-docsec__n">04</span>Guardrails</h3>
          <p>A client is another way in, not a way around. Everything the app checks, MCP checks too.</p>
          <ul className="m-guards">
            <li><b>Nothing sends by default.</b> Only <span className="c-mono">unibox:send</span> can send, and a send waits out the same 10-second undo and Never-say check as the button.</li>
            <li><b>Drafts cite, or say they can’t.</b> <span className="c-mono">draft_reply</span> uses only the knowledge base and lists what it left out, like the draft in the Unibox.</li>
            <li><b>Enrolling isn’t launching.</b> Step 1 waits for the sequence’s launch checks: mailbox health, the daily cap, Never say.</li>
            <li><b>New knowledge waits for you.</b> Sources a client adds sit in Review until you approve them.</li>
            <li><b>Stale drafts don’t go.</b> If the lead or a teammate wrote since the draft, <span className="c-mono">send_reply</span> answers <span className="c-mono">409 thread_changed</span>.</li>
            <li><b>Every call is logged</b> with its connection, arguments and result, for 90 days.</li>
          </ul>
        </section>

        <section id="errors" className="m-docsec" aria-labelledby="d-errors">
          <h3 id="d-errors" className="m-docsec__h"><span className="m-docsec__n">05</span>Errors</h3>
          <p>Tool errors come back as MCP results with <span className="c-mono">isError: true</span> and the code below; sign-in errors as HTTP statuses.</p>
          <table className="m-table m-errs"><thead><tr><th scope="col">Status</th><th scope="col">Code</th><th scope="col">Means</th><th scope="col">Do</th></tr></thead>
            <tbody>{ERRORS.map((e) => <tr key={e.code}><td className="c-mono">{e.status}</td><td className="c-mono m-errs__code">{e.code}</td><td>{e.means}</td><td>{e.fix}</td></tr>)}</tbody></table>
        </section>

        <section id="limits" className="m-docsec" aria-labelledby="d-limits">
          <h3 id="d-limits" className="m-docsec__h"><span className="m-docsec__n">06</span>Limits</h3>
          <dl className="i-facts">
            <div><dt>Calls</dt><dd>{RATE.perMinute} a minute per key or connection</dd></div>
            <div><dt>Writes</dt><dd>{RATE.writesPerMinute} a minute, inside the {RATE.perMinute}</dd></div>
            <div><dt>Sends</dt><dd>{RATE.sendsPerHour} an hour, and never past a mailbox’s own daily cap</dd></div>
            <div><dt>Scoring</dt><dd>1 credit a company, from the workspace’s credits</dd></div>
            <div><dt>Over the limit</dt><dd><span className="c-mono">429 rate_limited</span> with <span className="c-mono">Retry-After</span> in seconds</dd></div>
          </dl>
        </section>

        <section id="changes" className="m-docsec" aria-labelledby="d-changes">
          <h3 id="d-changes" className="m-docsec__h"><span className="m-docsec__n">07</span>Changes</h3>
          <ul className="m-changes">
            <li><span className="c-mono">2026-09</span><span>First release: {TOOLS.length} tools across six areas, OAuth sign-in, scoped keys.</span></li>
          </ul>
        </section>
      </article>
      <nav className="m-toc" aria-label="On this page">
        <span className="m-label">On this page</span>
        <ul>{TOC.map(([id, l]) => <li key={id}><a href={`#${id}`}>{l}</a></li>)}</ul>
        <a className="m-toc__cta c-btn" href="/app?view=settings&state=mcp-connect"><Icon name="plug" />Connect a client</a>
      </nav>
    </div>
  );
}

function ToolRow({ t, open, onToggle }: { t: Tool; open: boolean; onToggle: () => void }) {
  const id = useId();
  const [how, setHow] = useState("mcp");
  return (
    <li id={`tool-${t.name}`} className={cx("m-tool", open && "is-open")}>
      <button type="button" className="m-tool__head" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span className="c-mono m-tool__name">{t.name}</span>
        <span className={cx("m-kind", `is-${t.kind}`)}>{KIND[t.kind]}</span>
        <span className="m-tool__does">{t.does}</span>
        <span className="c-mono m-tool__scope">{t.scope}</span>
        <span className="m-tool__chev"><Icon name="down" size={12} /></span>
      </button>
      {open && <div id={id} className="m-tool__body">
        {t.guard && <p className="m-tool__guard"><Icon name="lock" size={12} /><span>{t.guard}</span></p>}
        {t.args.length > 0 ? <table className="m-table m-args"><thead><tr><th scope="col">Argument</th><th scope="col">Type</th><th scope="col">Note</th></tr></thead>
          <tbody>{t.args.map((a) => <tr key={a.name}><td className="c-mono">{a.name}{a.required && <span className="m-req" title="Required">required</span>}</td><td className="c-mono">{a.type}</td><td>{a.note}</td></tr>)}</tbody></table>
          : <p className="c-muted m-none">No arguments.</p>}
        <p className="m-ask"><span className="m-label">Ask your client</span><q>{t.example.ask}</q></p>
        <div className="m-tool__io">
          <div><Tabs variant="pill" label={`${t.name} request`} value={how} onChange={setHow} tabs={[{ id: "mcp", label: "MCP call" }, { id: "curl", label: "curl" }]} />
            <CopyBlock label={how === "mcp" ? "tools/call" : "curl with a key"} text={how === "mcp" ? callBody(t) : curlFor(t)} what="the example" /></div>
          <div className="m-tool__res"><span className="m-label">Result</span><pre className="m-code__pre m-code__pre--plain" tabIndex={0} aria-label={`${t.name} result`}><code>{JSON.stringify(t.example.result, null, 2)}</code></pre>
            {t.credits && <span className="c-muted m-credit">Costs {t.credits} credit.</span>}</div>
        </div>
      </div>}
    </li>
  );
}
