import { describe, expect, it } from "vitest";
import { AREAS, PRESETS, scopesOf } from "./keys";
import { CLIENTS, ERRORS, MCP_URL, TOOLS, byArea, callBody, client, configFor, curlFor, cursorDeeplink, errorFor, searchTools, stepsFor, tool, toolsFor } from "./tools";

describe("the tools", () => {
  it("covers every area, names are unique snake_case, each scope matches its kind", () => {
    expect(new Set(TOOLS.map((t) => t.area))).toEqual(new Set(AREAS.map((a) => a.id)));
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(t.scope).toBe(`${t.area}:${t.kind === "send" ? "send" : t.kind}`);
      for (const a of t.args.filter((x) => x.required)) expect(t.example.args).toHaveProperty(a.name);
    }
  });
  it("only send_reply sends, and it says what it goes through", () => {
    expect(TOOLS.filter((t) => t.kind === "send").map((t) => t.name)).toEqual(["send_reply"]);
    expect(tool("send_reply")!.guard).toMatch(/10-second undo/);
    expect(tool("nope")).toBeUndefined();
  });
  it("a client sees only the tools its scopes allow", () => {
    const read = toolsFor(scopesOf(PRESETS[0].access));
    expect(read.every((t) => t.kind === "read")).toBe(true);
    expect(toolsFor(scopesOf(PRESETS[1].access)).map((t) => t.name)).toContain("draft_reply");
    expect(toolsFor(scopesOf(PRESETS[1].access)).map((t) => t.name)).not.toContain("send_reply");
    expect(toolsFor([])).toEqual([]);
  });
  it("groups by area in order and searches names, words and areas", () => {
    expect(byArea().map((g) => g.area)).toEqual(["leads", "segments", "sequences", "unibox", "knowledge", "scoring"]);
    expect(byArea([tool("send_reply")!])).toHaveLength(1);
    expect(searchTools("send reply").map((t) => t.name)).toEqual(["send_reply"]);
    expect(searchTools("knowledge base").length).toBeGreaterThan(1);
    expect(searchTools("invoice")).toEqual([]);
    expect(searchTools("  ")).toHaveLength(TOOLS.length);
  });
  it("writes the JSON-RPC call and the curl for a tool", () => {
    const b = JSON.parse(callBody(tool("get_company")!, 7));
    expect(b).toEqual({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_company", arguments: { id: "pwanifresh.com" } } });
    const c = curlFor(tool("get_company")!);
    expect(c).toContain(`curl ${MCP_URL}`); expect(c).toContain("Bearer $CORRAL_API_KEY"); expect(c).toContain("text/event-stream");
  });
  it("names each error with what to do", () => {
    expect(ERRORS.map((e) => e.status)).toEqual([401, 403, 409, 422, 429]);
    expect(errorFor("thread_changed")!.fix).toMatch(/redraft/);
    expect(errorFor("nope")).toBeUndefined();
  });
});

describe("clients", () => {
  it("Cursor and Other are mcpServers JSON; a key goes in a Bearer header", () => {
    expect(JSON.parse(configFor("cursor", "oauth"))).toEqual({ mcpServers: { corral: { url: MCP_URL } } });
    expect(JSON.parse(configFor("cursor", "key", "k")).mcpServers.corral.headers).toEqual({ Authorization: "Bearer k" });
    expect(JSON.parse(configFor("other", "key")).mcpServers.corral.type).toBe("http");
  });
  it("VS Code uses servers with type http, and prompts for a key instead of writing it", () => {
    expect(JSON.parse(configFor("vscode", "oauth"))).toEqual({ servers: { corral: { type: "http", url: MCP_URL } } });
    const k = JSON.parse(configFor("vscode", "key", "secret"));
    expect(k.inputs[0]).toMatchObject({ id: "corral-key", password: true });
    expect(k.servers.corral.headers.Authorization).toBe("Bearer ${input:corral-key}");
    expect(configFor("vscode", "key", "secret")).not.toContain("secret\"");
  });
  it("Claude Code is one command; Claude is a connector URL", () => {
    expect(configFor("claude-code", "oauth")).toBe(`claude mcp add --transport http corral ${MCP_URL}`);
    expect(configFor("claude-code", "key", "k")).toContain('--header "Authorization: Bearer k"');
    expect(configFor("claude", "oauth")).toContain(`Remote MCP server URL: ${MCP_URL}`);
  });
  it("has steps for each, and a Cursor install link", () => {
    for (const c of CLIENTS) for (const a of ["oauth", "key"] as const) expect(stepsFor(c.id, a).length).toBeGreaterThan(1);
    expect(stepsFor("cursor", "oauth").at(-1)).toMatch(/browser/);
    expect(stepsFor("cursor", "key").at(-1)).toMatch(/no browser/);
    expect(client("other").oauth).toBe(false);
    const link = cursorDeeplink();
    expect(link.startsWith("cursor://anysphere.cursor-deeplink/mcp/install?name=corral&config=")).toBe(true);
    expect(JSON.parse(atob(decodeURIComponent(link.split("config=")[1])))).toEqual({ url: MCP_URL });
  });
});
