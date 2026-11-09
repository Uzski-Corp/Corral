import { EditorialDocument } from "./EditorialDocument";

export function SecurityPage() {
  return <EditorialDocument kicker="Trust" title="Security and data handling" lede="Corral keeps each workspace’s data separate and limits what automated systems can send in your name.">
      <h2>Sign-in</h2>
<p>People sign in with WorkOS using hosted OAuth or an email code. Sessions use sealed cookies. Browser writes need an allowed origin.</p>
<h2>Workspace isolation</h2>
<p>Requests run with transaction-local organisation context. Postgres row-level security runs under an unprivileged database role.</p>
<h2>What we store</h2>
<p>Product knowledge, companies, contacts, conversations, billing and AI run state live in Postgres with pgvector for search. Original knowledge uploads are stored in Postgres. Optional Cloudflare R2 holds workspace or profile images when that feature is enabled. Jobs use Redis.</p>
<h2>Sending and drafts</h2>
<p>Replies are drafts until you act. Demo mail uses an allowlisted AutoSend path. Customer mailbox OAuth is not implemented. The designed Unibox undo window is 10 seconds. API keys can draft; they cannot send.</p>
<h2>Providers in the architecture</h2>
<p>WorkOS, Paddle, AutoSend, ThriveVAS, Cloudflare R2 and OpenAI via the Pi service.</p>
<h2>Still to confirm</h2>
<ul>
<li>Production data region <span className="ed-doc-todo">To confirm</span></li>
<li>Encryption at rest <span className="ed-doc-todo">To confirm</span></li>
<li>Retention after a workspace closes <span className="ed-doc-todo">To confirm</span></li>
<li>Named subprocessor list <span className="ed-doc-todo">To confirm</span></li>
</ul>
<p>Report a concern: hello@uzskicorp.agency until a dedicated security address is confirmed.</p>
    </EditorialDocument>;
}
