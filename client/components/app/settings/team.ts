/* Settings → Team (M13, gap 3): the shape the member list reads. Plain module: no React. */
export type TeamRole = "owner" | "admin" | "member";
export type TeamMember = {
  id: string;
  /** Null for an invite nobody has accepted yet: the row shows the email instead. */
  name: string | null;
  email: string;
  role: TeamRole;
  status: "active" | "invited";
  avatarUrl?: string | null;
  /** ISO time the invite went out (invited rows). */
  invitedAt?: string;
  /** The signed-in person's own row. */
  you?: boolean;
};
/** What signed-in Team reads and writes. The API has no role change, removal or invite email yet:
 *  invites are stored on the workspace as pending (the same list onboarding writes). */
export type TeamApi = {
  invite(emails: string[], role: TeamRole): Promise<boolean>;
  cancel(email: string): Promise<boolean>;
};
type ApiMember = { id: string; name: string; email: string; role: string };
type ApiInvite = { email: string; role: string };
const roleOf = (r: string): TeamRole => (r === "owner" || r === "admin" ? r : "member");
/** GET /workspace/members plus the workspace's pending invites, as Team rows. The API sends the email as the
 *  name when none is set, has no avatar (only the session has yours) and no invite time. */
export function teamFromApi(members: ApiMember[], invites: ApiInvite[], me: { id: string; avatarUrl?: string | null }): TeamMember[] {
  const active = members.map((m): TeamMember => ({
    id: m.id, name: m.name && m.name !== m.email ? m.name : null, email: m.email, role: roleOf(m.role), status: "active",
    ...(m.id === me.id ? { you: true, avatarUrl: me.avatarUrl ?? null } : {}),
  }));
  const here = new Set(active.map((m) => m.email.toLowerCase()));
  const pending = invites.filter((i) => !here.has(i.email.toLowerCase()))
    .map((i): TeamMember => ({ id: `invite:${i.email}`, name: null, email: i.email, role: roleOf(i.role), status: "invited" }));
  return [...active, ...pending];
}
export const ROLE_WORD: Record<TeamRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };
export const ROLE_HINT: Record<TeamRole, string> = {
  owner: "Everything, including billing and removing people.",
  admin: "Everything except billing.",
  member: "Works leads, sequences and the Unibox.",
};
/** The only owner can't leave or be demoted until someone else is an owner. */
export const soleOwner = (list: TeamMember[], m: TeamMember) => m.role === "owner" && list.filter((x) => x.role === "owner" && x.status === "active").length === 1;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
/** Splits a pasted list ("a@x.com, b@y.com") into addresses, and the ones that aren't. */
export function parseInvites(text: string, taken: readonly string[]): { ok: string[]; bad: string[]; dupes: string[] } {
  const all = text.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const uniq = [...new Set(all)];
  const lower = taken.map((t) => t.toLowerCase());
  return { ok: uniq.filter((x) => EMAIL.test(x) && !lower.includes(x)), bad: uniq.filter((x) => !EMAIL.test(x)), dupes: uniq.filter((x) => EMAIL.test(x) && lower.includes(x)) };
}
