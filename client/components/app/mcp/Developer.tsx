"use client";
/* Settings → Developers (M9, ENG-59): MCP, API keys, Docs. One entry per page; each takes its review state. */
import { useMemo } from "react";
import type { DevSection, McpReviewState } from "@/lib/mcp/state";
import { devSeed } from "./data";
import { McpConnections } from "./Connections";
import { ApiKeys, type KeysApi } from "./Keys";
import { McpDocs } from "./Docs";
import type { ApiKey, Connection } from "./data";
import type { Viewer } from "@/lib/mcp/keys";

export function Developer({ section, state, keys, connections, keysApi, viewer, onDisconnect, check }: {
  section: DevSection; state?: McpReviewState; keys?: ApiKey[] | null; connections?: Connection[] | null;
  /** Signed in: keys are made and revoked on the server, as this person. */ keysApi?: KeysApi; viewer?: Viewer;
  /** Signed in: a disconnect is stored. */ onDisconnect?: (id: string) => void;
  /** Signed in: finds a newly connected host and its first call. */ check?: import("./data").FirstCallCheck;
}) {
  const seed = useMemo(() => devSeed(state), [state]);
  return section === "mcp" ? <McpConnections seed={seed} live={connections} onDisconnect={onDisconnect} check={connections ? check : undefined} /> : section === "keys" ? <ApiKeys seed={seed} live={keys} api={keys ? keysApi : undefined} viewer={keys ? viewer : undefined} /> : <McpDocs seed={seed} />;
}
