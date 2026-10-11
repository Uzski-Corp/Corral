/* /security (M10). What Corral can touch and what it can't, each rule pointing at where it lives in the product.
   Only what the product guarantees is stated plainly; anything an owner still has to confirm says so. */
import Link from "next/link";
import { RATE, ROTATE_OVERLAP_HOURS, DEFAULT_EXPIRY, KEY_SEND_REFUSED } from "@/lib/mcp/keys";
import { UNDO_SECONDS } from "@/lib/unibox/draft";
import { ROUTES, claim } from "@/lib/marketing/site";
import { AgentSitePage } from "@/components/marketing/landing-v/SitePage";
import { Section, ToConfirm } from "./Chrome";
import { ProductFrame } from "./ProductFrame";
import { KeyAccessPiece } from "./Pieces";
import { Screen } from "./Screen";

const Pending = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const c = claim(id)!;
  return <li className={c.confirmed ? undefined : "is-pending"}><span>{children}</span>{!c.confirmed && <ToConfirm who={c.owner} />}</li>;
};

export function SecurityPage() {
  return (
    <AgentSitePage current={ROUTES.security} kicker="Security" title={<>What Corral can touch,<br />and what it can’t.</>}
      lede="Corral writes as you, from your mailboxes, to people who decide. So the rules that matter are about what it may do without you. Here they are, and where each one lives in the product.">

      <Section n="01" id="sending" title="Nothing replies without you.">
        <ul className="sn-rules">
          <li><b>Every reply is a draft.</b> Corral writes it from your knowledge base and shows what it cited. You send it, and for {UNDO_SECONDS} seconds you can take it back.</li>
          <li><b>Never say holds everywhere.</b> Phrases you ban, prices you don’t quote: a draft that trips one can’t be sent, from the app or from any client.</li>
          <li><b>Sequences check before they launch.</b> Empty fields, a mailbox over its cap, a step with no unsubscribe: launch stops and says which.</li>
          <li><b>API keys can’t send.</b> {KEY_SEND_REFUSED}</li>
        </ul>
        <div className="sn-piece"><KeyAccessPiece /><p className="sn-cap">The access picker when you make an API key: the Unibox stops at Write.</p></div>
      </Section>

      <Section n="02" id="mailboxes" title="Your mailboxes stay yours.">
        <p className="sn-body">Corral sends from the Google and Microsoft mailboxes you connect, never from a shared pool of ours. Each mailbox has a daily cap and random gaps between sends, and you can take one out of the pool, or disconnect it, at any time. Replies land in your inbox as they always did; the Unibox reads them there.</p>
        <p className="sn-body">Cal.com, Phoenix ERP and AutoSend connect with the narrowest permissions each offers, listed before you allow them and again in Settings → Integrations.</p>
      </Section>

      <Section n="03" id="access" title="Who and what is signed in." wide>
        <div className="sn-cols">
          <ul className="sn-rules">
            <li><b>People sign in with Google or a one-time code</b> sent to their work email. Owners manage the workspace and every API key; members manage the keys they made.</li>
            <li><b>AI clients sign in as a person.</b> Cursor, Claude and other MCP clients use OAuth, act as whoever allowed them, and see only the tools their access allows.</li>
            <li><b>API keys are shown once.</b> Corral keeps a hash and the last four characters. Keys expire after {DEFAULT_EXPIRY} days by default; rotating keeps the old one working {ROTATE_OVERLAP_HOURS} hours.</li>
            <li><b>Every call is logged</b> for 90 days, refused ones included, and limited to {RATE.perMinute} a minute per key or connection.</li>
          </ul>
          <ProductFrame label="Settings → MCP, Cursor’s activity: every call it made" height={620} phone={560}
            caption="Settings → Developers → MCP: what Cursor did this week, call by call.">
            <Screen view="settings" developer="mcp-activity" />
          </ProductFrame>
        </div>
      </Section>

      <Section n="04" id="data" title="Your data.">
        <ul className="sn-ledger">
          <li><span>Companies, contacts, threads and the knowledge base export as CSV from the app, any time.</span></li>
          <li><span>Corral reads public websites to score them. It doesn’t buy lists or enrich from brokers; every contact detail shows where it came from.</span></li>
          <Pending id="region">Workspace data is stored in one region, named here.</Pending>
          <Pending id="encryption">Encrypted in transit with TLS 1.2 or later, and at rest.</Pending>
          <Pending id="retention">When a workspace closes, its data is deleted after 30 days.</Pending>
          <Pending id="subprocessors">The subprocessors that host and process workspace data, listed with what each does.</Pending>
        </ul>
      </Section>

      <Section n="05" id="report" title="Tell us.">
        <p className="sn-body">Found something? Write to <a className="sn-link" href="mailto:security@corral.app">security@corral.app</a>. Tell us how to credit you, if you’d like. Terms, privacy and the data processing agreement are under <Link className="sn-link" href={ROUTES.terms}>Legal</Link>.</p>
      </Section>
    </AgentSitePage>
  );
}
