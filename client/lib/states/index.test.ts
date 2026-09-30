import { describe, expect, it } from "vitest";
import { ROUTE_STATES, SURFACES, allStates, countsOf, gaps, hrefOf, kindOf } from "./index";
import { CONTACTS_REVIEW_STATES } from "@/lib/contacts/state";
import { MCP_REVIEW_STATES } from "@/lib/mcp/state";

describe("every state, indexed", () => {
  it("every surface has empty, loading and error, or says why not", () => {
    for (const s of SURFACES) expect({ surface: s.id, gaps: gaps(s) }).toEqual({ surface: s.id, gaps: [] });
  });
  it("overrides only name states the surface has", () => {
    for (const s of SURFACES) for (const k of Object.keys(s.kinds ?? {})) expect(s.states, `${s.id}:${k}`).toContain(k);
  });
  it("a reason is only given for a kind the surface really lacks", () => {
    for (const s of SURFACES) for (const k of Object.keys(s.na ?? {})) expect(s.states.some((st) => kindOf(st, s) === k), `${s.id}:${k}`).toBe(false);
  });
  it("indexes the M10 states: contacts and the owner/member key views", () => {
    const all = allStates();
    for (const st of CONTACTS_REVIEW_STATES) expect(all).toContainEqual(expect.objectContaining({ surface: "contacts", state: st }));
    for (const st of ["keys-loading", "keys-owner", "keys-member", "keys-member-key"]) expect(MCP_REVIEW_STATES).toContain(st);
    expect(all.find((x) => x.state === "keys-loading")?.kind).toBe("loading");
    expect(all.filter((x) => x.surface === "developers")).toHaveLength(MCP_REVIEW_STATES.length);
  });
  it("indexes the M10b KB source failures as partial moments", () => {
    const kb = allStates().filter((x) => x.surface === "knowledge");
    for (const st of ["unreadable", "partial", "interrupted"]) expect(kb.find((x) => x.state === st)?.kind, st).toBe("partial");
    expect(kb.find((x) => x.state === "interrupted")?.href).toBe("/app?view=knowledge&state=interrupted");
  });
  it("names map to kinds", () => {
    expect(kindOf("mcp-empty")).toBe("empty");
    expect(kindOf("builder-error")).toBe("error");
    expect(kindOf("import-running")).toBe("progress");
    expect(kindOf("detail")).toBe("view");
  });
  it("links load the state on its view", () => {
    expect(hrefOf(SURFACES.find((s) => s.id === "shell")!, "api-down")).toBe("/app?state=api-down");
    expect(hrefOf(SURFACES.find((s) => s.id === "contacts")!, "empty")).toBe("/app?view=contacts&state=empty");
  });
  it("lists the route-level states", () => {
    expect(ROUTE_STATES.map((r) => r.file)).toEqual(["app/app/loading.tsx", "app/app/error.tsx", "app/error.tsx", "app/global-error.tsx", "app/not-found.tsx"]);
  });
  it("counts states by kind", () => {
    const c = countsOf(SURFACES.find((s) => s.id === "contacts")!);
    expect(c).toMatchObject({ empty: 1, loading: 1, error: 1, partial: 0, progress: 0, view: 0 });
  });
});
