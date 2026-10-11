import type { Metadata } from "next";
import { openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";
import "@/components/marketing/site/styles";
import { McpPage } from "@/components/marketing/site/Mcp";

export const metadata: Metadata = {
  title: "MCP server",
  description: "Connect Cursor, Claude and any MCP client to Corral. Fifteen tools, OAuth sign-in, scoped API keys, and the same guardrails as the Send button.",
  alternates: { canonical: ROUTES.mcp },
  openGraph: openGraphFor(ROUTES.mcp),
};
export default function Page() { return <McpPage />; }
