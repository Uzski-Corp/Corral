import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./styleguide.css";
import Link from "next/link";
import { AccountStatesDemo, CodeStatesDemo, CmdkDemo, ContrastDemo, FormDemo, OverlayDemo, SessionErrorDemo, ShellDemo, StatesDemo, TabsToastDemo } from "./M1Sections";
import {
  Avatar, Button, ContextRail, Field, FilterBar, FitBar, Input, LEADS, Logo, MeetingCard, PersonCard, Receipt, Receipts,
  ReadingPane, ReplyCard, SegmentTable, SegmentWindow, Segmented, Tag, THREADS, ThreadList, Toast, Toggle, Mark,
} from "@/components/app";

export const metadata: Metadata = { title: "Corral — App language (Open Range)" };

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
            <div className="sg-form__row"><span>Pause sequences on any reply</span><Toggle on /></div>
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

      <Part n="20" title="Things that float" tokens={["--shadow-pop", "--radius-window 14", "--color-surface-inverse"]}
        notes={<p>Only moments float: a booked meeting, a reply worth seeing, a toast. Faces are film-graded photos in circles, one treatment for everyone.</p>}>
        <div className="sg-float">
          <MeetingCard />
          <div className="sg-float__col"><PersonCard /><Toast meta="Cal.com">Brian Kamau booked Thu 10:30</Toast>
            <div className="sg-faces">{["wanjiru", "kamau", "amara", "grace", "reza", "sofia"].map((a, i) => <Avatar key={a} id={a} size={([48, 36, 28, 24, 20, 20] as const)[i]} />)}</div></div>
        </div>
      </Part>
      <footer className="sg-foot">Sample content: people, companies and numbers are illustrative. Photos from Unsplash and Pexels, reference only.</footer>
    </main>
  );
}
