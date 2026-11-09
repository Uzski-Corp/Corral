import { EditorialDocument } from "./EditorialDocument";

export function EditorialPrivacy() {
  return <EditorialDocument kicker="Legal" title="Privacy Notice" lede="Draft privacy notice for Corral at corral.uzskicorp.agency." contact="privacy@uzskicorp.agency">
      <p className="ed-doc-pill ed-doc-warning">Draft · Hidden from search engines until legal claim is confirmed</p>
<p>This Privacy Notice explains how Uzski Corp collects, uses, shares and protects personal information when you use Corral at corral.uzskicorp.agency.</p>
<p>Questions: privacy@uzskicorp.agency.</p>
<h2>Information we process</h2>
<p>Account and workspace content you add (products, files, companies, contacts, conversations), technical logs needed to run the service, and billing records through Paddle.</p>
<h2>How we use it</h2>
<p>To provide sign-in, store your workspace, run knowledge search, prepare drafts you review, and bill paid plans after trial.</p>
<h2>Sharing</h2>
<p>Architecture providers that may process data to run the Services today: WorkOS, Paddle, AutoSend, ThriveVAS, Cloudflare R2 and OpenAI via the Pi service. Full subprocessor list and regions <span className="ed-doc-todo">To confirm</span>.</p>
<h2>Retention and transfers</h2>
<p>Account content lasts while the workspace is active. Deletion timing after close <span className="ed-doc-todo">To confirm</span>. Production hosting location <span className="ed-doc-todo">To confirm</span>.</p>
<h2>Your rights</h2>
<p>Workspace owners can export or delete workspace data in the product where available. Email privacy@uzskicorp.agency to exercise rights. DSAR form vs email-only <span className="ed-doc-todo">To confirm</span>.</p>
<p>This page summarises the ENG-87c draft for design review. It is not counsel-approved final legal text.</p>
    </EditorialDocument>;
}
