"use client";
/* Settings → Team (M13, gap 3): who is in the workspace, their role, invites still pending, a row menu each,
   one Invite button, and the state where the owner is alone. Real people only: the list comes from `members`
   (the API); review states pass an owner built from the signed-in session and placeholder addresses. */
import { useState } from "react";
import { DotsThree, UserPlus, UsersThree } from "@phosphor-icons/react/dist/ssr";
import { Button, Monogram, cx } from "../primitives";
import { Dialog, DropdownMenu } from "../Overlays";
import { FormField, RadioGroup, Textarea } from "../Form";
import { EmptyState, Skeleton } from "../States";
import { useToast } from "../Toaster";
import { agoLabel } from "@/lib/time";
import { ROLE_HINT, ROLE_WORD, parseInvites, soleOwner, type TeamApi, type TeamMember, type TeamRole } from "./team";

export const TEAM_COPY = {
  title: "Team", line: "Who can work in this workspace.", invite: "Invite",
  soloTitle: "Just you so far", soloLine: "Invite people to share the Unibox and sequences.",
  invited: "Invited", you: "You",
  dialogTitle: "Invite people", dialogLine: "They get an email with a sign-in code.", emails: "Emails", emailsHelp: "Separate addresses with commas.", send: "Send invites",
} as const;

function Face({ m }: { m: TeamMember }) {
  // eslint-disable-next-line @next/next/no-img-element -- WorkOS profile pictures are remote and small; no next/image loader configured for them
  if (m.avatarUrl) return <img className="c-av c-av--28" src={m.avatarUrl} alt="" width={28} height={28} />;
  return <Monogram name={m.name ?? ""} email={m.email} size={28} />;
}

export function TeamView({ members: initial, load, now, defaultInvite, live }: { members: TeamMember[]; load?: "loading"; now: Date; defaultInvite?: boolean;
  /** Signed in: where invites go. Role changes and removal need an API that doesn't exist yet, so they're unavailable. */
  live?: TeamApi }) {
  const toast = useToast();
  const [members, setMembers] = useState(initial);
  const [invite, setInvite] = useState(!!defaultInvite);
  const solo = members.length === 1 && members[0].you;

  if (load === "loading") return (
    <div className="i-page t-page" aria-busy="true">
      <div className="t-head"><div className="i-head"><h2>{TEAM_COPY.title}</h2></div></div>
      <span className="u-sr" role="status">Loading the team</span>
      <ul className="t-list" aria-hidden="true">{[148, 120, 164].map((w) => (
        <li key={w} className="t-row"><Skeleton w={28} h={28} r={14} /><span className="t-who"><Skeleton w={w} /><Skeleton w={w + 30} h={8} /></span><Skeleton w={64} h={22} r={6} /><Skeleton w={24} h={24} r={6} /></li>))}</ul>
    </div>
  );

  const setRole = (m: TeamMember, role: TeamRole) => { setMembers((l) => l.map((x) => (x.id === m.id ? { ...x, role } : x))); toast({ children: `${m.name ?? m.email} is now ${ROLE_WORD[role].toLowerCase()}` }); };
  const remove = async (m: TeamMember) => {
    if (live) {
      if (!(await live.cancel(m.email))) { toast({ tone: "error", children: `Couldn’t cancel the invite to ${m.email}` }); return; }
      setMembers((l) => l.filter((x) => x.id !== m.id)); toast({ children: `Invite to ${m.email} cancelled` }); return;
    }
    const before = members; setMembers((l) => l.filter((x) => x.id !== m.id));
    toast({ children: m.status === "invited" ? `Invite to ${m.email} cancelled` : `Removed ${m.name ?? m.email}`, action: { label: "Undo", onClick: () => setMembers(before) } });
  };
  const send = async (emails: string[], role: TeamRole) => {
    if (live && !(await live.invite(emails, role))) { toast({ tone: "error", children: "Couldn’t save the invites. Try again." }); return; }
    const at = now.toISOString();
    setMembers((l) => [...l, ...emails.map((e, i): TeamMember => ({ id: `inv-${l.length + i}`, name: null, email: e, role, status: "invited", invitedAt: at }))]);
    setInvite(false); toast({ tone: "success", children: emails.length === 1 ? `Invite sent to ${emails[0]}` : `${emails.length} invites sent` });
  };

  return (
    <div className="i-page t-page">
      <div className="t-head">
        <div className="i-head"><h2>{TEAM_COPY.title}</h2><p>{TEAM_COPY.line}</p></div>
        {!solo && <Button variant="primary" onClick={() => setInvite(true)}><UserPlus size={14} />{TEAM_COPY.invite}</Button>}
      </div>
      <ul className="t-list" aria-label="Members">
        {members.map((m) => {
          const only = soleOwner(members, m);
          return (
            <li key={m.id} className={cx("t-row", m.status === "invited" && "is-invited")}>
              <Face m={m} />
              <span className="t-who">
                <span className="t-name">{m.name ?? m.email}{m.you && <span className="t-you">{TEAM_COPY.you}</span>}</span>
                {m.status === "invited" ? <span className="t-mail">{`Invited ${m.invitedAt ? agoLabel(new Date(m.invitedAt), now) : ""}`.trim()}</span>
                  : m.name && <span className="t-mail">{m.email}</span>}
              </span>
              {m.status === "invited" && <span className="d-runtag is-neutral t-tag"><span className="c-sdot c-sdot--hollow" aria-hidden="true" />{TEAM_COPY.invited}</span>}
              <span className="t-role">{ROLE_WORD[m.role]}</span>
              <DropdownMenu align="end" width={232} label={`${m.name ?? m.email} options`} items={[
                { heading: "Role" },
                ...(["owner", "admin", "member"] as TeamRole[]).map((r) => ({ label: ROLE_WORD[r], checked: m.role === r, disabled: (only && r !== "owner") || (!!live && m.role !== r), onSelect: () => m.role !== r && setRole(m, r) })),
                "separator" as const,
                ...(m.status === "invited" ? [{ label: "Resend invite", onSelect: () => toast({ children: `Invite sent again to ${m.email}` }) }] : []),
                { label: m.status === "invited" ? "Cancel invite" : m.you ? "Leave workspace" : "Remove", danger: true, disabled: only || (!!live && m.status !== "invited"), onSelect: () => void remove(m) },
              ]} trigger={(tp) => <button type="button" className="c-iconbtn" aria-label={`${m.name ?? m.email} options`} {...tp}><DotsThree size={16} weight="bold" /></button>} />
            </li>
          );
        })}
      </ul>
      {solo && <div className="t-solo"><EmptyState id="team-solo" glyph={UsersThree} mark="line" compact title={TEAM_COPY.soloTitle}
        actions={<Button variant="primary" onClick={() => setInvite(true)}><UserPlus size={14} />{TEAM_COPY.invite}</Button>}>{TEAM_COPY.soloLine}</EmptyState></div>}
      {invite && <InviteDialog taken={members.map((m) => m.email)} onClose={() => setInvite(false)} onSend={(e, r) => void send(e, r)} />}
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
