"use client";
/* Settings → Developers (M9, ENG-59): MCP, API keys, Docs. One entry per page; each takes its review state. */
import { useMemo } from "react";
import type { DevSection, McpReviewState } from "@/lib/mcp/state";
import { devSeed } from "./data";
import { McpConnections } from "./Connections";
import { ApiKeys } from "./Keys";
import { McpDocs } from "./Docs";

export function Developer({ section, state }: { section: DevSection; state?: McpReviewState }) {
  const seed = useMemo(() => devSeed(state), [state]);
  return section === "mcp" ? <McpConnections seed={seed} /> : section === "keys" ? <ApiKeys seed={seed} /> : <McpDocs seed={seed} />;
}
