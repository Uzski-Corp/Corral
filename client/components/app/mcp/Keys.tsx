"use client";
/* Settings → Developers → API keys (M9, ENG-59): create with scopes, the secret once, last used, rotate,
   revoke, and a key that expired while something still calls it. */
import { useMemo, useState } from "react";
import { Button, Segmented, cx } from "../primitives";
import { Icon } from "../icons";
import { Dialog, DropdownMenu } from "../Overlays";
import { FormField, RadioGroup, Select, TextInput } from "../Form";
import { Banner, EmptyState, ErrorState, Skeleton } from "../States";
import { useToast } from "../Toaster";
import { DEFAULT_EXPIRY, EXPIRY, KEY_PREFIX, PRESETS, ROTATE_OVERLAP_HOURS, STATUS_WORD, addDays, canManageKey, keyScopesOf, dayWords, expiresOn, expiryWords, isValid, lastUsedWords, manageNote, rotate, statusOf, validateKey,
  type AccessMap, type ExpiryId, type KeyEnv, type KeyStatus, type Viewer } from "@/lib/mcp/keys";
import { KEYS, NEW_KEY, NEW_SECRET, NOW, OWNER, REVOKED_KEYS, ROTATED_SECRET, ZAPIER_CALLS, type ApiKey, type DevSeed } from "./data";
import { AccessPicker, CopyBlock, Scopes, Status } from "./Shared";

const TONE: Record<KeyStatus, "ok" | "caution" | "bad" | "off" | "live"> = { active: "ok", expiring: "caution", rotating: "live", expired: "bad", revoked: "off" };
const masked = (k: Pick<ApiKey, "env" | "last4">) => `${KEY_PREFIX[k.env]}…${k.last4}`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
const when = (iso: string) => `${dayWords(new Date(iso))}, ${hhmm(iso)}`;
type Draft = { name: string; access: AccessMap; expiry: ExpiryId; env: KeyEnv; preset: string };

export function ApiKeys({ seed }: { seed: DevSeed }) {
  const toast = useToast();
  const [load, setLoad] = useState(seed.load);
  const [keys, setKeys] = useState<ApiKey[]>(seed.empty ? [] : seed.key === "key_new" ? [NEW_KEY, ...KEYS] : KEYS);
  const [dialog, setDialog] = useState(seed.dialog);
  const [keyId, setKeyId] = useState(seed.key);
  const [open, setOpen] = useState(seed.open);
  const [secret, setSecret] = useState(seed.dialog === "reveal" ? NEW_SECRET : seed.dialog === "rotated" ? ROTATED_SECRET : "");
  const cur = keys.find((k) => k.id === keyId);
  const close = () => setDialog(undefined);
  const viewer: Viewer = seed.viewer ?? OWNER;

  if (load === "error") return (
    <div className="i-page i-page--center"><ErrorState title="Couldn’t load your API keys" detail="GET /api/v1/keys · 503"
      actions={<Button variant="primary" onClick={() => setLoad(undefined)}><Icon name="refresh" />Try again</Button>}>
      No key was changed or revoked, and calls with them still work. This is only the page failing to load.</ErrorState></div>
  );

  const created = (d: Draft) => {
    const k: ApiKey = { id: "key_new", name: d.name.trim(), env: d.env, last4: NEW_SECRET.slice(-4), scopes: keyScopesOf(d.access), by: viewer.name, created: NOW.toISOString(),
      expires: expiresOn(NOW, d.expiry)?.toISOString() ?? null, calls7d: 0 };
    setKeys((l) => [k, ...l]); setKeyId(k.id); setSecret(NEW_SECRET); setDialog("reveal");
  };
  const doRotate = (overlap: boolean) => {
    if (!cur) return;
    const r = rotate(NOW);
    setKeys((l) => l.map((k) => (k.id === cur.id ? { ...k, last4: ROTATED_SECRET.slice(-4), oldUntil: overlap ? r.oldUntil : undefined } : k)));
    setSecret(ROTATED_SECRET); setDialog("rotated");
  };
  const doRevoke = () => {
    if (!cur) return;
    setKeys((l) => l.filter((k) => k.id !== cur.id)); setOpen(undefined); close();
    toast({ children: `Revoked ${cur.name}`, meta: "its next call gets 401" });
  };
  const replace = (k: ApiKey) => {
    const nk: ApiKey = { ...k, id: "key_new", name: k.name.replace(/ \(old\)$/, ""), last4: NEW_SECRET.slice(-4), created: NOW.toISOString(), expires: addDays(NOW, 90).toISOString(), lastUsed: undefined, refused: undefined, calls7d: 0 };
    setKeys((l) => [nk, ...l.filter((x) => x.id !== k.id)]); setOpen(undefined); setKeyId(nk.id); setSecret(NEW_SECRET); setDialog("reveal");
  };

  const openKey = keys.find((k) => k.id === open);
  return (
    <>
      {load === "loading" ? <KeysLoading />
        : openKey ? <KeyPage k={openKey} viewer={viewer} onBack={() => setOpen(undefined)} onReplace={() => replace(openKey)} onRevoke={() => { setKeyId(openKey.id); setDialog("revoke-key"); }} />
        : <KeyList keys={keys} viewer={viewer} onCreate={() => setDialog("create")} onOpen={setOpen}
            onRotate={(id) => { setKeyId(id); setDialog("rotate"); }} onRevoke={(id) => { setKeyId(id); setDialog("revoke-key"); }} />}
      {dialog === "create" && <CreateKey seed={seed} taken={keys.map((k) => k.name)} onClose={close} onCreate={created} />}
      {(dialog === "reveal" || dialog === "rotated") && <Reveal k={cur ?? NEW_KEY} secret={secret} rotated={dialog === "rotated"} onClose={() => { close(); setSecret(""); }} />}
      {dialog === "rotate" && cur && <Rotate k={cur} onClose={close} onRotate={doRotate} />}
      {dialog === "revoke-key" && cur && <Revoke k={cur} onClose={close} onRevoke={doRevoke} />}
    </>
  );
}

function KeysLoading() {
  return (
    <div className="i-page m-page" aria-busy="true"><div className="i-head"><h2>API keys</h2></div><span className="u-sr" role="status">Loading API keys</span>
      <div className="m-table m-table--skel" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="m-skelrow"><Skeleton w={160} /><Skeleton w={110} /><Skeleton w="30%" /><Skeleton w={70} /></div>)}</div></div>
  );
}

function KeyList({ keys, viewer, onCreate, onOpen, onRotate, onRevoke }: { keys: ApiKey[]; viewer: Viewer; onCreate: () => void; onOpen: (id: string) => void; onRotate: (id: string) => void; onRevoke: (id: string) => void }) {
  const expiring = keys.filter((k) => statusOf(k, NOW) === "expiring");
  const expired = keys.filter((k) => statusOf(k, NOW) === "expired" && k.refused);
  return (
    <div className="i-page m-page">
      <div className="m-head">
        <div className="i-head"><h2>API keys</h2>
          <p>For scripts and tools that can’t sign in: n8n, Zapier, your own code. Keys can draft but can’t send; sending needs a signed-in MCP connection. AI clients like Cursor or Claude should <a className="c-link" href="/app?view=settings&state=mcp">connect through MCP</a> instead; they sign in as a person, and you see what they did.</p>
          <p className="m-role"><Icon name="users" size={12} />{viewer.role === "member" ? "You’re a member: you can make keys, and rotate or revoke the ones you made. The others are read-only; their owner or a workspace owner manages them." : "You’re an owner: you manage every key, whoever made it. Members manage only their own."}</p></div>
        {keys.length > 0 && <Button variant="primary" onClick={onCreate}><Icon name="plus" />Create key</Button>}
      </div>
      {!keys.length ? (
        <div className="m-emptywrap"><EmptyState icon="key" title="No API keys yet" actions={<><Button variant="primary" onClick={onCreate}><Icon name="plus" />Create key</Button><a className="c-btn c-btn--quiet" href="/app?view=settings&state=docs">Read the docs</a></>}>
          <ul className="m-emptylist">
            <li><b>Make a key</b> for something that runs without you: a sync, a report, a script in CI.</li>
            <li><b>Use MCP sign-in</b> for an AI client a person uses. No key to leak, and it acts as that person.</li>
            <li>Keys expire after 90 days unless you choose otherwise, and you see each one’s last call.</li></ul></EmptyState></div>
      ) : <>
        {(expired.length > 0 || expiring.length > 0) && <div className="m-banners">
          {expired.map((k) => <Banner key={k.id} tone="error" title={`${k.name} expired ${dayWords(new Date(k.expires!))} and is still being called.`}
            action={<Button onClick={() => onOpen(k.id)}>See the calls</Button>}>{k.refused!.n} calls refused since, the last at {hhmm(k.refused!.last)} today from {k.refused!.from.split(" · ")[0]}. Make a replacement and paste it there.</Banner>)}
          {expiring.map((k) => <Banner key={k.id} tone="caution" icon="clock" title={`${k.name} ${expiryWords(k.expires, NOW).toLowerCase()}.`}
            action={canManageKey(k, viewer) ? <Button onClick={() => onRotate(k.id)}>Rotate now</Button> : undefined}>{manageNote(k, viewer) && <>{manageNote(k, viewer)} </>}Used {lastUsedWords(k.lastUsed, NOW).toLowerCase()} by {k.lastFrom?.split(" · ")[0]}. Rotate before then and the old secret keeps working for {ROTATE_OVERLAP_HOURS} hours while you swap it.</Banner>)}
        </div>}
        <table className="m-table m-keys">
          <thead><tr><th scope="col">Name</th><th scope="col">Key</th><th scope="col">Owner</th><th scope="col">Can reach</th><th scope="col">Last used</th><th scope="col">Expires</th><th scope="col"><span className="u-sr">Actions</span></th></tr></thead>
          <tbody>{keys.map((k) => {
            const s = statusOf(k, NOW);
            const mine = canManageKey(k, viewer);
            return (
              <tr key={k.id} className={cx(`is-${s}`, k.id === "key_new" && "is-new", !mine && "is-readonly")}>
                <td className="m-keys__name"><button type="button" className="m-rowlink" onClick={() => onOpen(k.id)}>{k.name}</button>
                  <span className="m-keys__sub">{k.env === "test" && <span className="m-env">Test</span>}{dayWords(new Date(k.created))}{!mine && <span className="m-ro"><Icon name="lock" size={10} />Read-only</span>}</span></td>
                <td><span className="c-mono m-keys__key">{masked(k)}</span></td>
                <td className="m-keys__owner">{k.by === viewer.name ? <><b>You</b><span className="c-muted">{k.by}</span></> : <span>{k.by}</span>}</td>
                <td><Scopes scopes={k.scopes} max={3} /></td>
                <td className="m-keys__used"><span>{lastUsedWords(k.lastUsed, NOW)}</span>{k.lastFrom && s !== "expired" && <span className="c-mono">{k.lastFrom.split(" · ")[0]}</span>}
                  {k.refused && <span className="m-keys__bad">{k.refused.n} refused since</span>}</td>
                <td>{s === "active" ? <span className="m-keys__exp">{expiryWords(k.expires, NOW).replace("Expires ", "")}</span>
                  : <Status tone={TONE[s]}>{s === "rotating" ? `Old secret until ${hhmm(k.oldUntil!)} tomorrow` : s === "expiring" ? expiryWords(k.expires, NOW).replace("Expires ", "") : STATUS_WORD[s]}</Status>}</td>
                <td className="m-keys__acts">
                  <DropdownMenu align="end" width={200} label={`${k.name} actions`} trigger={(p) => <button type="button" className="c-iconbtn" aria-label={`${k.name}: more`} {...p}><Icon name="more" /></button>}
                    items={!mine ? [{ label: "Details and last calls", icon: "eye", onSelect: () => onOpen(k.id) }, "separator", { heading: `Only ${k.by.split(" ")[0]} or an owner` }, { label: "Rotate", icon: "refresh", disabled: true }, { label: "Revoke", icon: "x", disabled: true }]
                      : s === "expired" ? [{ label: "See the refused calls", icon: "eye", onSelect: () => onOpen(k.id) }, "separator", { label: "Delete", icon: "x", danger: true, onSelect: () => onRevoke(k.id) }]
                      : [{ label: "Details and last calls", icon: "eye", onSelect: () => onOpen(k.id) }, { label: "Rotate", icon: "refresh", onSelect: () => onRotate(k.id) }, "separator", { label: "Revoke", icon: "x", danger: true, onSelect: () => onRevoke(k.id) }]} />
                </td>
              </tr>
            );
          })}</tbody>
        </table>
        <p className="m-foot c-muted"><Icon name="lock" size={12} />Corral keeps a hash of each key and its last four characters, never the key. {REVOKED_KEYS.length} revoked in the last 30 days: {REVOKED_KEYS.map((r) => `${r.name} (…${r.last4}, ${r.revoked})`).join(", ")}.</p>
      </>}
    </div>
  );
}

/** One key: what it can reach, where it was used from, and its calls. The expired one shows the refused calls. */
function KeyPage({ k, viewer, onBack, onReplace, onRevoke }: { k: ApiKey; viewer: Viewer; onBack: () => void; onReplace: () => void; onRevoke: () => void }) {
  const s = statusOf(k, NOW);
  const bad = s === "expired";
  const note = manageNote(k, viewer);
  return (
    <div className="i-page m-page">
      <button type="button" className="i-back" onClick={onBack}><Icon name="back" size={12} />API keys</button>
      <div className="m-dhead">
        <div><h2>{k.name}</h2><span className="m-dhead__sub"><span className="c-mono">{masked(k)}</span><Status tone={TONE[s]}>{s === "expired" ? `Expired ${dayWords(new Date(k.expires!))}` : STATUS_WORD[s]}</Status></span></div>
        <div className="m-dhead__acts">{note ? <span className="m-role m-role--inline"><Icon name="lock" size={12} />{note}</span>
          : bad ? <Button variant="primary" onClick={onReplace}><Icon name="key" />Make a replacement</Button> : <Button onClick={onRevoke}>Revoke</Button>}</div>
      </div>
      {bad && k.refused && <Banner tone="error" title={`Something still calls with this key: ${k.refused.n} calls refused since it expired.`}>
        The last at {hhmm(k.refused.last)} today, from {k.refused.from}. A replacement gets the same name and scopes and a new secret; paste it into {k.refused.from.split(" · ")[0]} and these stop.</Banner>}
      <dl className="i-facts">
        <div><dt>Can reach</dt><dd><Scopes scopes={k.scopes} max={8} /></dd></div>
        <div><dt>Made</dt><dd>{dayWords(new Date(k.created))} by {k.by}</dd></div>
        <div><dt>Expires</dt><dd>{expiryWords(k.expires, NOW)}</dd></div>
        <div><dt>Last good call</dt><dd>{k.lastUsed ? `${when(k.lastUsed)} from ${k.lastFrom}` : "Never used"}</dd></div>
        <div><dt>Limits</dt><dd>60 calls a minute, 20 of them writes</dd></div>
      </dl>
      <section className="m-sec"><h3 className="m-h3">{bad ? "Refused calls" : "Last calls"}</h3>
        <CallTable calls={bad ? ZAPIER_CALLS : []} empty="No calls in the last 7 days." /></section>
    </div>
  );
}

export function CallTable({ calls, empty, open }: { calls: { at: string; tool: string; args: string; status: number; code?: string; ms: number }[]; empty: string; open?: number }) {
  if (!calls.length) return <p className="c-muted m-none">{empty}</p>;
  return (
    <table className="m-table m-calls">
      <thead><tr><th scope="col">When</th><th scope="col">Tool</th><th scope="col">With</th><th scope="col">Result</th><th scope="col" className="m-num">Took</th></tr></thead>
      <tbody>{calls.map((c, i) => (
        <tr key={i} className={cx(c.status >= 400 && "is-bad", open === i && "is-open")}>
          <td className="c-mono m-calls__at">{c.at}</td><td><span className="c-mono m-calls__tool">{c.tool}</span></td><td className="m-calls__args">{c.args}</td>
          <td>{c.status < 400 ? <Status tone="ok">{c.status}</Status> : <Status tone={c.status === 429 ? "caution" : "bad"}><span className="c-mono">{c.status} {c.code}</span></Status>}</td>
          <td className="m-num c-mono">{c.ms >= 1000 ? `${(c.ms / 1000).toFixed(1)} s` : `${c.ms} ms`}</td>
        </tr>))}</tbody>
    </table>
  );
}

/* ------------------------------------------------------------ dialogs */
function CreateKey({ seed, taken, onClose, onCreate }: { seed: DevSeed; taken: string[]; onClose: () => void; onCreate: (d: Draft) => void }) {
  const init = seed.draft;
  const [d, setD] = useState<Draft>({ name: init?.name ?? "", access: init?.access ?? PRESETS[0].access, expiry: init?.expiry ?? DEFAULT_EXPIRY, env: "live", preset: init ? "custom" : "read" });
  const [tried, setTried] = useState(!!seed.errors);
  const errors = useMemo(() => validateKey(d, taken), [d, taken]);
  const show = tried ? errors : {};
  const pickPreset = (id: string) => { const p = PRESETS.find((x) => x.id === id)!; setD((x) => ({ ...x, preset: id, access: id === "custom" ? x.access : p.access })); };
  const submit = () => { setTried(true); if (isValid(errors)) onCreate(d); };
  const exp = expiresOn(NOW, d.expiry);
  return (
    <Dialog open onClose={onClose} width={600} title="Create API key" description="The secret shows once, after you create it. Give it only the areas the tool needs."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Create key</Button></>}>
      <div className="m-form">
        {tried && !isValid(errors) && <Banner tone="error" title="Two things before this key can exist.">{[errors.name && "a name", errors.scopes && "at least one area"].filter(Boolean).join(" and ")}.</Banner>}
        <FormField label="Name" error={show.name} help="Name it after what uses it. It’s how you’ll know what breaks if you revoke it.">
          <TextInput value={d.name} placeholder="e.g. n8n lead sync" onChange={(e) => setD((x) => ({ ...x, name: e.target.value }))} /></FormField>
        <div className="m-form__row">
          <FormField label="Environment" help={d.env === "live" ? "Reads and changes your real workspace." : "A copy with sample data; sends nothing."}>
            <Segmented label="Environment" options={["Live", "Test"]} value={d.env === "live" ? "Live" : "Test"} onChange={(v) => setD((x) => ({ ...x, env: v === "Live" ? "live" : "test" }))} /></FormField>
          <FormField label="Expires" help={exp ? `On ${dayWords(exp)}. Corral emails you a week before.` : "Never is allowed, not advised: a forgotten key keeps working."}>
            <Select value={d.expiry} onChange={(v) => setD((x) => ({ ...x, expiry: v as ExpiryId }))} options={EXPIRY.map((e) => ({ value: e.id, label: e.label }))} width={160} /></FormField>
        </div>
        <div className="c-field"><div className="c-field__top"><span className="m-label" id="m-scope-l">What it may do</span></div>
          <RadioGroup label="Start from" variant="cards" value={d.preset} onChange={pickPreset} options={PRESETS.map((p) => ({ value: p.id, label: p.label, description: p.hint }))} />
          <AccessPicker holder="key" value={d.access} invalid={!!show.scopes} onChange={(a) => setD((x) => ({ ...x, access: a, preset: "custom" }))} />
          {show.scopes ? <span className="c-field__hint is-error"><Icon name="alert" size={12} />{show.scopes}</span>
            : <span className="c-field__hint">{keyScopesOf(d.access).length} scopes. Keys can draft but can’t send: the Unibox stops at Write. Sending needs a signed-in MCP connection.</span>}
        </div>
      </div>
    </Dialog>
  );
}

function Reveal({ k, secret, rotated, onClose }: { k: ApiKey; secret: string; rotated?: boolean; onClose: () => void }) {
  const until = rotate(NOW).oldUntil;
  return (
    <Dialog open onClose={onClose} width={560} title={rotated ? `New secret for ${k.name}` : `${k.name} is ready`}
      description="Copy it now. This is the only time Corral shows it."
      footer={<Button variant="primary" onClick={onClose}>Done, I’ve stored it</Button>}>
      <div className="m-form">
        <CopyBlock secret label="Secret key" where={k.env === "live" ? "Live" : "Test"} text={secret} what="the key" />
        <p className="m-note"><Icon name="lock" size={12} /><span>Corral keeps a hash and the last four (…{secret.slice(-4)}), so it can check the key and you can recognise it, but can’t show it again. Lose it and you rotate.</span></p>
        {rotated && <Banner tone="caution" icon="clock" title={`The old secret (…${KEYS.find((x) => x.id === k.id)?.last4 ?? "7Qa2"}) works until ${hhmm(until)} tomorrow.`}>Swap it in {k.lastFrom?.split(" · ")[0] ?? "the tool"} before then. After that, calls with the old one get 401.</Banner>}
        <CopyBlock label="As an environment variable" where=".env" text={`CORRAL_API_KEY=${secret}`} what="the line" />
        <dl className="i-facts m-facts--tight">
          <div><dt>Can reach</dt><dd><Scopes scopes={k.scopes} max={6} /></dd></div>
          <div><dt>Expires</dt><dd>{expiryWords(k.expires, NOW)}</dd></div>
        </dl>
      </div>
    </Dialog>
  );
}

function Rotate({ k, onClose, onRotate }: { k: ApiKey; onClose: () => void; onRotate: (overlap: boolean) => void }) {
  const [overlap, setOverlap] = useState("overlap");
  return (
    <Dialog open onClose={onClose} width={520} title={`Rotate ${k.name}?`} description="Corral makes a new secret with the same name, scopes and expiry. You paste it where the old one was."
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => onRotate(overlap === "overlap")}>Rotate key</Button></>}>
      <div className="m-form">
        <RadioGroup label="The old secret" value={overlap} onChange={setOverlap} options={[
          { value: "overlap", label: `Keeps working for ${ROTATE_OVERLAP_HOURS} hours`, description: `Until ${hhmm(rotate(NOW).oldUntil)} tomorrow. Time to swap it in ${k.lastFrom?.split(" · ")[0] ?? "the tool"} without a gap.` },
          { value: "now", label: "Stops now", description: "If it leaked. Anything using it fails until you paste the new one." }]} />
        <p className="m-note"><Icon name="clock" size={12} /><span>Last used {lastUsedWords(k.lastUsed, NOW).toLowerCase()}{k.lastFrom ? ` from ${k.lastFrom}` : ""} · {k.calls7d.toLocaleString("en-GB")} calls this week.</span></p>
      </div>
    </Dialog>
  );
}

function Revoke({ k, onClose, onRevoke }: { k: ApiKey; onClose: () => void; onRevoke: () => void }) {
  const s = statusOf(k, NOW);
  const recent = !!k.lastUsed && NOW.getTime() - new Date(k.lastUsed).getTime() < 86_400_000 && s !== "expired";
  return (
    <Dialog open onClose={onClose} width={500} tone="danger" title={s === "expired" ? `Delete ${k.name}?` : `Revoke ${k.name}?`}
      description={s === "expired" ? "It already doesn’t work. Deleting removes it from this list." : "It stops at once, everywhere. There’s no undo; you’d make a new key."}
      footer={<><Button variant="quiet" onClick={onClose}>Cancel</Button><Button variant="primary" className="i-btn-danger" onClick={onRevoke}>{s === "expired" ? "Delete key" : "Revoke key"}</Button></>}>
      <div className="m-form">
        {recent && <Banner tone="caution" title={`In use: last call ${lastUsedWords(k.lastUsed, NOW)} from ${k.lastFrom?.split(" · ")[0]}.`}>{k.calls7d.toLocaleString("en-GB")} calls this week. Its next call gets 401 and whatever it does stops. If you’re replacing it, rotate instead.</Banner>}
        <ul className="m-list">
          <li className="is-no"><Icon name="x" size={12} />Calls with <span className="c-mono">{masked(k)}</span> get <span className="c-mono">401 invalid_token</span></li>
          <li><Icon name="check" size={12} />What it already did stays: leads it changed, segments it made, its calls in the log</li>
        </ul>
      </div>
    </Dialog>
  );
}
