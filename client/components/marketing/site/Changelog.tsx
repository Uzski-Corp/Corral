import { EditorialDocument } from "./EditorialDocument";

const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${MON[m - 1]} ${d}, ${y}`; };



export function ChangelogPage() {
  return <EditorialDocument kicker="Product" title="Changelog" lede="Notable product changes will be listed here.">
      <p>Notable product changes will be listed here.</p>
<h2>First entry</h2>
<p><strong>Date</strong> <span className="ed-doc-todo">To confirm</span></p>
<p><strong>Hosted demo workspace</strong></p>
<ul>
<li>WorkOS sign-in and workspace setup</li>
<li>Product knowledge ingestion and search</li>
<li>Companies, contacts and segments</li>
<li>Unibox conversations on an allowlisted AutoSend demo path</li>
<li>AI reply suggestions in the demo workspace</li>
<li>Seven-day trial through Paddle, no card required to start</li>
</ul>
<p>Not included in this entry: automatic discovery completion, customer mailbox sending, or a live MCP server.</p>
    </EditorialDocument>;
}
