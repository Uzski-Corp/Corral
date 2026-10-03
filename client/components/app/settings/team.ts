/* Settings → Team (M13, gap 3; M14: Krak's API shapes). Plain module: no React.
   The members API gives only {id, name, email, role}. Which row is you, and your avatar, come from the session;
   pending invites live on the workspace. Changing a role or removing someone isn't in the API yet, so the page
   doesn't offer it (M14 ruling: hidden, not disabled). */
export type TeamRole = "owner" | "admin" | "member";
/** GET members: exactly what the API returns. `role` may be a role this build doesn't know yet. */
export type Member = { id: string; name: string; email: string; role: TeamRole | (string & {}) };
/** On the workspace: an invite nobody has accepted yet. Only `email` is certain; the rest shows when present. */
export type WorkspaceInvite = { email: string; role?: Member["role"]; invitedAt?: string };
/** The signed-in person, from the session (WorkOS). */
export type TeamSession = { userId: string; email: string; avatarUrl?: string | null };

/** One row on the page: a member, or a pending invite. */
export type TeamRow = {
  key: string; kind: "member" | "invite";
  name: string; email: string; role?: Member["role"];
  you: boolean; avatarUrl?: string | null; invitedAt?: string;
};

/** Signed in: where Invite saves. Invites are stored on the workspace as pending; no email is sent yet. */
export type TeamApi = { invite(emails: string[], role: TeamRole): Promise<boolean> };

export const ROLE_WORD: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };
export const ROLE_HINT: Record<TeamRole, string> = {
  owner: "Everything, including billing and removing people.",
  admin: "Everything except billing.",
  member: "Works leads, sequences and the Unibox.",
};
/** "Owner", or an unknown role as the API spells it, capitalised. */
export const roleWord = (r?: string) => (!r ? "" : r in ROLE_WORD ? ROLE_WORD[r as TeamRole] : r.charAt(0).toUpperCase() + r.slice(1));

const isYou = (m: Member, s?: TeamSession) => !!s && (m.id === s.userId || m.email.toLowerCase() === s.email.toLowerCase());
/** You first, then everyone else by name, then invites (newest first). An invite for someone already a member is dropped. */
export function teamRows(members: Member[], invites: WorkspaceInvite[], session?: TeamSession): TeamRow[] {
  const you = members.filter((m) => isYou(m, session));
  const rest = members.filter((m) => !isYou(m, session)).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  const taken = new Set(members.map((m) => m.email.toLowerCase()));
  const pending = invites.filter((i) => !taken.has(i.email.toLowerCase())).sort((a, b) => (b.invitedAt ?? "").localeCompare(a.invitedAt ?? ""));
  return [
    ...[...you, ...rest].map((m): TeamRow => {
      const y = isYou(m, session);
      return { key: m.id, kind: "member", name: m.name, email: m.email, role: m.role, you: y, avatarUrl: y ? session?.avatarUrl : undefined };
    }),
    ...pending.map((i): TeamRow => ({ key: `invite:${i.email.toLowerCase()}`, kind: "invite", name: "", email: i.email, role: i.role, you: false, invitedAt: i.invitedAt })),
  ];
}
/** Just you: one member (you), nobody invited. */
export const isSolo = (rows: TeamRow[]) => rows.length === 1 && rows[0].you;

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/** Splits a pasted list ("a@x.com, b@y.com") into addresses, and the ones that aren't. */
export function parseInvites(text: string, taken: readonly string[]): { ok: string[]; bad: string[]; dupes: string[] } {
  const all = text.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const uniq = [...new Set(all)];
  const lower = taken.map((t) => t.toLowerCase());
  return { ok: uniq.filter((x) => EMAIL.test(x) && !lower.includes(x)), bad: uniq.filter((x) => !EMAIL.test(x)), dupes: uniq.filter((x) => EMAIL.test(x) && lower.includes(x)) };
}
