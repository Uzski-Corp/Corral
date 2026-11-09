import { EditorialDocument } from "./EditorialDocument";

export function McpPage() {
  return <EditorialDocument kicker="Product" title="MCP for Corral" lede="Corral will expose workspace tools over MCP so agents can search companies, read knowledge and draft replies with your scopes. The server is coming soon.">
      <span className="ed-doc-pill">Coming soon</span>
      <div className="ed-doc-clients" aria-label="Planned MCP clients">
        {[["cursor", "Cursor"], ["claude", "Claude Code"], ["claude", "Claude"], ["vscode", "VS Code"]].map(([logo, name]) => <div className="ed-doc-client" key={name}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/corral/logos/${logo}.svg`} alt="" width={22} height={22} /><span>{name}</span>
        </div>)}
      </div>
<h2>What exists today</h2>
<p>In the app you can manage API key and MCP connection records. The API does not expose a functioning MCP server yet. Public MCP access is not a launch dependency.</p>
<details id="connect"><summary>Planned access and tools</summary><h2 id="keys">Planned access</h2>
<ul>
<li>Transport: Streamable HTTP</li>
<li>Auth: OAuth 2.1 for people and AI clients, or Bearer API keys for jobs</li>
<li>Host URL <span className="ed-doc-todo">To confirm</span></li>
<li>Key prefixes designed: crl_live_ and crl_test_ · Test keys shipping <span className="ed-doc-todo">To confirm</span></li>
<li>Designed rate limits: 60 requests/min, 20 writes/min, 30 sends/hour <span className="ed-doc-todo">To confirm when live</span></li>
</ul>
<h2 id="tools">Planned tools</h2>
<table><thead><tr><th>Tool</th><th>Intent</th></tr></thead><tbody>
<tr><td>search_companies</td><td>Find companies by fit, country, industry or stage</td></tr>
<tr><td>get_company</td><td>One company with contacts and fit</td></tr>
<tr><td>update_lead_status</td><td>Move a contact status with a note</td></tr>
<tr><td>list_segments / create_segment</td><td>Saved segments</td></tr>
<tr><td>list_sequences / enroll_in_sequence</td><td>Sequences; enroll does not send</td></tr>
<tr><td>list_threads / get_thread</td><td>Unibox</td></tr>
<tr><td>draft_reply</td><td>Draft from knowledge; waits in Unibox</td></tr>
<tr><td>send_reply</td><td>Send saved draft; signed-in only; keys cannot send</td></tr>
<tr><td>search_knowledge / add_knowledge_source</td><td>Knowledge base</td></tr>
<tr><td>explain_fit / score_company</td><td>Fit explanation and scoring</td></tr>
</tbody></table>
</details><h2 id="errors">Guardrails</h2>
<p>API keys can draft. Only a signed-in person can send. Designed errors include insufficient scope, key cannot send, rate limited and Never say.</p>

    </EditorialDocument>;
}
