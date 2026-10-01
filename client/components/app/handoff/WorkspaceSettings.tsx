"use client";
/**
 * Settings → Workspace. Name, URL, time zone, team size and logo, stored on the workspace API.
 * Without a signed-in session (the styleguide) it shows the sample workspace and does not save.
 */
import { useEffect, useRef, useState } from "react";
import { useAppData } from "@/components/session/AppData";
import { useSession } from "@/components/session/SessionProvider";
import { workspaceApiFor, LOGO_MAX_BYTES, type Workspace } from "@/lib/api";
import { FormField, Select, TextInput } from "../Form";
import { Icon } from "../icons";
import { Button } from "../primitives";
import { WorkspaceTile } from "../Shell";
import { ErrorState, Skeleton } from "../States";
import { useToast } from "../Toaster";

const ZONES = [
  { value: "nbo", label: "Nairobi", meta: "UTC+3" },
  { value: "lag", label: "Lagos", meta: "UTC+1" },
  { value: "jnb", label: "Johannesburg", meta: "UTC+2" },
  { value: "lon", label: "London", meta: "UTC+1" },
  { value: "nyc", label: "New York", meta: "UTC−4" },
];
const TEAMS = [
  { value: "solo", label: "Just me" },
  { value: "small", label: "A small team" },
  { value: "sales", label: "A sales team" },
];
const LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function WorkspaceSettings() {
  const data = useAppData();
  const session = useSession();
  const toast = useToast();
  const live = !!data;
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(live ? "loading" : "ready");
  const [detail, setDetail] = useState<string | undefined>();
  const [name, setName] = useState("ColdTrace");
  const [slug, setSlug] = useState("coldtrace");
  const [tz, setTz] = useState("nbo");
  const [team, setTeam] = useState("small");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | undefined>();
  const [slugErr, setSlugErr] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  function fill(w: Workspace) {
    setName(w.name);
    setSlug(w.slug);
    setTz(ZONES.some((z) => z.value === w.timezone) ? w.timezone! : "nbo");
    setTeam(w.teamSize ?? "small");
    setLogoUrl(w.logoUrl);
  }

  useEffect(() => {
    if (!live) return;
    const c = new AbortController();
    void workspaceApiFor(session?.config).get(c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (!r.ok) { setDetail(r.error.message); setPhase("error"); return; }
      fill(r.value);
      setPhase("ready");
    });
    return () => c.abort();
  }, [live, session?.config, attempt]);

  async function save() {
    if (!live) { toast({ children: "This is the sample workspace" }); return; }
    const trimmed = name.trim();
    if (!trimmed) { setNameErr("Give the workspace a name."); return; }
    if (!SLUG.test(slug)) { setSlugErr("Use lowercase letters, numbers and hyphens."); return; }
    setNameErr(undefined);
    setSlugErr(undefined);
    setSaving(true);
    const r = await workspaceApiFor(session?.config).update({ name: trimmed, slug, timezone: tz, team_size: team });
    setSaving(false);
    if (!r.ok) {
      if (r.error.kind === "http" && r.error.code === "slug_taken") setSlugErr("That workspace URL is taken.");
      else toast({ tone: "error", children: r.error.message });
      return;
    }
    fill(r.value);
    await session?.reload();
    toast({ tone: "success", children: "Workspace saved" });
  }

  async function onLogo(picked: File) {
    if (!live) { toast({ children: "This is the sample workspace" }); return; }
    if (picked.size > LOGO_MAX_BYTES) { toast({ tone: "error", children: "Logos can be up to 2 MB." }); return; }
    if (picked.type && !LOGO_TYPES.includes(picked.type)) { toast({ tone: "error", children: "Use a PNG, JPEG, GIF or WebP." }); return; }
    const r = await workspaceApiFor(session?.config).uploadLogo(picked);
    if (!r.ok) { toast({ tone: "error", children: r.error.message }); return; }
    setLogoUrl(r.value.logoUrl);
    await session?.reload();
    toast({ tone: "success", children: "Logo updated" });
  }

  if (phase === "loading") return (
    <div className="i-page" aria-busy="true">
      <div className="i-head"><h2>Workspace</h2></div>
      <span className="u-sr" role="status">Loading workspace</span>
      <Skeleton w={240} h={18} /><Skeleton w={360} h={32} />
    </div>
  );
  if (phase === "error") return (
    <div className="i-page i-page--center">
      <ErrorState title="Couldn’t load this workspace" detail={detail}
        actions={<Button variant="primary" onClick={() => { setPhase("loading"); setAttempt((n) => n + 1); }}><Icon name="refresh" />Try again</Button>}>
        Your name, URL and logo are unchanged.
      </ErrorState>
    </div>
  );

  return (
    <div className="i-page">
      <div className="i-head">
        <h2>Workspace</h2>
        <p>The name and mark people see in the sidebar, and the address of this workspace.</p>
      </div>
      <div className="i-ws">
        <div className="i-ws__logo">
          {logoUrl
            ? <img className="i-ws__mark" src={logoUrl} alt="" width={40} height={40} /> /* eslint-disable-line @next/next/no-img-element -- logo host is the configured R2 domain */
            : <WorkspaceTile letter={(name.trim()[0] || "C").toUpperCase()} size={40} />}
          <button type="button" className="c-btn" onClick={() => file.current?.click()}><Icon name="upload" />{logoUrl ? "Replace logo" : "Upload logo"}</button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden aria-label="Company logo file" onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (picked) void onLogo(picked);
          }} />
        </div>
        <FormField label="Workspace name" error={nameErr}>
          <TextInput value={name} onChange={(e) => { setName(e.target.value); setNameErr(undefined); }} maxLength={255} autoComplete="organization" />
        </FormField>
        <FormField label="Workspace URL" help="Lowercase letters, numbers and hyphens." error={slugErr}>
          <TextInput prefix="corral.app/" value={slug} onChange={(e) => { setSlug(e.target.value.trim().toLowerCase()); setSlugErr(undefined); }} maxLength={120} autoComplete="off" spellCheck={false} />
        </FormField>
        <FormField label="Time zone">
          <Select value={tz} onChange={setTz} icon="globe" options={ZONES} />
        </FormField>
        <FormField label="Who uses Corral">
          <Select value={team} onChange={setTeam} options={TEAMS} />
        </FormField>
        <div className="i-ws__acts">
          <Button variant="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}
