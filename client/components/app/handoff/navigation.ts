// Shared with the app shell without importing the settings screen and its panels.
export const SECTIONS: { id: string; label: string; note?: string; href?: string; group?: "dev" }[] = [
  { id: "profile", label: "Profile", note: "Your name and photo" },
  { id: "workspace", label: "Workspace", note: "Name, time zone, sending hours" }, { id: "team", label: "Team", note: "People and roles" },
  { id: "mailboxes", label: "Mailboxes", href: "/app/sequences?state=mailboxes" }, { id: "integrations", label: "Integrations" },
  { id: "billing", label: "Billing", note: "Plan and credits" },
  { id: "sms", label: "SMS", note: "Send a text" },
  { id: "mcp", label: "MCP", group: "dev" }, { id: "keys", label: "API keys", group: "dev" }, { id: "docs", label: "Docs", group: "dev" },
];

/** A Settings page with its own path, or undefined for external/unknown entries. */
export const settingsTabOf = (tab?: string): string | undefined => SECTIONS.find((x) => x.id === tab && !x.href)?.id;
export const settingsTabLabel = (tab: string): string => SECTIONS.find((x) => x.id === tab)!.label;
