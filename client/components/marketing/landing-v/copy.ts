/* Landing variants (Bau, Oct 7): every word on /v/1–/v/4 lives here, so the variants can only differ where a variant
   says so. Rules from the copywriting skill: clarity over cleverness, the customer's words, no em dashes in short copy,
   no invented proof. Numbers inside product screens are sample data, labelled as such; there are no stats or quotes. */

export type VariantId = "1" | "2" | "3" | "4";
export const VARIANT_IDS: VariantId[] = ["1", "2", "3", "4"];

export const POSITIONING =
  "Corral is an agentic lead acquisition platform: an AI agent that finds companies that fit what you sell, reaches the person who decides, and handles the replies until a meeting is booked.";

export const KICKER = "Agentic lead acquisition";

export type Hero = { name: string; axis: string; headline: string; sub: string; title: string };
export const HEROES: Record<VariantId, Hero> = {
  "1": {
    name: "Statement",
    axis: "Type first, the run shown on a blue ground below",
    headline: "An AI agent that finds leads and books meetings.",
    sub: "Corral finds companies that fit what you sell, scores them, emails the person who decides and handles every reply.",
    title: "Corral · An AI agent that finds leads and books meetings",
  },
  "2": {
    name: "Plate",
    axis: "Open Range photo plate with the run floating on it",
    headline: "Tell Corral what you sell. It finds who buys.",
    sub: "An AI agent researches each company, finds the decision-maker and runs the outreach from your own mailbox.",
    title: "Corral · Tell it what you sell. It finds who buys.",
  },
  "3": {
    name: "Blue",
    axis: "Full-bleed blue ground, split, the run plays step by step",
    headline: "Leads found, scored and emailed for you.",
    sub: "Corral’s agent reads every company’s site, scores the fit and writes to the person who decides. Replies come back sorted, with a draft ready.",
    title: "Corral · Leads found, scored and emailed for you",
  },
  "4": {
    name: "Agent",
    axis: "Centred, led by your own AI agent calling Corral over MCP",
    headline: "Put an AI agent on lead generation.",
    sub: "Corral finds companies that fit, emails the decision-maker and handles the replies. Run it in Corral, or from Claude, ChatGPT, Cursor and OpenClaw.",
    title: "Corral · Put an AI agent on lead generation",
  },
};

export const DESCRIPTION =
  "Corral is an agentic lead acquisition platform. It finds companies that fit what you sell, scores them, emails the person who decides and handles the replies. Join the waitlist.";

export const WAITLIST = {
  cta: "Join the waitlist",
  busy: "Joining",
  label: "Work email",
  placeholder: "you@company.com",
  note: "One email when your workspace is ready.",
  joined: { title: "You’re on the list.", body: (e: string) => `We’ll write to ${e} when your workspace is ready.` },
  exists: { title: "You’re already on the list.", body: (e: string) => `${e} is in. We’ll write when your workspace is ready.` },
  invalid: "That email doesn’t look right. Check it and try again.",
  error: "We couldn’t add you just now. Try again in a minute.",
};

export const STEPS: { n: string; title: string; body: string }[] = [
  { n: "01", title: "Tell it what you sell", body: "Paste your site or a deck. Corral learns the product, who buys it and what never to say." },
  { n: "02", title: "It finds companies that fit", body: "The agent reads each company’s site and scores the fit, with a reason for every point." },
  { n: "03", title: "It writes to the person who decides", body: "It finds the decision-maker, checks the email and writes a first message that cites their own site." },
  { n: "04", title: "It handles the replies", body: "Replies come back sorted with a draft ready. A yes books the meeting on your calendar." },
];

export const VISUAL_STEPS = [
  { n: "01", title: "Teach it your product", body: "Add your site or deck. Corral learns who needs it." },
  { n: "02", title: "Find the right companies", body: "Each company gets a fit score backed by its own site." },
  { n: "03", title: "Reach the decision-maker", body: "A checked email. A first message with a reason to talk." },
  { n: "04", title: "Turn replies into meetings", body: "Replies sorted, drafts ready, meetings on your calendar." },
];

export const SECTIONS = {
  how: { kicker: "How it works", title: "From what you sell to a booked meeting." },
  proof: {
    kicker: "Every score shows its work",
    title: "You can see why each company made the list.",
    body: "Open any company to see the pages the agent read, the checks it made and the points each one earned. Under 80, it stays out of your outreach.",
  },
  send: {
    kicker: "Sends like a person",
    title: "From your own mailbox, at a human pace.",
    body: "Emails go out from your Google or Microsoft mailboxes, a few dozen a day. Before launch, Corral checks every field and stops the email that would embarrass you.",
  },
  agents: {
    kicker: "Works with your agents",
    title: "Run it from the agent you already use.",
    body: "Corral is an MCP server. Ask Claude, ChatGPT, Cursor or OpenClaw which companies fit, who replied, or to draft the next email. Keys can draft. Only you can send.",
    prompt: "Find dairy processors in Kenya that fit ColdTrace and draft an intro to whoever runs supply chain.",
  },
  integrations: { kicker: "Connects to", title: "Your mailbox, your calendar, your agents." },
  faq: { kicker: "Questions", title: "Good questions." },
  final: { title: "Let an agent find your next customers.", body: "Join the waitlist and we’ll write when your workspace is ready." },
};

export const FAQ: { q: string; a: string }[] = [
  { q: "What does Corral actually do?", a: "It runs lead generation end to end. It finds companies that match what you sell, reads their sites, scores the fit, finds the person who decides, writes and sends the emails, and sorts the replies." },
  { q: "Where do the leads come from?", a: "From the open web. The agent looks for companies like your best customers, then reads their sites to check the fit. Every contact detail links to the page it came from." },
  { q: "Does it send emails without me?", a: "Once you launch a sequence, it sends from your own mailboxes at a human pace. Replies get a draft that waits for you, and API keys can draft but can’t send." },
  { q: "Can I use it from Claude, ChatGPT or Cursor?", a: "Yes. Corral is an MCP server, so Claude, ChatGPT, Cursor, OpenClaw and other MCP clients can find companies, read replies and draft emails with the same guardrails as the app." },
  { q: "When can I start?", a: "We’re opening workspaces to the waitlist first. Join with your work email and we’ll write when yours is ready." },
];

export type Logo = { name: string; src: string; source: string; wordmark?: boolean };
const svgl = (f: string) => `https://svgl.app/library/${f}`;
export const AGENT_LOGOS: Logo[] = [
  { name: "Claude", src: "/corral/logos/claude.svg", source: svgl("claude-ai-icon.svg") },
  { name: "ChatGPT", src: "/corral/logos/openai.svg", source: svgl("openai.svg") },
  { name: "Cursor", src: "/corral/logos/cursor.svg", source: svgl("cursor_light.svg") },
  { name: "OpenClaw", src: "/corral/logos/openclaw.svg", source: svgl("openclaw.svg") },
  { name: "VS Code", src: "/corral/logos/vscode.svg", source: svgl("vscode.svg") },
];
export const TOOL_LOGOS: Logo[] = [
  { name: "Gmail", src: "/corral/logos/gmail.svg", source: svgl("gmail.svg") },
  { name: "Outlook", src: "/corral/logos/outlook.svg", source: svgl("microsoft-outlook.svg") },
  { name: "Google Calendar", src: "/corral/logos/google-calendar.svg", source: svgl("google-calendar.svg") },
  { name: "Cal.com", src: "/corral/logos/cal.svg", source: svgl("cal.svg"), wordmark: true },
  { name: "n8n", src: "/corral/logos/n8n.svg", source: svgl("n8n.svg") },
  { name: "AutoSend", src: "/corral/logos/autosend.svg", source: "public/assets/AutosendLogoSquareIndigo.svg (already in the repo; not on svgl)" },
];

export const NAV_LINKS = [
  { label: "How it works", href: "#how" },
  { label: "Agents", href: "#agents" },
  { label: "FAQ", href: "#faq" },
];
