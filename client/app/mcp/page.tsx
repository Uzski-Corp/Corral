import type { Metadata } from "next";
import { openGraphFor } from "@/lib/marketing/seo";
import { ROUTES } from "@/lib/marketing/site";
import "@/components/marketing/site/styles";
import { McpPage } from "@/components/marketing/site/Mcp";

export const metadata: Metadata = {
  title: "MCP server",
  description: "Planned MCP access for Cursor, Claude and other clients. Search companies, read knowledge and prepare drafts with scoped workspace tools.",
  alternates: { canonical: ROUTES.mcp },
  openGraph: openGraphFor(ROUTES.mcp),
};
export default function Page() { return <McpPage />; }
