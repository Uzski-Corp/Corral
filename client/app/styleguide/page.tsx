import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styleguide.css";
import Link from "next/link";
import { BuilderDemo, ImportDemo, LeadDetailDemo, LeadStatesDemo, LeadTableDemo, StatusTagsDemo } from "./M3Sections";
import { DiscoveryShellDemo, EnrichDemo, RunStatesDemo, SetupDemo } from "./M4Sections";
import { FitBarDemo, FitReasoningDemo } from "./M5Sections";
import { PoolDemo, SequenceDemo, StepEditorDemo } from "./M6Sections";
import { CopilotStatesDemo, ThreadViewDemo, UniboxTriageDemo } from "./M7Sections";
import { HandoffDemo, IntegrationsDemo } from "./M8Sections";
import { DevelopersDemo } from "./M9Sections";
import { EveryStateDemo } from "./M10Sections";
import { EditorDemo, KbShellDemo, SourceDetailDemo, SourceListDemo, UploadDemo } from "./M2Sections";
import { AccountStatesDemo, CodeStatesDemo, CmdkDemo, ContrastDemo, FormDemo, OverlayDemo, SessionErrorDemo, ShellDemo, StatesDemo, TabsToastDemo } from "./M1Sections";
import {
  Avatar, Button, ContextRail, Field, FilterBar, FitBar, Input, LEADS, Logo, MeetingCard, PersonCard, Receipt, Receipts,
  ReadingPane, ReplyCard, SegmentTable, SegmentWindow, Segmented, Tag, THREADS, ThreadList, Toast, Toggle, Mark,
} from "@/components/app";

export const metadata: Metadata = { title: "App language (Open Range)", robots: { index: false } };

function Part({ n, title, notes, tokens, children, wide }: { n: string; title: string; notes: ReactNode; tokens: string[]; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`sg-part${wide ? " sg-part--wide" : ""}`}>
      <div className="sg-part__side">
        <span className="sg-n">{n}</span><h2>{title}</h2><div className="sg-notes">{notes}</div>
        <ul className="sg-tokens">{tokens.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      <div className="sg-part__stage c-app">{children}</div>
    </section>
  );
}
const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;

const STATE_ROWS = ["kilima", "pwani", "nyota", "rift", "kivu"].map((id) => LEADS.find((l) => l.id === id)!);
const brian = THREADS[0];

export default function Styleguide() {
  return (
    <main className="sg">
      <header className="sg-head">
        <div className="sg-head__brand"><Mark size={20} /><span>Corral</span><span className="sg-faint">App language · Open Range</span></div>
        <h1>The product, in use.</h1>
        <p>Every component below is the live React component from <code>components/app</code>, shown where it actually lives. Tokens come from the Tailwind v4 <code>@theme</code> in <code>app/globals.css</code>. Both marketing sites embed these same components; only the page around them changes.</p>
        <nav className="sg-routes" aria-label="M1 screens"><span className="sg-faint">M1 screens</span>
          <Link href="/app">/app</Link><Link href="/app?cmdk=1">/app?cmdk=1</Link><Link href="/app?state=api-down">/app?state=api-down</Link><Link href="/sign-in">/sign-in</Link><Link href="/sign-in?state=cancelled">?state=cancelled</Link><Link href="/sign-in?state=unavailable">?state=unavailable</Link><Link href="/onboarding">/onboarding</Link>
          <span className="sg-faint">Handoff: <code>round3/tokens/HANDOFF-ENG.md</code></span></nav>
        <nav className="sg-routes" aria-label="Marketing pages (M10)"><span className="sg-faint">Site (M10)</span>
          <Link href="/open-range">/open-range</Link><Link href="/fenceline">/fenceline</Link><Link href="/pricing">/pricing</Link><Link href="/security">/security</Link><Link href="/mcp">/mcp</Link><Link href="/changelog">/changelog</Link><Link href="/legal/terms">/legal/terms</Link><Link href="/styleguide/share">/styleguide/share</Link><a href="#every-state">§46 Every state</a></nav>
        <ul className="sg-rules">
          <li><b>One action colour.</b> Blue <code>--color-action</code> for the one thing to do next; near-black <code>--color-action-2</code> for the second.</li>
          <li><b>Two weights, one tracking.</b> Inter 400/500 at 12–24px, −0.15px everywhere.</li>
          <li><b>Receipts, not sparkles.</b> AI work is shown as a checked line with its source and time.</li>
          <li><b>The fit bar is the signature.</b> Ten segments, blue from 80, grey below.</li>
        </ul>
      </header>

      <Part wide n="01" title="A segment, working" tokens={["--spacing-sidebar 220", "--spacing-toolbar 52", "--spacing-row 40", "--radius-window 14", "--shadow-window"]}
        notes={<p>Sidebar, toolbar, filters and table together. Tick rows and the primary action counts with you; open <em>+ Filter</em> for the menu.</p>}>
        <SegmentWindow limit={9} className="sg-seg" />
      </Part>

      <Part n="02" title="Reading a row" tokens={["--color-surface-selected", "--color-border-subtle", "--color-fit-low", "--radius-check 4"]}
        notes={<p>Selected rows turn faintly blue. Hover is a grey wash. Below 80 the whole row steps back a tone so the eye skips it.</p>}>
        <div className="sg-states">
          <div className="c-win c-win--flat sg-table"><SegmentTable leads={STATE_ROWS} selected={new Set(["kilima", "pwani"])} hover="nyota" /></div>
          <div className="sg-states__labels"><Label>selected</Label><Label>selected</Label><Label>hover</Label><Label>default</Label><Label>fit &lt; 80 · dimmed</Label></div>
        </div>
      </Part>

      <Part n="03" title="The fit bar, wherever it appears" tokens={["--color-fit-on", "--color-fit-low", "--color-fit-off", "4×12 · 6×16 · 8×20"]}
        notes={<p>Same ten segments at three sizes: in a cell, in a sentence, and as the headline of the context rail. The number always sits beside it.</p>}>
        <div className="sg-fits">
          <div className="sg-card"><Label>in a table cell</Label>
            {STATE_ROWS.slice(0, 3).concat(STATE_ROWS[4]).map((l) => <div key={l.id} className="sg-fitrow"><Logo company={l.company} /><span className="c-strong">{l.company}</span><span style={{ flex: 1 }} /><FitBar value={l.fit} /></div>)}</div>
          <div className="sg-card"><Label>in a sentence</Label><p className="sg-sentence">Kilima Dairies scored <FitBar value={94} size="md" /> for ColdTrace Sensors because it runs three cold rooms with no live alerting.</p></div>
          <div className="sg-rail"><ContextRail t={brian} /></div>
        </div>
      </Part>

      <Part n="04" title="Status tags in a thread list" tokens={["50 fill / 200 border / 600 text", "--spacing-tag 22", "--radius-tag 6", "13/18 Medium"]}
        notes={<p>Tags only ever carry state: reply classification, email verification, meetings. Seven reply states appear in one inbox; all are the same triple.</p>}>
        <div className="sg-threads"><ThreadList threads={THREADS} active="brian" />
          <div className="sg-threads__right"><div className="c-win c-win--flat sg-pane"><ReadingPane t={THREADS[5]} /></div><div className="sg-taglist">{(["Interested", "Meeting booked", "Objection", "OOO", "Referral", "Not interested", "Contacted", "Verified", "Catch-all", "Bounced"] as const).map((s) => <Tag key={s} status={s} />)}</div></div></div>
      </Part>

      <Part n="05" title="Buttons where they live" tokens={["--color-action", "--color-action-2", "--radius-button 8", "28 / 32 heights"]}
        notes={<p>One blue button per surface. Near-black is for the second commitment (onboarding, marketing). Keyboard hints ride inside the button.</p>}>
        <div className="sg-buttons">
          <div className="sg-card sg-bar"><Label>toolbar</Label><div className="c-actions"><Button>Export</Button><Button variant="primary">Enroll 3 in sequence</Button></div></div>
          <div className="sg-card sg-bar"><Label>nothing selected</Label><div className="c-actions"><Button>Export</Button><Button variant="primary" disabled>Select to enroll</Button></div></div>
          <div className="sg-card sg-bar"><Label>composer</Label><div className="c-actions"><Button variant="primary" kbd="⌘↵">Send reply</Button><Button>Edit</Button><Button variant="quiet">Snooze</Button></div></div>
          <div className="sg-card sg-empty"><Label>empty state</Label><p className="c-strong" style={{ fontSize: 16 }}>No products yet</p><p>Corral scores companies against something you sell. Start with one.</p><div className="c-actions"><Button variant="ink" size="lg">Add your first product</Button><Button size="lg">Import a pitch deck</Button></div></div>
        </div>
      </Part>

      <Part wide n="06" title="Filters" tokens={["--spacing-chip 24", "--color-surface-sunken", "--shadow-pop"]}
        notes={<p>Applied filters read as a sentence. The menu is keyboard-first: type to narrow, ↵ to add, S to save the view as a segment.</p>}>
        <div className="c-win c-win--flat sg-filters"><div className="c-main"><div className="c-toolbar"><div className="c-crumbs"><span>Segments</span><span className="c-sep">/</span><b>New segment</b></div></div><FilterBar defaultOpen menuLeft={470} /><div className="sg-filters__pad" /></div></div>
      </Part>

      <Part n="07" title="Inputs: adding a product" tokens={["--radius-input 7", "--spacing-btn 32", "--color-action-ring", "negative-600 on error"]}
        notes={<p>Onboarding is the only long form in the product. Focus is a blue ring; errors say what to do.</p>}>
        <div className="c-win c-win--flat sg-form">
          <div className="sg-form__head"><span className="c-strong" style={{ fontSize: 16 }}>Add a product</span><span className="c-muted">Step 1 of 2</span></div>
          <div className="sg-form__body">
            <Field label="Pitch deck or product page" hint="PDF, URL or a paragraph."><Input icon="link" state="focus">coldtrace.io/pitch-2026.pdf</Input></Field>
            <Field label="Product name"><Input>ColdTrace Sensors</Input></Field>
            <Field label="Who feels the pain?" hint="Corral drafted this from your deck. Edit freely."><div className="c-input c-input--area">Operations and supply-chain leads at food &amp; beverage companies with two or more cold rooms and no live alerting.</div></Field>
            <Field label="Sending domain" hint={<span style={{ color: "var(--color-negative-600)" }}>coldtrace.io has no DMARC record yet. Add one, then check again.</span>}><Input state="error">coldtrace.io</Input></Field>
            <div className="sg-form__row"><span>Mailboxes per day</span><Segmented options={["20", "30", "35"]} value="30" /></div>
            <div className="sg-form__row"><span>Pause sequences on any reply</span><Toggle on label="Pause sequences on any reply" /></div>
            <Receipts><Receipt meta="6s">Found 4 pains, 3 objections, 2 proof points</Receipt></Receipts>
          </div>
          <div className="sg-form__foot"><Button>Back</Button><span style={{ flex: 1 }} /><Button variant="primary" size="lg">Find companies</Button></div>
        </div>
      </Part>

      <Part n="08" title="Reply card" tokens={["--radius-card 12", "--color-action-subtle (cited proof)", "focus ring while editing"]}
        notes={<p>The copilot’s draft is plain text you own. Receipts above it say where each claim came from; the cited proof is tinted.</p>}>
        <div className="sg-reply">
          <Receipts>{brian.receipts.map(([a, b]) => <Receipt key={a} meta={b}>{a}</Receipt>)}</Receipts>
          <ReplyCard paragraphs={brian.draft!} highlight="paid the sensors back in one quarter" />
          <Label>editing</Label>
          <ReplyCard focus paragraphs={["Fair point, Brian. Most teams compare us to loggers, but loggers only tell you what spoiled after the fact."]} />
        </div>
      </Part>

      <Part wide n="09" title="App shell" tokens={["--spacing-sidebar 220 / --spacing-sidebar-collapsed 56", "--spacing-toolbar 52 (top bar)", "--color-surface-muted (frame)", "--radius-card 12 (main panel)", "@container shell ≤ 767px → drawer"]}
        notes={<><p>The whole app lives in one frame: a grey rail and a white main panel inset by 8px. Workspace switcher, search, seven places, saved segments, the mailbox pool and you. Settings sits at the bottom.</p><p style={{ marginTop: 8 }}>Everything here works: switch views, open ⌘K from Search, tick rows and enroll, press the panel icon to collapse. On small widths the rail becomes a drawer behind the menu button.</p></>}>
        <ShellDemo />
      </Part>

      <Part n="10" title="Command menu (⌘K)" tokens={["--spacing-cmdk 640", "36px rows · 30px group labels", "--color-surface-sunken (highlight)", "--shadow-dialog", "search latency → skeleton"]}
        notes={<p>Recent first, then places, then actions. Typing filters commands instantly while companies and people search in the background. No results always offers one next step. Try it: these four are live, type into any of them.</p>}>
        <CmdkDemo />
      </Part>

      <Part n="11" title="Dialog, dropdown, tooltip" tokens={["--color-scrim", "--shadow-dialog / --shadow-pop", "--radius-window 14 · menu 10", "--ease-snap 180ms from scale(.96)"]}
        notes={<p>A dialog asks for one decision and has one blue button. Menus are keyboard-first and open from their trigger. Tooltips only name icon-only controls and their key; they never carry sentences.</p>}>
        <OverlayDemo />
      </Part>

      <Part n="12" title="Form controls, in Settings" tokens={["--radius-input 7 · --spacing-btn 32", "--color-action-ring (focus)", "negative-600 (error replaces help)", "checkbox 12 · radio 14 · switch 26×16"]}
        notes={<p>Label 13 Medium, control, then one line of help. An error replaces the help and says what to do. Select, date picker, radio, checkbox (with a mixed parent), switch, segmented, text and textarea, all wired.</p>}>
        <FormDemo />
      </Part>

      <Part n="13" title="Tabs and toasts" tokens={["tabs: 40px, 2px ink underline", "pill tabs = Segmented", "--color-surface-inverse (toast)", "4s · max 3 stacked"]}
        notes={<p>Line tabs sit under a toolbar and carry counts. Pill tabs switch a range inside a panel. Toasts confirm something that already happened, with at most one action (usually Undo).</p>}>
        <TabsToastDemo />
      </Part>

      <Part n="14" title="Empty, error, loading" tokens={["--color-surface-sunken (skeleton)", "art: /corral/or/range-sky.jpg", "negative-50 / 600 (error icon)", "banner = status triple"]}
        notes={<p>Empty says what a place is for and gives one way to fill it; the brand image may appear here, small. Errors say what failed, whether anything was lost, and offer a retry. Skeletons match real row heights.</p>}>
        <StatesDemo />
      </Part>

      <Part wide n="16" title="Contrast, controls and links (WCAG AA)" tokens={["--color-text-secondary #4F4F4F", "--color-text-tertiary #5F5F5F", "--color-text-quaternary #6A6A6A", "--color-text-disabled #A1A1A1 (new)", "--color-border-control #8F8F8C (new)", "positive/caution/negative-600 darkened"]}
        notes={<><p>Every text grey now passes 4.5:1 on the darkest surface it sits on (active nav, #EBEBE9). The ladder keeps three visible steps, so quiet stays quiet; hierarchy leans a little more on size and weight.</p><p style={{ marginTop: 8 }}>#A1A1A1 survives only as <code>text-disabled</code>. Status tags keep their fills; only the 600 text darkened where it failed.</p></>}>
        <ContrastDemo />
      </Part>

      <Part n="17" title="Account row states" tokens={["Monogram: neutral-200 fill / neutral-600 initials (6.08:1)", "Skeleton 24 circle · 96×10 · 120×8", "c-me 44px row"]}
        notes={<p>No picture means initials on the neutral tint, never a blank. Pictures that fail to load fall back to the same monogram. While <code>/me</code> loads, the row uses the Skeleton primitive at the real text sizes; if the check fails it stops shimmering and says so.</p>}>
        <AccountStatesDemo />
      </Part>

      <Part wide n="18" title="Session check failed (API down)" tokens={["full shell, body replaced", "caution-50 / 200 / 600 icon", "--text-title 18 headline", "auto-retry 30s"]}
        notes={<p>When <code>GET /me</code> can’t reach the API, the shell keeps its frame and the body says what happened, that nothing is lost, and how to retry. Reachable at <code>/app?state=api-down</code>.</p>}>
        <SessionErrorDemo />
      </Part>

      <Part wide n="19" title="Sign-in code (Magic Auth)" tokens={["one <input> · six drawn cells 56px", "--color-border-control cells (3.24:1)", "action ring = caret", "negative-600 wrong · muted + strike expired", "cooldown 20s = 60s / 3"]}
        notes={<p>WorkOS emails a six-digit code that lasts 10 minutes. The field is one real input (one-time-code autofill, whole-code paste, numeric keypad, one label) drawn as 3 + 3 cells, and it submits on the sixth digit. A wrong code stays put and is selected, so typing replaces it. An expired code locks the field and the primary becomes <b>Send a new code</b>.</p>}>
        <CodeStatesDemo />
      </Part>

      <Part wide n="20" title="Knowledge base · source list" tokens={["k-srcrow 60px two-line rows", "k-tile #F7F6F2 paper, mono 8.5px", "status: quiet unless it needs you", "k-bar 3px --color-action"]}
        notes={<p>A ledger of what Corral has read for one product. Exceptions sort to the top (needs you, then still reading). Ready rows stay quiet, just a passage count; only partial and failed rows get colour. Live rows show the stage in words and a 3px progress rule, not a spinner.</p>}>
        <SourceListDemo />
      </Part>

      <Part wide n="21" title="Knowledge base · upload and progress" tokens={["dialog 600", "drop zone dashed --color-border-control", "error row #FFF8F8 + negative-600 title", "25 MB · 20 per drop · PDF DOCX MD + URLs"]}
        notes={<p>One dialog adds files and web pages. The client checks type and size in 0ms, before a byte leaves the browser, and every failure names what happened and the one fix (Retry, Replace, or how to convert). Closing while uploads run leaves a small tray in the corner. Dropping files anywhere on the page opens the same dialog.</p>}>
        <UploadDemo />
      </Part>

      <Part wide n="22" title="Knowledge base · source detail" tokens={["rail 380", "pipeline as receipts: Uploaded → Checked → Read → Split → Searchable", "ink check done · action ring live · caution partial · negative failed"]}
        notes={<p>The detail shows its work: each pipeline step with the fact that proves it, which knowledge lines cite the source, and the passages retrieval actually sees. A partial read says which pages were skipped and why. A failed read says Corral is using nothing from it.</p>}>
        <SourceDetailDemo />
      </Part>

      <Part wide n="23" title="Knowledge base · the knowledge page" tokens={["doc column 604 + sidenotes 220", "32/38 title · 15/24 body", "section numbers mono 01–07", "caution-50 attention box"]}
        notes={<p>What Corral knows reads like a document, not a form: numbered sections, 15px body, and citations as sidenotes you can click through to the source. Provenance under each line says who wrote it (drafted by Corral from N sources, or edited by you). New lines, lines whose source was removed, and conflicts between sources are gathered at the top and resolved in place.</p>}>
        <EditorDemo />
      </Part>

      <Part wide n="24" title="Knowledge base · in the shell, every state" tokens={["/app?view=knowledge", "?state= review states (outside production)", "top bar: product switcher + Add sources"]}
        notes={<p>Two tabs, Knowledge and Sources. The top bar carries the product switcher and the one primary action, <b>Add sources</b>. At 390 the index hides, sidenotes drop under each line, rows stack, and the detail takes the full screen with a back row.</p>}>
        <KbShellDemo />
      </Part>

      <Part wide n="25" title="Leads · the table and bulk actions" tokens={["c-tr 40px rows, same grid as M1", "aria-sort headers · first click: fit high→low, names A→Z", "bulk bar: canvas, --shadow-pop, 48px, bottom centre", "confirm at 100+ selected"]}
        notes={<p>The M1 Companies table, extended rather than forked: sortable headers, a header checkbox with a mixed state, rows that open the detail. Selecting anything brings up one bar at the bottom with the actions for the selection; <b>Esc</b> clears it. Selecting a whole page offers the whole view (Gmail&rsquo;s pattern), and anything over 100 is checked first and runs in the background.</p>}>
        <LeadTableDemo />
        <LeadStatesDemo />
      </Part>

      <Part wide n="26" title="Leads · status tags" tokens={["c-tag 50 fill / 200 border / 600 text", "new: Unverified (neutral), Unsubscribed (negative)", "menu 320 with the meaning of each"]}
        notes={<p>Two tags per company: where the conversation is, and whether the email works. The tag is the control; its menu says what each status means. Corral sets them from replies; a status you set sticks until they reply again. Unsubscribed and Bounced are permanent blocks on enrolling.</p>}>
        <StatusTagsDemo />
      </Part>

      <Part wide n="27" title="Leads · lead detail" tokens={["rail 400 · full screen at 390", "facts grid 96px labels", "activity: mono time column 64px", "caution banner for duplicates"]}
        notes={<p>One company: the person Corral writes to, why it fits, where it is in a sequence, and what happened, newest first. A likely duplicate says why Corral thinks so and offers Merge or Keep both; merging keeps the original&rsquo;s history. Companies that can&rsquo;t be emailed say why instead of offering Enroll.</p>}>
        <LeadDetailDemo />
      </Part>

      <Part wide n="28" title="Leads · segment builder" tokens={["rules: field 210 · condition 128 · value", "count 32/38 tabular", "same Rule model as the filter chips"]}
        notes={<p>Filters and segments are one thing: the chips over the table are rules, and saving them makes a segment that stays live. The count updates as you type. An unfinished rule is marked and ignored, never guessed; a rule set that matches nothing names the tightest rule and what loosening it would give.</p>}>
        <BuilderDemo />
      </Part>

      <Part wide n="29" title="Leads · CSV import" tokens={["dialog 560 (file, running, done) · 760 (columns, review)", "steps: File → Columns → Review", "20 MB · 50,000 rows · CSV/TSV", "duplicates: email, then website"]}
        notes={<p>Nothing is written until the last step. Columns are guessed from their names, then from their values, and each says how it was matched. Problems with the mapping block Continue and name the columns. Duplicates get one policy (skip, fill in blanks, overwrite); bad rows are listed by their spreadsheet row and can be downloaded to fix.</p>}>
        <ImportDemo />
      </Part>

      <Part wide n="30" title="Discovery · a run in the shell" tokens={["runs list 272 + run", "detail replaces the list below 1680", "/app?view=discovery", "top bar: credits left + New run"]}
        notes={<p>A run searches the web for companies that fit the product, reads each site, scores it against the ICP, and only then spends credits finding and verifying a person, and only for companies above the fit bar. One run at a time per workspace; the next one queues. Results land in Companies as they are found, source <b>Corral search</b>, so nothing waits for the run to finish.</p>}>
        <DiscoveryShellDemo />
      </Part>

      <Part wide n="31" title="Discovery · stages and run states" tokens={["5 stages: Search → Read → Score → People → Verify", "d-stage bar 3px --color-action", "caution: paused, partial · negative: failed", "counts tabular, provider in mono"]}
        notes={<p>Each stage names its provider and counts in its own unit (searches, sites, companies, lookups, checks). A provider limit pauses only the stages that need it and resumes on its own with a countdown. A failure keeps everything found and stops before spending credits; Resume starts from the stage that stopped. Sites that couldn&rsquo;t be read are kept without a fit, grouped by reason.</p>}>
        <RunStatesDemo />
      </Part>

      <Part wide n="32" title="Discovery · new run" tokens={["dialog 640", "Segmented: stop after · fit bar", "estimate box: credits, free, time", "issues banner blocks Start"]}
        notes={<p>Defaults come from the product&rsquo;s ICP, so most runs are one click. The estimate is shown before anything is spent and updates as the limit or fit bar changes; raising the bar is the cheapest way to save credits. Credits held by a run in progress are not free. Problems are listed and named, never guessed around.</p>}>
        <SetupDemo />
      </Part>

      <Part wide n="33" title="Enrichment state and provenance" tokens={["c-enrich: tertiary text in place of the value", "c-stale dot caution-600", "evidence chain: source · what · when · confidence", "freshness windows: email 90 · person 180 · firmographics 365 days"]}
        notes={<p>Every field keeps the chain of evidence that produced it: where it was found, who confirmed it, when, and how sure. Values age by field (an email goes stale in 90 days, an industry in a year) and Corral re-checks stale contact details before sending. Anything you typed is yours: it never goes stale and Corral won&rsquo;t overwrite it.</p>}>
        <EnrichDemo />
      </Part>

      <Part wide n="34" title="Fit score · the bar in every state" tokens={["c-fit: 10 segments, --color-action", "scoring: sweep 1.6s, off under reduced motion", "low confidence: outlined segments", "delta ↑↓ tabular · yours: pen, weight 600"]}
        notes={<p>The same Open Range bar, extended rather than replaced: a plain value renders exactly as before. The bar also says when Corral is scoring, when there&rsquo;s no score yet and why, when a score is thin, when it moved since last time, when the number is yours, and when scoring failed. In the table these read as one short word so the column keeps its width; the full sentence is the bar&rsquo;s accessible name.</p>}>
        <FitBarDemo />
      </Part>

      <Part wide n="35" title="Fit score · why it scored" tokens={["checks weighted to 100, against KB lines", "evidence: quote · source · where · when → provenance", "f-banner: info · caution · negative", "floor and ceiling when evidence is missing"]}
        notes={<p>A score is a short list of checks, each measured against a line of the product&rsquo;s knowledge base and backed by the evidence Corral read, with a link to where that came from. It reads like a case file, not a chart: the claim, the points, the finding, the quote. Missing evidence counts as zero and is named, so a thin score is a floor with its ceiling shown. You can set the fit yourself or tell Corral what&rsquo;s wrong; both are kept and explained.</p>}>
        <FitReasoningDemo />
      </Part>

      <Part wide n="36" title="Sequence builder" tokens={["q-step card · is-on ring --color-action", "q-gate: dashed thread line + wait · condition · otherwise", "q-tok info-50 mono 11 · q-var filled value", "d-runtag: draft · launching · running · paused"]}
        notes={<p>A sequence reads top to bottom like the thread it will become: each email, then the rule that decides whether the next one goes. The rule is always a wait plus a condition, and a reply ends it for that person at any step, so there is no replied branch to build. Launch checks everything first and names what&rsquo;s wrong and where; running shows what each step did and what sends next; paused says who paused it and what&rsquo;s being held.</p>}>
        <SequenceDemo />
      </Part>

      <Part wide n="37" title="Step editor and copilot" tokens={["write | preview at 760px of its own width, tabs below", "missing: negative-50 [key] · fallback: caution-50", "cites: action-subtle 14px markers → KB line", "provenance: source · what · age (M4)"]}
        notes={<p>You write with variables and read the real email: pick any company in the audience and see exactly what it gets, with every filled-in value traced to where Corral found it. A variable that&rsquo;s empty for some companies says how many, and offers a fallback. Corral&rsquo;s draft uses only lines from the product&rsquo;s knowledge base, numbers each claim to its line, and says what it left out and why, such as the price while two sources disagree.</p>}>
        <StepEditorDemo />
      </Part>

      <Part wide n="38" title="Mailbox pool" tokens={["q-box card · negative-200 / caution-200 outline for problems", "warm-up: 14 segments, info-600", "health dot: positive · caution · negative", "daily cap: c-seg 20 · 30 · 35"]}
        notes={<p>Each mailbox is a card that answers four questions: is it sending, how much today, is it still warming up, and is its reputation healthy. Problems sort first and say what happened, what Corral already did about it, and the one action left, such as Reconnect. A bounce spike rests the mailbox until the next morning on its own; you can see the bounces or send again now.</p>}>
        <PoolDemo />
      </Part>

      <Part wide n="39" title="Unibox panes and triage" tokens={["u-chip 26px · is-on surface-selected", "triage dots: positive · caution · referral · neutral · negative", "menu 320px: label, what Corral does, key 1–6", "handled: out of Needs you, in All"]}
        notes={<p>Three panes, extended rather than rebuilt: the M1 list, reading pane and rail take optional pieces. Chips over the list filter by triage and unread, with counts from the tab. Every reply is one of six kinds, each with a key and a sentence about what Corral does next. Out of office, unsubscribes and bounces are handled on their own, so they leave Needs you and wait in All with a note saying what was done.</p>}>
        <UniboxTriageDemo />
      </Part>

      <Part wide n="40" title="Thread view" tokens={["u-msg: surface-muted, one line until opened", "email as plain text: quoted folded, images blocked", "rail: fit (M5) · sequence trail (M6) · mailbox", "trail dot: action ring = the step they replied to"]}
        notes={<p>The thread reads oldest first, each earlier step one line until you open it. The reply is rendered as text, never raw HTML: quoted history is folded and remote images wait for a click, so opening an email tells no one you read it. The rail says why the company fits, which sequence the reply came from and what it won&rsquo;t send now, and which mailbox the answer goes from.</p>}>
        <ThreadViewDemo />
      </Part>

      <Part wide n="41" title="Copilot draft states" tokens={["c-reply--caution / --negative: 200 outline", "cites: info-50 mono markers → KB line", "u-gap: caution-50 underline on the unsure sentence", "undo ring: conic --color-action, 10s"]}
        notes={<p>Corral drafts from the knowledge base and shows its work: every claim is numbered to its line, what it left out is said, and a sentence it can&rsquo;t support is marked and phrased as a question. It won&rsquo;t draft Never-say claims at all. Your edits are checked for Never-say and prices before they send. Send waits 10 seconds for Undo; failures keep your words; a disconnected mailbox or a teammate&rsquo;s reply holds the send and says why.</p>}>
        <CopilotStatesDemo />
      </Part>

      <Part wide n="42" title="Handoffs" tokens={["h-meet: canvas card, border + 1px shadow; gone = surface-muted", "h-pill: live · positive · caution · negative · neutral", "h-steps: Ca · Px · As tiles 22px", "h-problem: negative-50 / caution-50, 200 inset"]}
        notes={<p>A booking is an event in the thread, where it happened, with who is coming and what Corral did about it. Three handoffs follow it: the meeting (Cal.com), the deal (Phoenix ERP) and the follow-up (AutoSend), each one line with its state. A move changes all three quietly. A cancellation or a no-show goes back to Needs you with a draft for a person, and the deal stays open. Corral stops and asks when Phoenix refuses a deal or already has the company; it never merges on its own.</p>}>
        <HandoffDemo />
      </Part>

      <Part wide n="43" title="Integrations" tokens={["i-row: tile 32 · name · role · pill · one action", "i-flow: 4 steps, dot = connection health", "i-log: mono time and event, redacted secrets, Replay", "i-maptable: Required tag, negative-50 row for an issue"]}
        notes={<p>Settings says what each connection is for before asking you to connect it, and what Corral may and may never do. A connection that needs you says what broke, what is waiting and the one action to fix it; nothing is lost while it waits. Every push and delivery is logged with what went and what came back, secrets redacted, and a failed push replays with the same idempotency key. Phoenix&rsquo;s field mapping shows what Grace&rsquo;s deal would carry and won&rsquo;t save while a required field is empty.</p>}>
        <IntegrationsDemo />
      </Part>

      <Part wide n="44" title="Developers" tokens={["m-code: surface-muted, mono 12/18, one Copy; the secret on canvas, 14/22", "m-access: area · what the level allows · None / Read / Write (/ Send, signed-in only)", "m-status: dot + word; m-scope: mono tag, write = info-50, send = caution-50", "m-ro: Read-only tag + disabled actions with who can", "m-docs: 30/36 title, numbered sections, sticky On this page"]}
        notes={<p>A developer surface in Corral&rsquo;s own voice. MCP comes first: an AI client signs in as a person and gets only the areas they allow, and every call it makes is listed with what came back. API keys are for jobs that run without a person, so they draft but never send: sending needs a signed-in connection. Owners manage every key and members their own; someone else&rsquo;s key is read-only with who can change it. The secret shows once, each key says what it can reach and when it was last used, rotating keeps the old one for 24 hours, and an expired key that something still calls says so. The docs are written like a page: how to connect each client, the fifteen tools with a real call from this workspace, and the guardrails that hold whoever calls.</p>}>
        <DevelopersDemo />
      </Part>

      <Part n="45" title="Things that float" tokens={["--shadow-pop", "--radius-window 14", "--color-surface-inverse"]}
        notes={<p>Only moments float: a booked meeting, a reply worth seeing, a toast. Faces are film-graded photos in circles, one treatment for everyone.</p>}>
        <div className="sg-float">
          <MeetingCard />
          <div className="sg-float__col"><PersonCard /><Toast meta="Cal.com">Brian Kamau booked Thu 10:30</Toast>
            <div className="sg-faces">{["wanjiru", "kamau", "amara", "grace", "reza", "sofia"].map((a, i) => <Avatar key={a} id={a} size={([48, 36, 28, 24, 20, 20] as const)[i]} />)}</div></div>
        </div>
      </Part>
      <Part wide n="46" title="Every state" tokens={["lib/states: SURFACES · kindOf · gaps · allStates", "Skeleton / SkeletonTable / SkeletonThreads / AppSkeleton", "EmptyState: title, one line, one action", "ErrorState: title, nothing lost, Try again, GET … · status"]}
        notes={<><p>Every review state in the app, from one index, by the kind of moment it is. Each surface has an empty, a loading and an error state, or says why it doesn&rsquo;t; the test in <code>lib/states</code> fails if one goes missing. Click any state to open it.</p><p>One voice: an empty state says what goes here and the one thing to do; an error says what failed, that nothing was lost, <em>Try again</em> in blue, and the request in mono (<code>GET /api/v1/… · 503</code>). Titles use ’, never &apos;. One skeleton system at real row heights; nothing spins where a skeleton fits.</p></>}>
        <div id="every-state"><EveryStateDemo /></div>
      </Part>

      <footer className="sg-foot">Sample content: people, companies and numbers are illustrative. Photos from Unsplash and Pexels, reference only.</footer>
    </main>
  );
}
