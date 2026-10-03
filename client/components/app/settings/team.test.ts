import { describe, expect, it } from "vitest";
import { isSolo, roleWord, teamRows, type Member } from "./team";

const me: Member = { id: "u1", name: "Owner Person", email: "owner@example.com", role: "owner" };
const other: Member = { id: "u2", name: "Teammate", email: "teammate@example.com", role: "member" };

describe("M14 team rows from Krak's shapes", () => {
  it("marks you from the session, takes your avatar from it, and puts you first", () => {
    const rows = teamRows([other, me], [], { userId: "u1", email: "owner@example.com", avatarUrl: "https://x/a.png" });
    expect(rows.map((r) => [r.email, r.you])).toEqual([["owner@example.com", true], ["teammate@example.com", false]]);
    expect(rows[0].avatarUrl).toBe("https://x/a.png");
    expect(rows[1].avatarUrl).toBeUndefined();
  });
  it("adds the workspace's pending invites after members, dropping ones already in", () => {
    const rows = teamRows([me, other], [{ email: "TEAMMATE@example.com" }, { email: "new@example.com", invitedAt: "2026-10-01T09:00:00Z" }], { userId: "u1", email: "owner@example.com" });
    expect(rows.map((r) => [r.kind, r.email])).toEqual([["member", "owner@example.com"], ["member", "teammate@example.com"], ["invite", "new@example.com"]]);
  });
  it("knows the solo state, and words an unknown role", () => {
    expect(isSolo(teamRows([me], [], { userId: "u1", email: "owner@example.com" }))).toBe(true);
    expect(isSolo(teamRows([me], [{ email: "a@example.com" }], { userId: "u1", email: "owner@example.com" }))).toBe(false);
    expect(roleWord("admin")).toBe("Admin");
    expect(roleWord("billing")).toBe("Billing");
  });
});
