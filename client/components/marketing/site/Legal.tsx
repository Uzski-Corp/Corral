/* The recommended Doop draft summaries render for Terms and Privacy.
   Full ENG-87c working text remains in lib/marketing/legal.ts. The DPA keeps its outline.
   Search indexing remains controlled by the legal claim in lib/marketing/site.ts. */
import Link from "next/link";
import { EditorialTerms } from "./EditorialTerms";
import { EditorialPrivacy } from "./EditorialPrivacy";
import { LEGAL_UPDATED } from "@/lib/marketing/legal";
import { ROUTES } from "@/lib/marketing/site";
import { AgentSitePage } from "@/components/marketing/landing-v/SitePage";

export type LegalDoc = "terms" | "privacy" | "dpa";
export const LEGAL: Record<LegalDoc, { title: string; kicker: string; lede: string; outline: [string, string][] }> = {
  terms: { title: "Terms of service", kicker: "Legal", lede: `The agreement between Uzski Corp and the workspaces that use Corral. Last updated ${LEGAL_UPDATED}.`,
    outline: [["The service", "What Corral provides, and what it doesn’t."], ["Your account", "Who can sign in, owners and members, and keeping access safe."],
      ["Sending", "Your mailboxes, your recipients, and the rules on consent and unsubscribing."], ["Plans and payment", "Billing, reads, changes and cancelling."],
      ["Your content", "What you own, and the licence Corral needs to run the service."], ["Ending", "Closing a workspace, export and deletion."], ["Liability", "Limits, warranties and disputes."]] },
  privacy: { title: "Privacy notice", kicker: "Legal", lede: `What Corral collects, why, and your choices, for customers and for the people Corral writes to. Last updated ${LEGAL_UPDATED}.`,
    outline: [["What we collect", "Account data, workspace content, and what Corral reads from public websites."], ["Why", "Running the service, and nothing we don’t say here."],
      ["People you write to", "How recipients can ask what Corral holds about them, and opt out."], ["Sharing", "Subprocessors and the integrations you connect."],
      ["Keeping and deleting", "How long, and what happens when you leave."], ["Your rights", "Access, correction, deletion and complaints."]] },
  dpa: { title: "Data processing agreement", kicker: "Legal", lede: "The terms under which Corral processes personal data on your behalf.",
    outline: [["Roles", "You are the controller; Corral is the processor."], ["Instructions", "What Corral may do with the data, and nothing else."],
      ["Security", "The measures on the security page, made contractual."], ["Subprocessors", "The list, and notice before it changes."],
      ["Transfers", "Where data goes and the safeguards."], ["Breaches", "How and when you’re told."], ["Deletion", "Return and deletion at the end."]] },
};

export function LegalPage({ doc }: { doc: LegalDoc }) {
  if (doc === "terms") return <EditorialTerms />;
  if (doc === "privacy") return <EditorialPrivacy />;
  const d = LEGAL[doc];
  const others = ["terms", "privacy"] as const;
  return (
    <AgentSitePage current={ROUTES[doc]} kicker={d.kicker} title={d.title} lede={d.lede}>
      <div className="sn-wrap sn-legal">
        <p className="sn-draft" role="note"><b>Outline, not the agreement.</b> Counsel supplies the text before launch; until then this page isn’t binding and isn’t indexed.</p>
        <ol className="sn-outline">{d.outline.map(([h, t]) => <li key={h}><h2>{h}</h2><p>{t}</p></li>)}</ol>
        <p className="sn-small">Also: {others.map((o, i) => <span key={o}>{i > 0 && " · "}<Link className="sn-link" href={ROUTES[o]}>{LEGAL[o].title}</Link></span>)}. Questions: <a className="sn-link" href="mailto:legal@corral.app">legal@corral.app</a>.</p>
      </div>
    </AgentSitePage>
  );
}
