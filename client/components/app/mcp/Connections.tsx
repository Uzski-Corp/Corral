"use client";
/* Settings → Developers → MCP (M9, ENG-59): connect Cursor, Claude, Claude Code, VS Code or any MCP client;
   what each connection may do, its calls, its errors, and disconnecting it. */
import { useState } from "react";
import { Button, Segmented, cx } from "../primitives";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { RadioGroup } from "../Form";
import { Tabs } from "../Tabs";
import { Banner, Skeleton, Spinner } from "../States";
import { useToast } from "../Toaster";
import { PRESETS, RATE, scopesOf, type AccessMap } from "@/lib/mcp/keys";
import { CLIENTS, MCP_URL, client, configFor, cursorDeeplink, errorFor, stepsFor, toolsFor, type Auth, type ClientId } from "@/lib/mcp/tools";
import { CALLS, CC_CALLS, CONNECTIONS, PROBLEMS, ZAPIER, ZAPIER_CALLS, type Connection, type DevSeed } from "./data";
import { AccessPicker, CopyBlock, Mark, Scopes, Status, topScopes, useCopy } from "./Shared";
import { CallTable } from "./Keys";

const MARK: Record<Connection["client"], string> = { cursor: "Cu", claude: "Cl", "claude-code": "CC", vscode: "VS", other: "{}", n8n: "n8", zapier: "Za" };
const HEALTH = {
  ok: { tone: "ok", word: "Working" }, scope: { tone: "caution", word: "Missing a scope" }, expired: { tone: "bad", word: "Key expired" }, limited: { tone: "caution", word: "Rate limited" },
} as const;

export function McpConnections({ seed }: { seed: DevSeed }) {
  const toast = useToast();
  const [conns, setConns] = useState<Connection[]>(() => seed.empty ? [] : seed.problems
    ? [...CONNECTIONS.map((c) => (PROBLEMS[c.id] ? { ...c, ...PROBLEMS[c.id] } : c)), { ...ZAPIER, ...PROBLEMS.cn_zapier }] : CONNECTIONS);
  const [dialog, setDialog] = useState(seed.dialog);
  const [pick, setPick] = useState<ClientId>(seed.client ?? "cursor");
  const [auth, setAuth] = useState<Auth>(seed.auth ?? "oauth");
  const [open, setOpen] = useState(seed.open);
  const cur = conns.find((c) => c.id === open);
  const close = () => setDialog(undefined);

  if (seed.load === "loading") return (
    <div className="i-page m-page" aria-busy="true"><div className="i-head"><h2>MCP</h2></div><span className="u-sr" role="status">Loading connections</span>
      <div className="m-endpoint m-endpoint--skel" aria-hidden="true"><Skeleton w={220} /><Skeleton w={90} h={24} r={6} /></div>
      <ul className="m-conns" aria-hidden="true">{[0, 1, 2].map((i) => <li key={i} className="m-conn"><Skeleton w={32} h={32} r={8} /><div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}><Skeleton w={180} /><Skeleton w="55%" h={8} /></div><Skeleton w={70} h={20} r={5} /></li>)}</ul></div>
  );

  const connected = () => {
    const c = client(pick);
    const n: Connection = { id: "cn_new", client: pick, name: c.name, device: pick === "claude" ? "claude.ai" : "Tomás’s MacBook Pro", who: "Tomás Ibarra", auth, preset: "Read only", access: PRESETS[0].access,
      since: "Today", last: "Just now", lastTool: "list_threads", calls7d: 1, health: "ok" };
    setConns((l) => [n, ...l.filter((x) => x.id !== "cn_new")]); close(); toast({ tone: "success", children: `${c.name} connected`, meta: "first call: list_threads" });
  };
  const disconnect = () => {
    if (!cur) return;
    setConns((l) => l.filter((x) => x.id !== cur.id)); setOpen(undefined); close();
    toast({ children: `Disconnected ${cur.name} on ${cur.device}`, meta: "its next call gets 401" });
  };

  return (
    <>
      {cur ? <ConnPage c={cur} problems={!!seed.problems} onBack={() => setOpen(undefined)} onRevoke={() => setDialog("revoke-conn")} />
        : <ConnList conns={conns} onConnect={(id) => { if (id) setPick(id); setAuth("oauth"); setDialog("connect"); }} onOpen={setOpen} />}
      {dialog === "connect" && <Connect pick={pick} setPick={setPick} auth={auth} setAuth={setAuth} onClose={close} onCopied={() => setDialog("waiting")} />}
      {dialog === "waiting" && <Waiting pick={pick} onClose={close} onArrived={() => setDialog("connected")} onBack={() => setDialog("connect")} />}
      {dialog === "connected" && <Connected pick={pick} onClose={connected} />}
      {dialog === "revoke-conn" && cur && <RevokeConn c={cur} onClose={close} onConfirm={disconnect} />}
    </>
  );
}

function Endpoint() {
  const { copy, done } = useCopy();
  return (
    <div className="m-endpoint">
      <span className="m-endpoint__lbl">Server URL</span><span className="c-mono m-endpoint__url">{MCP_URL}</span>
      <span className="m-endpoint__meta">Streamable HTTP · OAuth 2.1 or an API key · {RATE.perMinute} calls a minute per connection</span>
      <Button variant="quiet" onClick={() => copy(MCP_URL, "the server URL")} aria-label="Copy the server URL"><Icon name={done ? "check" : "copy"} size={12} />{done ? "Copied" : "Copy"}</Button>
    </div>
  );
}

function ConnList({ conns, onConnect, onOpen }: { conns: Connection[]; onConnect: (id?: ClientId) => void; onOpen: (id: string) => void }) {
  const bad = conns.filter((c) => c.health !== "ok");
  const sorted = [...bad, ...conns.filter((c) => c.health === "ok")]; // what needs you first
  return (
    <div className="i-page m-page">
      <div className="m-head">
        <div className="i-head"><h2>MCP</h2>
          <p>Let an AI client work in Corral as you: look up leads, read the Unibox, draft replies from the knowledge base. Each connection gets only the areas you allow, and every call it makes is here.</p></div>
        {conns.length > 0 && <Button variant="primary" onClick={() => onConnect()}><Icon name="plug" />Connect a client</Button>}
      </div>
      <Endpoint />
      {!conns.length ? (
        <div className="m-start">
          <div className="m-start__txt"><h3 className="m-h3">Nothing connected yet</h3>
            <p className="c-muted">Pick your client. Most sign in with your Corral account, so there’s no key to paste or leak; you choose what it may do before it can do anything.</p></div>
          <ul className="m-picker" aria-label="Clients">{CLIENTS.map((c) => (
            <li key={c.id}><button type="button" className="m-pick" onClick={() => onConnect(c.id)}><Mark label={c.mark} tone={c.id} />
              <span className="m-pick__txt"><span className="c-strong">{c.name}</span><span className="c-mono">{c.where}</span></span><Icon name="chev" size={12} /></button></li>))}</ul>
          <p className="m-start__foot"><Icon name="book" size={12} /><span>What a client can do, tool by tool: <a className="c-link" href="/app?view=settings&state=docs">the MCP docs</a>.</span></p>
        </div>
      ) : <>
        {bad.length > 0 && <Banner tone="error" title={`${bad.length} connections are failing.`}>Nothing they asked for happened, and nothing was sent. Each says what’s wrong below.</Banner>}
        <ul className="m-conns" aria-label="Connected clients">{sorted.map((c) => {
          const h = HEALTH[c.health];
          return (
            <li key={c.id} className={cx("m-conn", c.health !== "ok" && `is-${h.tone}`, c.id === "cn_new" && "is-new")}>
              <Mark label={MARK[c.client]} tone={c.client} />
              <div className="m-conn__txt">
                <span className="m-conn__top"><button type="button" className="m-rowlink" onClick={() => onOpen(c.id)}>{c.name}</button><span className="c-faint">{c.device}</span><Status tone={h.tone}>{h.word}</Status></span>
                <span className="m-conn__who">{c.who} · {c.auth === "oauth" ? "signed in" : <>API key <span className="c-mono">{c.keyName}</span></>} · {c.preset}</span>
                {c.problem ? <span className={cx("m-conn__problem", `is-${h.tone}`)}><Icon name="alert" size={12} /><span>{c.problem}</span></span>
                  : <span className="m-conn__last"><span className="c-mono">{c.lastTool}</span> {c.last} · {c.calls7d.toLocaleString("en-GB")} calls this week</span>}
              </div>
              <div className="m-conn__scopes"><Scopes scopes={scopesOf(c.access)} max={3} /></div>
              <div className="m-conn__acts">{c.health === "scope" ? <Button onClick={() => onOpen(c.id)}>See the calls</Button>
                : c.health === "expired" ? <a className="c-btn" href="/app?view=settings&state=key-expired">Replace the key</a>
                : <Button variant="quiet" onClick={() => onOpen(c.id)}>Activity</Button>}</div>
            </li>
          );
        })}</ul>
        <p className="m-foot c-muted"><Icon name="lock" size={12} />A signed-in connection stays until you disconnect it, or 90 days without a call. It acts as its person: their Unibox, their mailboxes, their Never say.</p>
      </>}
    </div>
  );
}

/** One connection: who, what it may do, its calls. `problems`: Claude Code asking for a tool it can't use. */
function ConnPage({ c, problems, onBack, onRevoke }: { c: Connection; problems: boolean; onBack: () => void; onRevoke: () => void }) {
  const [tab, setTab] = useState("activity");
  const h = HEALTH[c.health];
  const calls = c.id === "cn_cc" && problems ? CC_CALLS : c.id === "cn_zapier" ? ZAPIER_CALLS : c.id === "cn_new" ? [] : CALLS;
  const err = calls.find((x) => x.status >= 400 && x.code === "insufficient_scope");
  const tools = toolsFor(scopesOf(c.access));
  return (
    <div className="i-page m-page">
      <button type="button" className="i-back" onClick={onBack}><Icon name="back" size={12} />MCP</button>
      <div className="m-dhead">
        <div className="m-dhead__id"><Mark label={MARK[c.client]} tone={c.client} /><div><h2>{c.name}</h2><span className="m-dhead__sub">{c.device} · {c.who}<Status tone={h.tone}>{h.word}</Status></span></div></div>
        <div className="m-dhead__acts"><Button onClick={onRevoke}>Disconnect</Button></div>
      </div>
      {err && <Banner tone="caution" title="Claude Code asked to send a reply. This connection can draft but not send." action={<a className="c-btn" href="/app?view=settings&state=mcp-consent">Allow sending</a>}>
        3 calls to <span className="c-mono">send_reply</span> got <span className="c-mono">403 insufficient_scope</span>; nothing was sent. Brian’s draft is in the Unibox. {errorFor("insufficient_scope")!.fix}</Banner>}
      <div className="i-tabs"><Tabs label={`${c.name} sections`} value={tab} onChange={setTab} tabs={[{ id: "activity", label: "Activity", count: calls.length }, { id: "access", label: "What it may do" }]} /></div>
      {tab === "activity" ? (
        <section className="m-sec" aria-label="Activity">
          <div className="m-sec__bar"><span className="c-muted">Every call in the last 7 days · {c.calls7d.toLocaleString("en-GB")} in all · kept 90 days</span></div>
          <CallTable calls={calls} empty="No calls yet. They show here as they happen." />
        </section>
      ) : (
        <section className="m-sec" aria-label="What it may do">
          <dl className="i-facts">
            <div><dt>Signed in</dt><dd>{c.auth === "oauth" ? `${c.who}, ${c.since}` : `With the API key ${c.keyName}`}</dd></div>
            <div><dt>Allowed</dt><dd>{c.preset}: <Scopes scopes={topScopes(scopesOf(c.access))} max={8} /></dd></div>
            <div><dt>Sees</dt><dd>{tools.length} of 15 tools: <span className="c-mono">{tools.map((t) => t.name).join(", ")}</span></dd></div>
          </dl>
          <AccessPicker value={c.access} />
          <p className="m-note"><Icon name="lock" size={12} /><span>To change what it may do, disconnect and connect again; the client asks you on the consent page. That way a client can never widen its own access.</span></p>
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ connect */
function Connect({ pick, setPick, auth, setAuth, onClose, onCopied }: { pick: ClientId; setPick: (c: ClientId) => void; auth: Auth; setAuth: (a: Auth) => void; onClose: () => void; onCopied: () => void }) {
  const c = client(pick);
  const a: Auth = c.oauth ? auth : "key";
  const steps = stepsFor(pick, a);
  return (
    <Dialog open onClose={onClose} width={640} title="Connect a client" description="Pick the client you use. Corral writes the config; you paste it where the client reads it."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={onCopied}>I’ve added it</Button></>}>
      <div className="m-connect">
        <div className="m-clients" role="radiogroup" aria-label="Client">{CLIENTS.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={x.id === pick} className={cx("m-client", x.id === pick && "is-on")} onClick={() => setPick(x.id)}>
            <Mark label={x.mark} tone={x.id} /><span>{x.name}</span></button>))}</div>
        <div className="m-connect__auth">
          <span className="m-label">Sign in with</span>
          {c.oauth ? <Segmented label="Sign in with" options={["Corral account", "API key"]} value={a === "oauth" ? "Corral account" : "API key"} onChange={(v) => setAuth(v === "API key" ? "key" : "oauth")} />
            : <span className="c-muted">An API key (clients without OAuth)</span>}
          <span className="m-connect__why">{a === "oauth" ? "Recommended. No secret in a file; you pick what it may do on the next screen." : "For clients or machines that can’t open a browser. The key’s scopes are what it gets."}</span>
        </div>
        {pick === "cursor" && a === "oauth" && <div className="m-oneclick"><a className="c-btn c-btn--ink" href={cursorDeeplink()}><Mark label="Cu" tone="cursor" />Add to Cursor</a><span className="c-muted">Opens Cursor and adds Corral. Or copy the config:</span></div>}
        <ol className="m-steps">{steps.map((s, i) => <li key={i}><span className="m-steps__n">{i + 1}</span><span>{s}</span></li>)}</ol>
        <CopyBlock label={c.lang === "shell" ? "Command" : c.lang === "steps" ? "Connector" : "Config"} where={c.where} text={configFor(pick, a)} what={c.lang === "shell" ? "the command" : "the config"} />
        {a === "key" && <p className="m-note"><Icon name="key" size={12} /><span>{pick === "vscode" ? "No key in the file: VS Code asks for it when the server starts and keeps it in its secret storage." : "Replace YOUR_CORRAL_API_KEY with a key."} Need one? <a className="c-link" href="/app?view=settings&state=key-create">Create a key</a> with only the areas this client needs.</span></p>}
      </div>
    </Dialog>
  );
}

function Waiting({ pick, onClose, onArrived, onBack }: { pick: ClientId; onClose: () => void; onArrived: () => void; onBack: () => void }) {
  const c = client(pick);
  return (
    <Dialog open onClose={onClose} width={520} title={`Waiting for ${c.name}`} description="Corral is listening for its first call. Leave this open, or close it: the connection shows up on its own."
      footer={<><Button variant="quiet" onClick={onBack}>Back to the config</Button><Button onClick={onArrived}>Check again</Button></>}>
      <div className="m-wait" role="status">
        <ol className="m-waitsteps">
          <li className="is-done"><Icon name="check" size={12} />Config copied</li>
          <li className="is-live"><Spinner size={12} />{c.oauth ? `${c.name} opens Corral in your browser to sign in` : `${c.name} calls ${MCP_URL}`}</li>
          <li><span className="m-waitsteps__dot" aria-hidden="true" />First call: usually <span className="c-mono">tools/list</span></li>
        </ol>
        <p className="m-note"><Icon name="help" size={12} /><span>Nothing after a minute? Restart {c.name} so it reads the config again. In Cursor, check Settings → MCP shows corral in green.</span></p>
      </div>
    </Dialog>
  );
}

function Connected({ pick, onClose }: { pick: ClientId; onClose: () => void }) {
  const c = client(pick);
  const tools = toolsFor(scopesOf(PRESETS[0].access));
  return (
    <Dialog open onClose={onClose} width={520} title={`${c.name} is connected`} description="Signed in as tomas@coldtrace.io, read only. First call at 09:45."
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="m-form">
        <Banner tone="success" title={`${c.name} sees ${tools.length} tools.`}>All of them read. To let it draft or build segments, connect again and allow more.</Banner>
        <ul className="m-toolchips" aria-label="Tools it sees">{tools.map((t) => <li key={t.name} className="c-mono">{t.name}</li>)}</ul>
        <p className="m-note"><Icon name="bolt" size={12} /><span>Try asking it: “What needs me in the Unibox this morning?”</span></p>
      </div>
    </Dialog>
  );
}

function RevokeConn({ c, onClose, onConfirm }: { c: Connection; onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog open onClose={onClose} width={500} tone="danger" title={`Disconnect ${c.name} on ${c.device}?`} description="It stops at once. You can connect it again; it signs in and asks for access again."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" className="i-btn-danger" onClick={onConfirm}>Disconnect</Button></>}>
      <ul className="m-list">
        <li className="is-no"><Icon name="x" size={12} />Its next call gets <span className="c-mono">401 invalid_token</span>; {c.name} shows Corral as disconnected</li>
        <li className="is-no"><Icon name="x" size={12} />Last call {c.last} (<span className="c-mono">{c.lastTool}</span>); {c.calls7d} this week</li>
        <li><Icon name="check" size={12} />Drafts it saved stay in the Unibox, and its calls stay in the log</li>
        <li><Icon name="check" size={12} />Other connections and your API keys aren’t touched</li>
      </ul>
    </Dialog>
  );
}

/** The page a client opens in your browser (/oauth/authorize): what it asks for, per area. */
export function Consent({ onDone }: { onDone?: (ok: boolean) => void }) {
  const [preset, setPreset] = useState("draft");
  const [access, setAccess] = useState<AccessMap>(PRESETS[1].access);
  const [done, setDone] = useState<"allowed" | "denied">();
  const pickPreset = (id: string) => { setPreset(id); const p = PRESETS.find((x) => x.id === id)!; if (id !== "custom") setAccess(p.access); };
  const n = toolsFor(scopesOf(access)).length;
  if (done) return (
    <div className="m-consent"><div className="m-consent__card m-consent__card--done" role="status">
      <Icon name={done === "allowed" ? "check" : "x"} size={16} /><h1>{done === "allowed" ? "Claude Code is connected" : "Claude Code wasn’t connected"}</h1>
      <p className="c-muted">{done === "allowed" ? "You can close this tab and go back to your terminal." : "Nothing was shared. You can close this tab."}</p>
      <a className="c-link" href="/app?view=settings&state=mcp">Back to Corral</a></div></div>
  );
  return (
    <div className="m-consent">
      <div className="m-consent__url c-mono" aria-hidden="true"><Icon name="lock" size={11} />corral.app/oauth/authorize?client_id=claude-code…</div>
      <div className="m-consent__card">
        <div className="m-consent__pair" aria-hidden="true"><Mark label="CC" tone="claude-code" /><span className="m-consent__link" /><span className="m-mark is-corral">C</span></div>
        <h1>Claude Code wants to use Corral</h1>
        <p className="m-consent__who">As <b>Tomás Ibarra</b> (tomas@coldtrace.io) in <b>ColdTrace</b>. It sends you back to <span className="c-mono">http://localhost:33418/callback</span>.</p>
        <RadioGroup label="What it may do" variant="cards" value={preset} onChange={pickPreset} options={PRESETS.map((p) => ({ value: p.id, label: p.label, description: p.id === "custom" ? "Set each area yourself, including sending replies." : p.hint }))} />
        <AccessPicker value={access} onChange={(a) => { setAccess(a); setPreset("custom"); }} />
        {access.unibox === "send" && <Banner tone="caution" title="It can send replies as you.">Each still waits out the 10-second undo and the Never-say check, from the thread’s mailbox. You see every one in the Unibox.</Banner>}
        <div className="m-consent__never"><span className="m-label">Never, whatever you pick</span>
          <ul className="m-list"><li className="is-no"><Icon name="x" size={12} />See mailbox passwords, API keys or billing</li><li className="is-no"><Icon name="x" size={12} />Add teammates or change their access</li><li className="is-no"><Icon name="x" size={12} />Start a sequence without its launch checks</li></ul></div>
        <div className="m-consent__foot">
          <span className="c-muted">{n} tools · until you disconnect it</span><span style={{ flex: 1 }} />
          <Button variant="quiet" onClick={() => { setDone("denied"); onDone?.(false); }}>Deny</Button>
          <Button variant="primary" disabled={!scopesOf(access).length} onClick={() => { setDone("allowed"); onDone?.(true); }}>Allow</Button>
        </div>
      </div>
    </div>
  );
}
