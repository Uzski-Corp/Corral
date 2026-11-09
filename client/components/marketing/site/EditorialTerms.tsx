import { EditorialDocument } from "./EditorialDocument";

export function EditorialTerms() {
  return <EditorialDocument kicker="Legal" title="Terms of Service" lede="Draft terms for Corral, operated by Uzski Corp in Kenya.">
      <p className="ed-doc-pill ed-doc-warning">Draft · Hidden from search engines until legal claim is confirmed</p>
<p>Last updated stamp in draft: 30 September 2026.</p>
<h2>Agreement</h2>
<p>We are Uzski Corp, registered in Kenya at Abc Place Nairobi, Waiyaki Way, Nairobi, Nairobi County 00100, Kenya. We build and operate Corral at corral.uzskicorp.agency, including the Corral app and API and, when available, an MCP server.</p>
<p>Contact: hello@uzskicorp.agency · +254 745 071 299 · post to the address above.</p>
<p>Governing law and courts: Kenya.</p>
<h2>Plans and payment</h2>
<p>The workspace trial is 7 days with no card. Paid plans bill monthly in USD through Paddle. Plan names only are shown publicly for now. Refund policy <span className="ed-doc-todo">To confirm</span>.</p>
<h2>Your content</h2>
<p>You own your content. We host and process it only to provide the Services. We do not sell it. No-training commitment across providers <span className="ed-doc-todo">To confirm</span>.</p>
<h2>Sending email</h2>
<p>You are responsible for what is sent in your name. Drafts wait for your approval. Demo sending today uses an allowlisted path. Customer mailbox OAuth is not implemented.</p>
<h2>Open TODOs</h2>
<ul>
<li>Production domain confirmation beyond corral.uzskicorp.agency <span className="ed-doc-todo">To confirm</span></li>
<li>Liability cap <span className="ed-doc-todo">To confirm</span></li>
<li>Hosting, database, object storage and Redis providers and regions <span className="ed-doc-todo">To confirm</span></li>
<li>Embeddings and LLM providers and retention terms <span className="ed-doc-todo">To confirm</span></li>
<li>Account email provider, log retention, analytics cookies <span className="ed-doc-todo">To confirm</span></li>
<li>KB restore and purge windows; days to delete after workspace close <span className="ed-doc-todo">To confirm</span></li>
<li>Full DPA body from counsel <span className="ed-doc-todo">To confirm</span></li>
</ul>
<p>This page summarises the ENG-87c draft for design review. It is not counsel-approved final legal text.</p>
    </EditorialDocument>;
}
