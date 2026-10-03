"use client";
/* Settings → Team (M13, gap 3; M14: Krak's shapes). Who is in the workspace and their role, invites still pending,
   one Invite button, and the state where you're alone. Members are {id, name, email, role}; "You" and your avatar
   come from the session; invites come from the workspace. Role change and remove aren't in the API, so there's
   no row menu at all (hidden, not disabled): the role reads as plain text. */
import { useState } from "react";
import { UserPlus, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { Button, Monogram, cx } from "../primitives";
import { Dialog } from "../Overlays";
import { FormField, RadioGroup, Textarea } from "../Form";
import { EmptyState, Skeleton } from "../States";
import { useToast } from "../Toaster";
import { agoLabel } from "@/lib/time";
import { ROLE_HINT, ROLE_WORD, isSolo, parseInvites, roleWord, teamRows, type Member, type TeamRole, type TeamRow, type TeamSession, type WorkspaceInvite } from "./team";

export const TEAM_COPY = {
  title: "Team", line: "Who can work in this workspace.", invite: "Invite",
  soloTitle: "Just you so far", soloLine: "Invite people to share the Unibox and sequences.",
  invited: "Invited", you: "You",
  dialogTitle: "Invite people", dialogLine: "They get an email with a sign-in code.", emails: "Emails", emailsHelp: "Separate addresses with commas.", send: "Send invites",
} as const;

function Face({ r }: { r: TeamRow }) {
  // eslint-disable-next-line @next/next/no-img-element -- WorkOS profile pictures are remote and small; no next/image loader configured for them
  if (r.avatarUrl) return <img className="c-av c-av--28" src={r.avatarUrl} alt="" width={28} height={28} />;
  return <Monogram name={r.name} email={r.email} size={28} />;
}

export type TeamViewProps = {
  members: Member[]; invites: WorkspaceInvite[]; session?: TeamSession;
  load?: "loading"; now: Date; defaultInvite?: boolean;
  /** POST the invites to the workspace (Krak). Without it, review builds add them locally. */
  onInvite?: (emails: string[], role: TeamRole) => Promise<void> | void;
};

export function TeamView({ members, invites: initialInvites, session, load, now, defaultInvite, onInvite }: TeamViewProps) {
  const toast = useToast();
  const [invites, setInvites] = useState(initialInvites);
  const [invite, setInvite] = useState(!!defaultInvite);
  const rows = teamRows(members, invites, session);
  const solo = isSolo(rows);

  if (load === "loading") return (
    <div className="i-page t-page" aria-busy="true">
      <div className="t-head"><div className="i-head"><h2>{TEAM_COPY.title}</h2></div></div>
      <span className="u-sr" role="status">Loading the team</span>
      <ul className="t-list" aria-hidden="true">{[148, 120, 164].map((w) => (
        <li key={w} className="t-row"><Skeleton w={28} h={28} r={14} /><span className="t-who"><Skeleton w={w} /><Skeleton w={w + 30} h={8} /></span><Skeleton w={56} h={12} /></li>))}</ul>
    </div>
  );

  const send = async (emails: string[], role: TeamRole) => {
    try { await onInvite?.(emails, role); } catch { toast({ tone: "error", children: "Couldn’t save the invites. Try again." }); return; }
    const at = now.toISOString();
    setInvites((l) => [...emails.map((email) => ({ email, role, invitedAt: at })), ...l]);
    setInvite(false); toast({ tone: "success", children: emails.length === 1 ? `Invite sent to ${emails[0]}` : `${emails.length} invites sent` });
  };

  return (
    <div className="i-page t-page">
      <div className="t-head">
        <div className="i-head"><h2>{TEAM_COPY.title}</h2><p>{TEAM_COPY.line}</p></div>
        {!solo && <Button variant="primary" onClick={() => setInvite(true)}><UserPlus size={14} />{TEAM_COPY.invite}</Button>}
      </div>
      <ul className="t-list" aria-label="Members">
        {rows.map((r) => (
          <li key={r.key} className={cx("t-row", r.kind === "invite" && "is-invited")}>
            <Face r={r} />
            <span className="t-who">
              <span className="t-name">{r.name || r.email}{r.you && <span className="t-you">{TEAM_COPY.you}</span>}</span>
              {r.kind === "invite" ? (r.invitedAt && <span className="t-mail">{`Invited ${agoLabel(new Date(r.invitedAt), now)}`}</span>)
                : r.name && <span className="t-mail">{r.email}</span>}
            </span>
            {r.kind === "invite" && <span className="d-runtag is-neutral t-tag"><span className="c-sdot c-sdot--hollow" aria-hidden="true" />{TEAM_COPY.invited}</span>}
            {r.role && <span className="t-role">{roleWord(r.role)}</span>}
          </li>
        ))}
      </ul>
      {solo && <div className="t-solo"><EmptyState id="team-solo" glyph={UsersThree} mark="line" compact title={TEAM_COPY.soloTitle}
        actions={<Button variant="primary" onClick={() => setInvite(true)}><UserPlus size={14} />{TEAM_COPY.invite}</Button>}>{TEAM_COPY.soloLine}</EmptyState></div>}
      {invite && <InviteDialog taken={rows.map((r) => r.email)} onClose={() => setInvite(false)} onSend={send} />}
    </div>
  );
}

function InviteDialog({ taken, onClose, onSend }: { taken: string[]; onClose: () => void; onSend: (emails: string[], role: TeamRole) => void }) {
  const [text, setText] = useState("");
  const [role, setRole] = useState<TeamRole>("member");
  const [tried, setTried] = useState(false);
  const p = parseInvites(text, taken);
  const error = !tried ? undefined : !p.ok.length && !p.bad.length ? "Add at least one email." : p.bad.length ? `Check ${p.bad.join(", ")}.` : p.dupes.length && !p.ok.length ? `${p.dupes.join(", ")} is already here.` : undefined;
  return (
    <Dialog open onClose={onClose} width={480} title={TEAM_COPY.dialogTitle} description={TEAM_COPY.dialogLine}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { setTried(true); if (p.ok.length && !p.bad.length) onSend(p.ok, role); }}>{TEAM_COPY.send}</Button></>}>
      <FormField label={TEAM_COPY.emails} help={TEAM_COPY.emailsHelp} error={error}>
        <Textarea rows={3} value={text} placeholder="name@company.com" onChange={(e) => setText(e.target.value)} invalid={!!error} />
      </FormField>
      <RadioGroup label="Role" value={role} onChange={(v) => setRole(v as TeamRole)} options={(["member", "admin"] as TeamRole[]).map((r) => ({ value: r, label: ROLE_WORD[r], description: ROLE_HINT[r] }))} />
    </Dialog>
  );
}
