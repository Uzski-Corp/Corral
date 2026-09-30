# Corral: engineering handoff (M1)

For Krak. **The code is the design.** Paper is unavailable, so the source of truth for M1 is the Next.js client at `client/` (Next 16.3.6, React 19.2, Tailwind v4 via `@tailwindcss/postcss`, pnpm). Build UI by copying from `components/app/` and composing with the tokens below. If a screen needs something not covered here, ask; don't invent a new colour, size or shadow.

Everything shown uses sample content (ColdTrace Sensors selling to East African food and beverage companies). People, companies and numbers are illustrative. Photos are reference-only and not released for production.

## 1. Run it

```bash
cd client && pnpm install && pnpm dev     # pnpm 12 (see packageManager)
```

| Route | What it is | Review states |
|---|---|---|
| `/app` | Shell + Unibox home (live: views, ⌘K, J/K/E, enroll dialog, toasts) | `?cmdk=1` palette open · `?view=companies`, `contacts`, `segments`, … · `?collapsed=1` · `?nav=1` (mobile drawer) · `?dialog=enroll` |
| `/sign-in` | Email six-digit code (WorkOS Magic Auth) + Google | `?state=sent` (code entry) · `code-verifying` · `code-wrong` · `code-expired` · `code-attempts` · `code-resent` · `resend-limited` · `verify-limited` · `code-failed` · `change-email` · `error` (sign-in didn't finish) · `invalid` · `cancelled` · `unavailable` (see §9) |
| `/app?view=knowledge` | Knowledge base for one product (live: upload and reading simulators, edit, remove with Undo) | `&state=empty` · `drafting` · `loading` · `error` · `sources` · `source` · `partial` · `failed` · `upload` · `upload-errors` · `dragging` · `tray` · `editing` · `save-error` · `conflict` (see §10) |
| `/app?view=companies` | Leads: the Companies table with sorting, selection, bulk bar, detail rail, filters as rules, CSV import (live) | `&state=loading` · `error` · `empty` · `no-results` · `partial` · `selected` · `select-all` · `bulk-confirm` · `bulk-running` · `status-menu` · `detail` · `duplicate` · `import` · `import-file-error` · `import-map` · `import-map-errors` · `import-review` · `import-running` · `import-done` (see §11) · M4: `stale` · `provenance` (see §12) · M5: `fit` · `fit-scoring` · `fit-none` · `fit-low` · `fit-changed` · `fit-override` · `fit-disagree` · `fit-error` (see §13) · M8: the seven handoff states open Nyota Beverages with **Meeting and handoffs** (see §16) |
| `/app?view=discovery` | Discovery runs: find companies that fit a product, watch them enrich, see where every field came from (live: the running run ticks forward) | `&state=empty` · `loading` · `error` · `new` · `new-error` · `queued` · `running` · `done` · `partial` · `failed` · `rate-limited` · `zero` · `detail` (see §12) |
| `/app?view=sequences` | Sequences: the builder (steps, waits and conditions), the step editor with a preview against a real company, Corral's cited draft, launch checks, launch, run, pause; and the **Mailbox pool** tab (live: launch ticks through its checks, pause/resume, reconnect, caps) | `&state=empty` · `loading` · `error` · `draft` · `conditions` · `editor` · `copilot` · `errors` · `launch` · `launching` · `running` · `paused` · `mailboxes` (see §14) |
| `/app?view=unibox` (or `/app`) | Unibox (M7): three panes with filter chips and triage (six kinds, keys 1–6), the thread with its earlier steps, lead fit (M5) and source sequence (M6), and Corral's draft in every state from drafting to send-with-undo (live: triage, filters, drafting, edit checks, send → undo → sent, retry, reconnect, conflict) | `&state=panes` · `filtered` · `triage-menu` · `referral` · `ooo` · `unsubscribe` · `bounce` · `thread` · `keys` · `drafting` · `draft` · `low` · `refused` · `edited` · `undo` · `sending` · `sent` · `failed` · `disconnected` · `conflict` · `conflict-lead` (M9) · `empty` · `loading` · `error` (see §15) · M8: `meeting-booked` · `meeting-rescheduled` · `meeting-cancelled` · `meeting-no-show` · `deal-error` · `deal-duplicate` · `nurture-off` (see §16) |
| `/app?view=settings` | Settings (M8): the sub-nav (Workspace, Team, Mailboxes →, **Integrations**, Billing; **Developers** since M9) with **Integrations** designed: Cal.com, Phoenix ERP and AutoSend, the handoff flow, connect / reconnect / disconnect, per-integration logs, Phoenix field mapping and permissions (live: connect each, disconnect with Reconnect, open and filter logs, replay, remap fields) | `&state=integrations` · `none` · `connect-cal` · `connecting` · `connect-erp` · `connect-erp-failed` · `connect-autosend` · `connected` · `reauth` · `error` · `disconnect` · `logs` · `mapping` · `mapping-errors` · `scopes` · `autosend` · `loading` · `load-error` (see §16) |
| `/app?view=settings` → Developers | Settings → Developers (M9): **MCP** (connect Cursor, Claude, Claude Code, VS Code or any client with a copyable config; connected clients, what each may do, every call, errors, disconnect; the OAuth consent page), **API keys** (create with scopes per area, the secret once, last used, rotate with a 24 h overlap, revoke, an expired key still being called) and **Docs** (the MCP server and API: connect, 15 tools with calls and results, guardrails, errors, limits) (live: create / rotate / revoke / replace keys, connect → waiting → connected, disconnect, search and open tools) | `&state=mcp` · `mcp-empty` · `mcp-connect` · `mcp-connect-claude` · `mcp-connect-key` · `mcp-consent` · `mcp-waiting` · `mcp-connected` · `mcp-activity` · `mcp-error` · `mcp-revoke` · `mcp-loading` · `keys` · `keys-empty` · `key-create` · `key-create-errors` · `key-reveal` · `key-rotate` · `key-rotated` · `key-revoke` · `key-expired` · `keys-error` · `docs` · `docs-tool` · `docs-search-empty` (see §17) |
| `/app?view=segments` | A saved segment (live rules, same table) and the segment builder | `&state=builder` · `builder-empty` · `builder-error` · `loading` · `error` · `selected` · `detail` (see §11) |
| `/app?view=contacts` | Contacts (M10 states): the table, with its loading, empty and error states | `&state=loading` · `empty` · `error` (see §18) |
| `/open-range` · `/fenceline` | The two landings (M10: real app screens and components, not mock-ups; which one is `/` at launch is open) | — |
| `/pricing` · `/security` · `/mcp` · `/changelog` · `/legal/terms` · `/legal/privacy` · `/legal/dpa` | The marketing pages (M10, §18). Legal is an outline, `noindex` until Counsel's text lands | — |
| any unknown URL | The 404 (`app/not-found.tsx`) | — |
| `/styleguide/share` | The seven 1200×630 share images, composed from live components; screenshotted to each route's `opengraph-image.jpg` (M10) | — |
| `/onboarding` | 5-step workspace setup with progress and skip | `?step=1…6` (6 = done) · `?skipped=3,4,5` · `?crawl=done` · `?mailbox=1` |
| `/styleguide` | Every component, live, where it is used (sections 01–46; **§46 Every state** (M10) indexes every review state; knowledge base is 20–24, leads 25–29, discovery and provenance 30–33, fit score 34–35, sequences and the mailbox pool 36–38, Unibox, thread and draft states 39–41, handoffs and integrations 42–43, developers 44) | — |

Keyboard in `/app`: ⌘K / Ctrl+K palette · `[` collapse sidebar · `G` then `I C D P S Q R K ,` to jump (`D` = Discovery, M4) · `J`/`K` next/previous thread · `E` archive (with Undo toast) · Esc closes the top layer. Unibox (M7) adds `↵` open · `1`–`6` triage · `T` triage menu · `R` reply · `⌘↵` send · `⌘Z` undo send · `H` snooze · `?` the shortcuts sheet (§15).

## 2. Where things live

```
app/globals.css                    @theme static { … }  all app tokens (the token source)
app/layout.tsx                     next/font: Inter (--font-inter), Geist Mono (--font-geist-mono); marketing faces too
components/app/app.css             c-* classes for core components (table, fit bar, tags, unibox, reply card, inputs, buttons)
components/app/system.css          c-* classes for M1: shell, overlays, form controls, tabs, states, ⌘K, motion
components/app/screens/screens.css s-* classes for sign-in and onboarding only
components/app/*.tsx               React components (barrel: import { … } from "@/components/app")
components/app/data.ts             sample data. Replace with real queries; the shapes are a starting contract
components/app/AppDemo.tsx         the /app composition (views, commands, enroll dialog). Copy the wiring, not the data
components/marketing/*             marketing only. Never import marketing tokens into product UI
components/marketing/site/*        M10: the shared site (nav, footer, pages, ProductFrame, Screen, pieces). Import deep paths, never the app barrel (§18 decision 8)
lib/marketing/*, lib/states/*      M10: what the site says (routes, plans, claims, share cards) and the index of every state
```

All component CSS sits in `@layer components`, so Tailwind utilities in `className` always win over it. That is how you adjust layout around a component without forking it.

## 3. How to use the tokens

1. **Reach for a component first.** Buttons, tags, fit bars, inputs, menus and dialogs already encode the rules. `<Button variant="primary">`, not a styled `<button>`.
2. **Compose new layout with Tailwind utilities generated from the tokens** (table below): `h-toolbar px-5 border-b border-border-subtle`, `text-label text-text-tertiary`, `rounded-card shadow-pop`.
3. **In CSS, use the variables:** `var(--color-border-subtle)`, `var(--spacing-row)`. They always exist because the theme is `@theme static`.
4. **Never write raw hex or px for anything listed here.** Tailwind's default palette (`bg-blue-500`, `text-gray-600`) is still compiled in; treat it as off-limits. (Optional hardening: add `--color-*: initial;` at the top of the `@theme` block once you've confirmed the marketing CSS doesn't depend on the defaults.)
5. Arbitrary values (`h-[37px]`) need a design review. The only sanctioned one-offs are inside `app.css` and `system.css`.

### Token → Tailwind utility (every token in `app/globals.css`)

Checked against Tailwind v4's compiler: every utility below is generated.

| Token | Value | Utility |
|---|---|---|
| `--color-canvas` | `#FFFFFF` | `bg-canvas` |
| `--color-surface-muted` | `#FAFAFA` | `bg-surface-muted` |
| `--color-surface-sunken` | `#F5F5F4` | `bg-surface-sunken` |
| `--color-surface-selected` | `#F5F8FE` | `bg-surface-selected` |
| `--color-surface-inverse` | `#1C1C1C` | `bg-surface-inverse` |
| `--color-border` | `#E7E7E5` | `border-border` · `divide-border` |
| `--color-border-subtle` | `#F0F0EE` | `border-border-subtle` · `divide-border-subtle` |
| `--color-border-strong` | `#D4D4D1` | `border-border-strong` · `divide-border-strong` |
| `--color-border-control` | `#8F8F8C` | `border-border-control` · `ring-border-control` · `bg-border-control` (switch-off track) |
| `--color-text` | `#1C1C1C` | `text-text` (yes, `text-text`) |
| `--color-text-body` | `#292929` | `text-text-body` |
| `--color-text-secondary` | `#4F4F4F` | `text-text-secondary` |
| `--color-text-tertiary` | `#5F5F5F` | `text-text-tertiary` |
| `--color-text-quaternary` | `#6A6A6A` | `text-text-quaternary` |
| `--color-text-disabled` | `#A1A1A1` | `text-text-disabled` (disabled controls only) |
| `--color-text-inverse` | `#FFFFFF` | `text-text-inverse` |
| `--color-scrim` | `rgb(28 28 28 / 0.22)` | `bg-scrim` |
| `--color-action` | `#1F5FD6` | `bg-action` |
| `--color-action-hover` | `#1A51B8` | `hover:bg-action-hover` |
| `--color-action-subtle` | `#EEF3FC` | `bg-action-subtle` |
| `--color-action-ring` | `rgb(31 95 214 / 0.28)` | `ring-action-ring` · `outline-action-ring` |
| `--color-action-2` | `#1C1C1C` | `bg-action-2` |
| `--color-action-2-hover` | `#333333` | `hover:bg-action-2-hover` |
| `--color-fit-on` | `#1F5FD6` | `bg-fit-on` |
| `--color-fit-low` | `#B3B3B0` | `bg-fit-low` |
| `--color-fit-off` | `#E7E7E5` | `bg-fit-off` |
| `--color-positive-50` | `#ECFDF5` | `bg-positive-50` |
| `--color-positive-200` | `#A7F3D0` | `border-positive-200` · `ring-positive-200` |
| `--color-positive-600` | `#047857` | `text-positive-600` |
| `--color-caution-50` | `#FFFBEB` | `bg-caution-50` |
| `--color-caution-200` | `#FDE68A` | `border-caution-200` · `ring-caution-200` |
| `--color-caution-600` | `#A35A04` | `text-caution-600` |
| `--color-negative-50` | `#FFF1F2` | `bg-negative-50` |
| `--color-negative-200` | `#FECDD3` | `border-negative-200` · `ring-negative-200` |
| `--color-negative-600` | `#BE123C` | `text-negative-600` |
| `--color-neutral-50` | `#F5F5F4` | `bg-neutral-50` |
| `--color-neutral-200` | `#E7E5E4` | `border-neutral-200` · `ring-neutral-200` |
| `--color-neutral-600` | `#57534E` | `text-neutral-600` |
| `--color-info-50` | `#EFF6FF` | `bg-info-50` |
| `--color-info-200` | `#DBEAFE` | `border-info-200` · `ring-info-200` |
| `--color-info-600` | `#2563EB` | `text-info-600` |
| `--color-referral-50` | `#F5F3FF` | `bg-referral-50` |
| `--color-referral-200` | `#DDD6FE` | `border-referral-200` · `ring-referral-200` |
| `--color-referral-600` | `#7C3AED` | `text-referral-600` |
| `--font-sans` | `var(--font-inter), ui-sans-serif, system-ui, sans-serif` | `font-sans` |
| `--font-mono` | `var(--font-geist-mono), ui-monospace, monospace` | `font-mono` |
| `--text-meta` | `12px / 16px` | `text-meta` (size + line height) |
| `--text-label` | `13px / 18px` | `text-label` (size + line height) |
| `--text-content` | `14px / 20px` | `text-content` (size + line height) |
| `--text-lead` | `16px / 24px` | `text-lead` (size + line height) |
| `--text-title` | `18px / 24px` | `text-title` (size + line height) |
| `--text-heading` | `24px / 30px` | `text-heading` (size + line height) |
| `--font-weight-normal` | `400` | `font-normal` |
| `--font-weight-medium` | `500` | `font-medium` |
| `--tracking-ui` | `-0.15px` | `tracking-ui` |
| `--tracking-heading` | `-0.4px` | `tracking-heading` |
| `--spacing` | `4px` | `p-4` = 16px, `gap-2` = 8px … (multiples of 4) |
| `--spacing-row` | `40px` | `h-row` · `w-row` · `min-h-row` · `p-row` … |
| `--spacing-row-compact` | `36px` | `h-row-compact` · `w-row-compact` · `min-h-row-compact` · `p-row-compact` … |
| `--spacing-nav` | `28px` | `h-nav` · `w-nav` · `min-h-nav` · `p-nav` … |
| `--spacing-tag` | `22px` | `h-tag` · `w-tag` · `min-h-tag` · `p-tag` … |
| `--spacing-chip` | `24px` | `h-chip` · `w-chip` · `min-h-chip` · `p-chip` … |
| `--spacing-btn` | `32px` | `h-btn` · `w-btn` · `min-h-btn` · `p-btn` … |
| `--spacing-btn-sm` | `28px` | `h-btn-sm` · `w-btn-sm` · `min-h-btn-sm` · `p-btn-sm` … |
| `--spacing-toolbar` | `52px` | `h-toolbar` · `w-toolbar` · `min-h-toolbar` · `p-toolbar` … |
| `--spacing-sidebar` | `220px` | `h-sidebar` · `w-sidebar` · `min-h-sidebar` · `p-sidebar` … |
| `--spacing-rail` | `300px` | `h-rail` · `w-rail` · `min-h-rail` · `p-rail` … |
| `--spacing-sidebar-collapsed` | `56px` | `h-sidebar-collapsed` · `w-sidebar-collapsed` · `min-h-sidebar-collapsed` · `p-sidebar-collapsed` … |
| `--spacing-dialog` | `440px` | `h-dialog` · `w-dialog` · `min-h-dialog` · `p-dialog` … |
| `--spacing-cmdk` | `640px` | `h-cmdk` · `w-cmdk` · `min-h-cmdk` · `p-cmdk` … |
| `--radius-check` | `4px` | `rounded-check` |
| `--radius-tag` | `6px` | `rounded-tag` |
| `--radius-input` | `7px` | `rounded-input` |
| `--radius-button` | `8px` | `rounded-button` |
| `--radius-card` | `12px` | `rounded-card` |
| `--radius-window` | `14px` | `rounded-window` |
| `--shadow-window` | `0 40px 100px rgb(24 36 60 / 0.24), 0 0 0 1px rgb(0 0 0 / 0.05)` | `shadow-window` |
| `--shadow-pop` | `0 14px 36px rgb(24 36 60 / 0.16), 0 0 0 1px rgb(0 0 0 / 0.05)` | `shadow-pop` |
| `--shadow-dialog` | `0 24px 64px rgb(24 36 60 / 0.22), 0 0 0 1px rgb(0 0 0 / 0.06)` | `shadow-dialog` |
| `--shadow-button` | `inset 0 0 0 1px rgb(0 0 0 / 0.10), 0 1px 1px rgb(0 0 0 / 0.06)` | `shadow-button` |
| `--ease-snap` | `cubic-bezier(0.23, 1, 0.32, 1)` | `ease-snap` |
| `--duration-press` | `140ms` | `duration-140` (no namespace; use the number) |
| `--duration-pop` | `180ms` | `duration-180` (no namespace; use the number) |

Colour tokens also work with every colour utility (`fill-*`, `stroke-*`, `ring-*`, `outline-*`, `divide-*`), but use them only in the roles below.

### Roles (what each token is for)

- **Surfaces:** `canvas` for windows and main panels. `surface-muted` for the shell frame, sidebar and quoted mail. `surface-sunken` for chips, hover, active thread and skeletons. `surface-selected` for selected rows only. `surface-inverse` for toasts and tooltips only.
- **Text ladder:** `text` for names, values and titles. `text-body` for message bodies. `text-secondary` for default UI copy. `text-tertiary` for labels, column heads and receipts. `text-quaternary` for timings, domains and placeholders. `text-disabled` only for disabled controls. Every text grey passes 4.5:1 on the darkest surface it sits on (see §8).
- **Action:** `action` is the one primary button per surface, focus rings, checked controls and the unread dot. `action-2` (near-black) is the second commitment (onboarding and empty states). Nothing else is blue except the fit bar and the mailbox-pool meter (data).
- **Status triples:** `*-50` fill, `*-200` inset border, `*-600` text. Use them only through `<Tag>`, `<Banner>`, error text and the error icon.
- **Elevation:** only floating things have shadows. `shadow-pop` for menus, selects, date pickers and cards. `shadow-dialog` for dialogs and ⌘K. `shadow-window` is marketing only. Panels use a 1px `border` ring, not a shadow.

## 4. Do and don't (from the Rico specs, measured in `taste/TASTE.md`)

Sources: @_heyrico posts [2015453625791979955](https://x.com/_heyrico/status/2015453625791979955), [2081394621775859863](https://x.com/_heyrico/status/2081394621775859863), [2079628240944263565](https://x.com/_heyrico/status/2079628240944263565), [2102049978592219344](https://x.com/_heyrico/status/2102049978592219344) and [2033891267688730721](https://x.com/_heyrico/status/2033891267688730721), plus the Emil Kowalski motion rules in `corral.md`.

**Do**
- Use **Inter at −0.15px everywhere** (`tracking-ui`). Headings use `tracking-heading`. *(Rico: "Letter-spacing: -0.15px".)*
- Keep type to **12 / 13 / 14 / 16 / 18 / 24** (`text-meta` through `text-heading`). 13 is the base. The biggest thing in the product is 24px. *(Rico: "12px, 13px (base size), 14px, 16px, 18px, and 24px (the biggest)".)*
- Use **two weights only**: 400 and 500 (`font-normal`, `font-medium`). Semibold appears only in letter logos and workspace tiles. *(Rico: "Only 2 font weights".)*
- **Build hierarchy with the grey ladder, not size.** Company name and data share one size and differ only in colour. *(Rico: "#292929, #5D5D5D, and #9E9E9E". We keep his three-step idea at AA values: #4F4F4F / #5F5F5F / #6A6A6A, see §8.)*
- Make **menu and nav rows 28px** (`h-nav`) with #404040 text. Use **40px table rows** (`h-row`, or `h-row-compact` 36 for dense lists), **22px tags** (`h-tag`, 6px radius, 13/18 Medium) and **12px checkboxes** with a 4px radius. *(Rico CRM spec.)*
- Stick to the radius ladder **4 / 6 / 7 / 8 / 12 / 14**: check, tag, input, button, card, window. *(Rico: "Radius: 7px across most components", "Stick to 8-12px".)*
- Put **heavy data on grey**: the shell frame is `surface-muted` and the working panel is white inside it. *(Rico: "ALWAYS make sure to have a gray background behind".)*
- Use **tags as a 50 / 200 / 600 triple**, the same for every hue. *(Rico: "use 100 for border and 500 for text … same with other color"; we use 200/600 for contrast.)*
- Use **icons at 14px, stroke 1.4**, in `text-tertiary`, going darker on hover or active. For brand logos, use only `GoogleG` and `MicrosoftMark` on their own buttons.
- **Show AI work as receipts** (`<Receipt>`): what was done, source and time.
- Use **tabular numbers** (`c-num` / `tabular-nums`) for scores, counts and timers.
- Apply **motion:** buttons press to scale(.97) over 140ms. Popovers enter over 180ms from scale(.96) + opacity 0 with `ease-snap`. ⌘K opens with zero delay. Respect `prefers-reduced-motion` (already in `system.css`).
- **Give every icon-only control a tooltip naming it and its key**, and an `aria-label`.

**Don't**
- Don't put more than **one blue button on a surface**. A dialog footer is Cancel (default) + one primary. Destructive actions are a menu item in `negative-600`, never a red button.
- Don't use **gradients, glows, sparkles or coloured panels** in product UI. The only images inside the product are the small Open Range crop in empty states (`<EmptyState art>`) and the sign-in and onboarding brand moments.
- Don't use **bold (600+)** in running UI, and don't use sizes outside the scale (no 15px labels, no 32px page titles).
- Don't put **shadows on non-floating panels**. Use a 1px `border` / `border-subtle` ring.
- Don't use **colour for anything that isn't state or the one action.** No blue links in tables; names are `text`.
- Don't use **mono for eyebrows or section numbers.** Mono (`font-mono`) is for domains, IDs, key hints and technical detail in errors.
- Don't put **sentences in tooltips.** If it needs a sentence, it belongs in help text under the field.
- Don't show **help and error together.** The error replaces the help and says what to do next.
- Don't use **spinners for page loads.** Use skeletons at real row heights (`<SkeletonTable>`, `<SkeletonThreads>`). Spinners are only for inside a button or a status line.
- Don't use **marketing tokens (`--mk-*`) or marketing fonts** (Inter Tight, Newsreader) in product UI. The single exception is the sign-in line "Every row ends in a person."

## 5. Component APIs (`import { … } from "@/components/app"`)

(C) marks a client component. Defaults are in brackets.

### Shell and navigation
- `AppShell` (C): `{ active: ViewId; onNavigate?(v); crumbs: ReactNode[]; actions?; children; collapsed?; onCollapsedChange?(b); defaultCollapsed? [false]; defaultDrawer? [false]; onSearch?(); frame? ["viewport" | "contained"]; segment?; onSegment?(s); hotkeys? [true] }`. Under 768px of its own width (container query) it switches to the top bar and drawer. `frame="contained"` fills its parent.
- `SideNav` (C): `{ active; onNavigate?; collapsed?; onSearch?; segment?; onSegment? }`. Nav comes from `APP_NAV` (`{ id, label, icon, count?, keys }`) and `SAVED_SEGMENTS`.
- `TopBar` (C): `{ crumbs; actions?; onToggleSide?; onMenu?; onSearch?; collapsed? }`. On mobile only `.c-btn--primary` actions stay visible.
- `WorkspaceSwitcher` (C): `{ collapsed?; defaultOpen?; account?; onSignOut? }`. `WorkspaceTile`: `{ letter? ["C"]; size? [20]; tone? ["ink" | "blue" | "sand" | "muted"] }`.
- `ShellAccountProp` = `{ name, email, role, avatarUrl, workspace }` | `"loading"` | `"unavailable"` | `undefined` (sample person). `AppShell`, `SideNav`, `WorkspaceSwitcher` and `AppDemo` take `account` and `onSignOut`. `"unavailable"` also hides nav counts and the mailbox pool, since they weren't fetched.
- `AccountRow` (C): `{ account?; collapsed? }` plus button props. The sidebar foot row, in all five states.
- `Monogram`: `{ name; email?; size? [20 | 24 | 28 | 36 | 48]; label? }`. Initials on `neutral-200` with `neutral-600` (6.08:1). `initialsOf(name, email?)` → "AO".
- `Sidebar`: the older static sidebar used inside marketing windows. Don't use it in the app.

### Command menu
- `CommandPalette` (C): `{ open; onClose(); commands: Command[]; recent: Command[]; entities: Command[]; fallback?(q) => Command; latency? [420]; inline?; defaultQuery?; forceLoading?; entityCount? }`.
- `Command`: `{ id; label; group; keywords?; icon?; lead?; sub?; meta?; kbd? ("G I"); run() }`. Groups "Navigate" and "Actions" show with an empty query; `entities` are searched. Replace the `latency` simulation with your search promise and keep the same skeleton while it is pending.
- `buildCommands(handlers)` (in `AppDemo.tsx`) is the full M1 command set.

### Overlays
- `Dialog` (C): `{ open; onClose(); title; description?; children?; footer?; width? [440]; inline?; tone?: "danger" }`. It focuses the first control and closes on Esc or a scrim click.
- `DropdownMenu` (C): `{ trigger: (p) => ReactNode; items: MenuEntry[]; align? ["start" | "end"]; side? ["bottom" | "top"]; width? [220]; defaultOpen?; label? }`. Spread `p` onto your trigger button. `MenuEntry` = `{ label, icon?, kbd?, meta?, lead?, checked?, danger?, disabled?, onSelect? }` | `{ heading }` | `"separator"`. ↑↓ move, ↵ picks, Esc closes.
- `Tooltip` (C): `{ label; kbd?; side? ["top" | "bottom" | "right"]; open? }`, with a 400ms delay.
- `ToastProvider` (C) + `useToast()` → `toast({ children; meta?; tone? ["default" | "success" | "error"]; icon?; action?: { label, onClick }; duration? [4000] })`. `Toast` renders one statically. Keep it to one line with at most one action. Up to 3 stack bottom-centre.
- `useDismiss(ref, open, onClose)`: outside-click and Esc, for your own popovers.

### Form controls
- `FormField` (C): `{ label; help?; error?; optional?; action?; children }`. It wires `id`, `aria-describedby` and `aria-invalid` into the control inside.
- `TextInput` (C): native input props plus `{ icon?; prefix?; suffix?; invalid? }`. `Textarea` (C): native props plus `{ invalid? }`.
- `Select` (C): `{ value; onChange?(v); options: { value, label, meta?, lead? }[]; placeholder?; width?; icon?; defaultOpen? }`. Use it for fewer than 12 options (a combobox is M2).
- `DatePicker` (C): `{ value: Date | null; onChange?(d); today: Date; min?; placeholder?; quick?: [label, Date][]; defaultOpen? }`. `Calendar` is the bare grid. The demo passes `DEMO_TODAY`; use `new Date()` in production.
- `Checkbox` (C): `{ checked; indeterminate?; onChange?(b); label; description?; disabled? }`.
- `RadioGroup` (C): `{ value; onChange?(v); options: { value, label, description?, lead?, disabled? }[]; variant? ["list" | "cards"]; label? }`. Arrow keys move the selection.
- `Switch` (C): `{ checked; onChange?(b); label?; description?; disabled? }`.
- `Segmented`: `{ options: string[]; value; onChange?(v); label? }`. It is static unless `onChange` is given.
- `Tabs` (C): `{ tabs: { id, label, count? }[]; value; onChange?(id); variant? ["line" | "pill"]; label? }`. ←→ move.
- Legacy static mocks for marketing illustrations: `Input`, `Field`, `Check`, `Toggle`. Use the live controls above in product.

### States
- `EmptyState`: `{ title; children?; actions?; icon?; art? ["range" | "grass"]; compact? }`. Say what the place is for, then give one way to fill it.
- `ErrorState`: `{ title; children?; detail? (mono); actions? }`. Say what failed and whether anything was lost, then offer a retry.
- `Banner`: `{ tone? ["info" | "error" | "caution" | "success"]; title?; children?; action?; icon? }`.
- `SessionUnavailable` (C): `{ onRetry?() => Promise<boolean> | boolean; detail? (mono, e.g. "GET /api/v1/auth/me · 503"); checkedAt?; autoRetrySeconds? [30, 0 = off]; statusHref? [`statusUrl()`, i.e. `NEXT_PUBLIC_STATUS_URL`] }`. The body of the full-shell fallback. `AppDemo` takes it as `sessionError`.
- `Skeleton`: `{ w?; h? [10]; r? [4] }` · `SkeletonTable`: `{ rows? [6]; label? }` · `SkeletonThreads`: `{ rows? [5] }` · `Spinner`: `{ size? [14] }`.

### Core (round 3, APIs unchanged except where noted)
- `Button`: `{ variant? ["default" | "primary" | "ink" | "quiet"]; size? ["sm" 28 | "lg" 32]; kbd? }` plus button props.
- `Tag`: `{ status: Status }`.
- `FitBar`: `{ value; size? ["md" | "lg"] }`.
- `Avatar`: `{ id; size? [20 | 24 | 28 | 36 | 48] }`.
- `Logo`: `{ company }`.
- `Receipt`: `{ meta?; live? }` · `Receipts`.
- `Chip` · `Kbd` · `Icon`: `{ name: IconName; size? [14] }` · `Mark`.
- `SegmentTable`: `{ leads?; selected: Set; onToggle?; limit?; hover? }` · `FilterBar`.
- `ThreadList`: `{ threads; active; onPick?; title?; count? }` (new: `title`, `count`) · `ReadingPane`: `{ t }` · `ContextRail`: `{ t }` · `Unibox`.
- `ReplyCard`, `RowDetail`, `PersonCard`, `MeetingCard`.
- `Toast` (new props: `tone`, `action`, `onClose`).

### Screens
- `SignIn` (C, `components/app/screens/SignIn.tsx`): `{ initial? ["default" | "sent" | "error" | "invalid" | "cancelled" | "unavailable" | "code-verifying" | "code-wrong" | "code-expired" | "code-attempts" | "code-resent" | "resend-limited" | "verify-limited" | "code-failed" | "change-email"]; actions? }`. `error` = the sign-in didn't finish (callback error), `cancelled` = backed out at Google, `unavailable` = auth provider down. The code states and `actions.sendCode` / `actions.verifyCode` are specified in §9.
- `CodeInput` (C, `components/app/screens/CodeInput.tsx`): `{ id; value; onChange(code); onComplete?(code); invalid?; disabled?; busy?; describedBy?; autoFocus? }` + ref `{ focus(select?) }`. See §9.
- `Onboarding` (C, `components/app/screens/Onboarding.tsx`): `{ initialStep?; skipped?; crawl?; connected? }`. Steps 1–2 are required and 3–5 are skippable. Skipped steps show in the rail in caution and on the done screen with a "Finish" action.

## 6. Layout, responsive, accessibility

- **Shell:** the frame is `surface-muted`. The main panel has an 8px inset, `rounded-card` and a 1px `border` ring. The sidebar is 220 (`w-sidebar`), 56 collapsed (`w-sidebar-collapsed`). The top bar is 52 (`h-toolbar`) and the tab sub-bar is 40.
- **Unibox:** list 360 (320 under 1000px), a fluid reading pane, and a rail of 300 (`w-rail`, hidden under 1240px). Under 768px the list and reading pane are two screens with a back row.
- **Breakpoints:** the shell uses **container queries** (`@container shell`), not viewport media queries, so it behaves the same embedded or full screen. Sign-in and onboarding use viewport media queries at 900 and 1180.
- **Focus:** a solid 2px `action` outline on `:focus-visible` inside `.c-app` (5.73:1; the 28% ring alone was about 1.6:1). Inputs use the 1px action border plus the 3px `action-ring` halo. Don't remove focus styles.
- **Links:** any `<a>` or `.s-link` inside running text (`p`, `li`, `dd`, field hints, banner and empty-state text) is underlined: 1px at 45% of its colour, full on hover. Use `.c-link` for a link in text anywhere else. Standalone links (nav, footer, buttons) don't need it.
- **Contrast:** 4.5:1 for text below 24px (18.66px bold), 3:1 for control boundaries and large text, measured on the real surface. axe-core is clean for `color-contrast` and `link-in-text-block` on every M1 route and state.
- **Roles:** menus use `role=menu`, the palette uses `combobox` + `listbox` with `aria-activedescendant`, tabs use `tablist`, radios use `radiogroup`, dialogs use `aria-modal`, toasts use `aria-live`.

## 7. What is not final in M1

- Sequences, Products, Knowledge base and Settings render a placeholder inside the final shell. Their layouts are later milestones.
- Contacts reuses the company table as a stand-in.
- Search latency, OAuth, email sign-in codes, crawling and mailbox connection are simulated with timers.
- A combobox (Select with search) and multi-select are not designed yet.

## 8. M1 follow-ups (PR #7 design questions, decided Sep 29)

**Contrast (Q1).** The text ladder, status 600s and control borders were changed to pass WCAG 2.1 AA on the real backgrounds (white, #FCFCFC, #FAFAFA, #F5F5F4, #F5F8FE, hover #F0F0EE, active nav #EBEBE9). Hex values and ratios are in `corral-app-open-range.md` under "Contrast rule".

| Token | Old | New | Ratio (old → new) |
|---|---|---|---|
| `text-secondary` | #5D5D5D | #4F4F4F | 6.58 → 8.19 on white (kept the ladder's steps) |
| `text-tertiary` | #7F7F7F | #5F5F5F | 4.00 → 6.39 on white · 5.35 on #EBEBE9 |
| `text-quaternary` | #A1A1A1 | #6A6A6A | 2.58 → 5.41 on white · 4.53 on #EBEBE9 |
| `text-disabled` (new) | none | #A1A1A1 | disabled only, exempt |
| `border-control` (new) | #D4D4D1 | #8F8F8C | 1.49 → 3.24 (checkbox, radio, switch off) |
| `positive-600` | #059669 | #047857 | 3.58 → 5.21 on #ECFDF5 |
| `caution-600` | #C26A05 | #A35A04 | 3.78 → 5.04 on #FFFBEB |
| `negative-600` | #E11D48 | #BE123C | 4.28 → 5.72 on #FFF1F2 |
| info / referral / neutral 600 | unchanged | | 4.75 / 5.20 / 6.99 on their 50s |
| focus outline | 28% action-ring | solid `action` | ≈1.6 → 5.73 |

You can drop `color-contrast` and `link-in-text-block` from `KNOWN` in `e2e/a11y.spec.ts`. A local axe-core 4.13 pass over every M1 route and state found none. The Companies table still has a separate `aria-required-children` finding (row/cell roles), which isn't a design question.

**Onboarding help link and inline links (Q2).** Links inside running text are underlined (1px at 45% of their colour, full on hover). The rule sits in `system.css`, so "Book 15 minutes", Terms and Privacy, "send a new code" and "open Corral" all get it with no per-link work.

**Sign-in failures (Q3).** Each case has its own screen, all reachable with `?state=` (outside production) and from the callback `?error=` (`lib/auth/signInState.ts#screenForError`):
- `provider_error` → `cancelled`: an info banner that says "You cancelled at Google. No problem, nothing was shared with Corral…". The Google button reads "Try Google again" and the email form stays.
- `auth_unavailable` → `unavailable`: a status screen. "Sign-in is down for a moment", a primary **Try again** (restarts the AuthKit hand-off), a **Status page** link, and "Already signed in on this browser? … open Corral" (→ `/app`) as the fallback. Email codes go through the same provider, so they aren't offered as a fallback; the screen says so. Sign-in codes go through the same provider, so they aren't offered as a fallback either.
- `invalid_request`, `invalid_state`, `auth_failed`, unknown → `error`: the banner "That sign-in didn't finish. It may have timed out or been opened twice. Start again below; it only takes a minute." (was the expired-link banner; there are no links any more).
- Every status link (sign-in footer, **Status page** on `unavailable`, `SessionUnavailable`) reads `statusUrl()` from `lib/config.ts`, i.e. **`NEXT_PUBLIC_STATUS_URL`** (an http(s) URL, a `/path` or a `#fragment`; `#status` only when it is unset). Set it per environment; a malformed value throws a `ConfigError`.

**Session check failing (Q7).** If `/me` fails with 502/503/504, a timeout or a network error before any session is confirmed, the shell stays up and its body becomes `<SessionUnavailable>`. It shows what failed, says nothing is lost and you're still signed in, and offers **Try again** (calls `session.refresh()`, which re-fetches `/me`), a Status page link, an automatic retry every 30s with a countdown, and the failing request in mono. The account row switches from skeleton to a static "Not connected", and nav counts and the mailbox pool are hidden. A 401 still goes to sign-in. Wired in `components/session/AppScreen.tsx`. Review at `/app?state=api-down`, and on `/styleguide` §18.

**Avatar without a picture (Q5a).** Initials `<Monogram>` on the neutral token tint (`neutral-200` fill, `neutral-600` initials, 6.08:1), same 24px box. It's also used when a picture URL fails to load. Review at `/app?state=no-avatar`.

**Account row while `/me` loads (Q5b).** Kept: it already uses the `Skeleton` primitive. Aligned to the text it replaces: 24 circle, name bar 96×10, email bar 120×8, with 6px between, plus `aria-busy` on the row and switcher. Review at `/app?state=account-loading`.

**Sign-out failure toast (Q6).** Final copy: "Sign-out didn't go through. You're still signed in.", with a **Try again** action that retries the same sign-out. It uses the error tone and stays up 10s. Review at `/app?state=signout-failed`, then Account → Sign out.

**Q4 (in-app "Check your email" vs AuthKit hand-off): decided in §9.** The screen stays in the app and takes the six-digit code.

## 9. Email sign-in with a six-digit code (ENG-80, WorkOS Magic Auth)

WorkOS emails a **six-digit code** (not a link) that **expires in 10 minutes**. Sending is rate-limited to **3 per minute**. WorkOS owns issuing, expiry and the limit; the client mirrors those numbers in copy and in one soft cooldown. The rules live in `lib/auth/code.ts` (`CODE_LENGTH`, `CODE_TTL_MINUTES`, `RESEND_PER_MINUTE`, `RESEND_COOLDOWN_SECONDS`, `sanitizeCode`, `formatCountdown`, `retryAfterSeconds`, result types). Styleguide §19.

### The flow
1. **Form** (`default`). "Use your work email. We email you a six-digit code instead of asking for a password." Primary: **Email me a code** → "Sending code…".
2. **Check your email** (`sent`). "We sent a six-digit code to **{email}**. Enter it below; it expires in 10 minutes." Then the code field, a primary **Continue**, quiet **Open Gmail** / **Open Outlook**, and "Nothing after a minute? Check spam, or send a new code." plus **Use a different email**.
3. The sixth digit submits by itself. On success the page navigates away (same as the Google callback today).

### The code field (`CodeInput`)
- **One real `<input>`**, drawn as six cells (3 + 3). Don't build six inputs: one field gives one-time-code autofill, whole-code paste, one label and one error for free.
- Attributes: `type="text"`, `inputMode="numeric"`, `pattern="[0-9]*"`, `autoComplete="one-time-code"`, `autoCorrect="off"`, `spellCheck={false}`, `enterKeyHint="go"`, and a font size of 16px or more (no iOS zoom). No `maxLength`: paste "123 456", "123-456" or "Your code is 123456" and `sanitizeCode` keeps the six digits.
- Label: visible "Sign-in code" (`<label for>`). `aria-describedby` points at the hint or the error. `aria-invalid` is set when the code is wrong or expired, and `aria-busy` / `readOnly` while it is checking.
- Hint: **"From Corral. Paste it whole, or type it."** No sender address is shown (updated Sep 30, PR #7). Errors replace the hint in the same slot, with `role="alert"`.
- **Focus:** the code field auto-focuses after the first send, after a resend (**send a new code** or **Send a new code**), and after changing the email and sending again. It also re-focuses when a `verify-limited` countdown ends (below).
- `onComplete` fires once, when the value becomes six digits. **Continue** stays for keyboard and assistive-tech users and is disabled until there are six digits.
- Cells use `--color-border-control` (3.24:1, WCAG 1.4.11). The caret cell gets the action ring, wrong gets negative-600, checking gets muted, and expired gets muted digits with a strike-through.

### States (all reachable with `/sign-in?state=…` outside production)
| `?state=` | What shows | Copy |
|---|---|---|
| `sent` | Code entry, empty and focused. The resend link is on a 0:20 cooldown. | "We sent a six-digit code to {email}. Enter it below; it expires in 10 minutes." · "…or send a new code in 0:20." |
| `code-verifying` | The field is read-only, "Checking…" sits next to the label, and the button reads "Checking code…" (disabled). | — |
| `code-wrong` | Inline error. **The digits stay** and are selected on focus, so typing replaces them and Backspace edits. Editing clears the error. | "That code isn't right. Check the newest email from Corral and try again." |
| `code-expired` | The field is locked. The primary becomes **Send a new code**, and the resend line hides (the primary is the resend). | "That code has expired. Codes last 10 minutes." |
| `code-attempts` | WorkOS locked the code after too many wrong tries. **Same layout as `code-expired`**: the field is locked, the primary becomes **Send a new code**, and the resend line hides. Negative tone, in the error slot. | "Too many tries on that code. Send a new code and try again." |
| `code-resent` | Success banner. The field is cleared and refocused, and the cooldown restarts at 0:20. | "**New code sent.** Use the code in the newest email. It expires in 10 minutes." |
| `verify-limited` | 429 on **verify**. The field is **locked and keeps its digits**; **Continue** is disabled. Caution tone (caution banner/hint slot, not negative). A live countdown from `Retry-After` (seconds or an HTTP date, **60s if missing**, via `retryAfterSeconds`). At 0:00 the field unlocks and takes focus; the digits stay, so Continue or Enter retries. | "Too many tries for now. You can try again in 0:42." |
| `code-failed` | A generic `auth_failed` on verify. The field is locked. The primary becomes **Send a new code** (it resends, then clears and focuses the field as `code-resent`). Negative tone, in the error slot. | "We couldn't sign you in with that code. Send a new code and try again." |
| `resend-limited` | Caution banner with a live countdown. The resend link shows the same countdown. The banner clears itself at 0:00. | "**Too many codes asked for.** You can ask for 3 codes a minute. The last code we sent still works, or send another in 0:41." |
| `change-email` | Back on the form. The old address is prefilled and selected on focus, with a note under the field. | "We'll send a new code to this address. The code sent to {old} won't work for it." |

`verify-limited` and `code-failed` came with PR #7; `code-attempts` came with Krak's M3 stack (`SignIn.tsx`, `lib/auth/signInState.ts`, `lib/auth/code.ts`, styleguide §19). The design batches don't edit `SignIn.tsx`.

Also designed, without their own review state: a failed first send stays on the form with "**Couldn't send your code.** Check your connection, then try again. Nothing was sent."; a failed resend shows "**Couldn't send a new code.** Check your connection, then try again. The last code we sent still works."; and a failed verify shows "Couldn't check the code. Check your connection and try again." (field stays editable). That copy is **only for network errors, timeouts and 5xx**; a 429 is `verify-limited` and `auth_failed` is `code-failed`.

### What Krak wires (`SignInActions`, `components/app/screens/SignIn.tsx`)
```ts
sendCode?:   (email: string) => Promise<CodeSendResult>;   // { ok: true } | { ok: false, reason: "rate-limited", retryAfter } | { ok: false, reason: "network" }
verifyCode?: (email: string, code: string) => Promise<CodeVerifyResult>; // { ok: true } | { ok: false, reason: "wrong" | "expired" | "attempts" | "failed" | "network" } | { ok: false, reason: "rate-limited", retryAfter }
```
- If `sendCode` is **absent**, the email button keeps today's behaviour (`startEmail` → AuthKit hosted page), so nothing breaks before the endpoints land. Once both are present, the email path stays in the app.
- `sendCode` is used for the first send, for **send a new code** and for **Send a new code** after expiry. Map a 429 to `rate-limited`, with `retryAfter = retryAfterSeconds(res.headers.get("Retry-After"))` (seconds or an HTTP date; 60 if missing). Map network errors, timeouts and 5xx to `network`. A rate limit on the *first* send still opens the code screen with the limited banner, because an earlier code may be in the inbox.
- `verifyCode` mapping (decided Sep 30, implemented by Krak on PR #7 in `lib/api/auth.ts` `toCodeVerifyResult`):

  | API answer | Result | State |
  |---|---|---|
  | 400 `code_invalid`, or 422 | `wrong` | `code-wrong` |
  | 400 `code_expired` | `expired` | `code-expired` |
  | 400 `too_many_attempts` (WorkOS `one_time_code_too_many_attempts`) | `attempts` | `code-attempts` |
  | 429 (any code) | `rate-limited` + `retryAfter` from `Retry-After` (60 if missing) | `verify-limited` |
  | 400 `auth_failed` (or any other 4xx, 401/403) | `failed` | `code-failed` |
  | network error, timeout, 5xx | `network` | "Couldn't check the code…" |

  `too_many_attempts` is its own result and state, not `expired`: the layout is the same but the line says why. (Updated Sep 30.)
- `verifyCode` success: on `{ ok: true }`, set the session and navigate (to `safeReturnTo(next) ?? APP_HOME`, then `/onboarding` for new workspaces, as the callback does). The screen stays on "Checking…" until the page unloads.
- **Soft cooldown:** after every successful send the resend link waits 20s (60s ÷ 3). One tab never hits the WorkOS limit. The server limit still wins (other tabs, other devices), which is when `resend-limited` shows.
- Don't count or cap wrong attempts in the client. When WorkOS locks a code after too many tries (`one_time_code_too_many_attempts`, HTTP 400), return `attempts`: `code-attempts` shows the expired layout with "Too many tries on that code. Send a new code and try again."
- Review mode (no API): `123456` signs in, `111111` is expired, `999999` is locked (`attempts`), anything else is wrong, and the 4th send inside a minute is rate-limited.

### Copy changes (every "link" and "15 minutes" is gone)
- Lede: "Use your work email. We email you a six-digit code instead of asking for a password."
- Button: "Email me a sign-in link" / "Email me a new link" → **"Email me a code"**; pending state "Sending link…" → **"Sending code…"**.
- Callback `error` banner: "That link has expired. Sign-in links work once and last 15 minutes…" → **"That sign-in didn't finish. It may have timed out or been opened twice. Start again below; it only takes a minute."**
- `unavailable`: "…send email links right now" → "…send sign-in codes right now". "Email links go through the same provider…" → "Email codes go through the same provider…".
- Tests updated for the new copy: `components/session/SignInScreen.test.tsx`, `test/pages.test.tsx`, `e2e/auth.spec.ts`. New tests: `components/app/screens/SignIn.code.test.tsx`, `lib/auth/code.test.ts`, and extra cases in `lib/auth/signInState.test.ts`. **Playwright visual baselines `sign-in.png` and `sign-in-error.png` need regenerating**, because the lede, button and error banner copy changed.

### Open questions
1. ~~Does WorkOS lock a code after N wrong attempts?~~ Answered: it returns `one_time_code_too_many_attempts` (400; our API sends `too_many_attempts`). The client maps it to `attempts` and its own state, `code-attempts` (`?state=code-attempts`): the expired layout with "Too many tries on that code. Send a new code and try again."
2. Does sending a new code invalidate the previous one? The copy says "use the code in the newest email", which is safe either way. If old codes stay valid, the `resend-limited` banner's "the last code we sent still works" is still true.

## 10. Knowledge base (M2, ENG-52 → build ENG-79, backend ENG-65/66)

One knowledge base per product. Users drop in files and web pages; Corral reads them, splits them into passages it can search, and drafts **one editable page** of what it knows, with every line cited back to a source. Code: `components/app/kb/` (CSS `kb.css`, `k-` prefix, container queries on the shell), rules in `lib/kb/upload.ts` and `lib/kb/state.ts`. Styleguide §20–24.

### Routes and states (`/app?view=knowledge&state=…` outside production)
| `state=` | Tab | What shows |
|---|---|---|
| (none) | Knowledge | Live. The drafted page; two sources still reading (they tick to ready); "Reading 2 sources" in the tab bar. |
| `empty` | Knowledge | First run. "Teach Corral what you sell", the full drop zone + web page adder, and three "good first sources". The page **is** the drop zone. |
| `drafting` | Knowledge | First source is being read: "Corral drafts this page once your first source is read", naming the file being read. |
| `loading` | Knowledge | Skeleton at real sizes (index, title, sections). No live indicator. |
| `error` | Knowledge | "Couldn't load the knowledge base". "Your sources and edits are safe; this is a connection problem. Corral keeps using the last saved version in emails meanwhile." **Try again**. |
| `sources` | Sources | The ledger: needs-you rows first, then reading, then ready. Filters All / Files / Web / Needs you. |
| `source` | Sources | A ready source in the detail rail. |
| `partial` | Sources | Gateway spec sheet: 31 of 38 pages read, pages 12–18 are scans. |
| `failed` | Sources | Calibration certificate: password-protected, Corral uses nothing from it. |
| `upload` | Knowledge | Add sources dialog mid-upload (two active, queued, done). |
| `upload-errors` | Knowledge | Every failure at once: stopped, unsupported (.key), too large, password, duplicate, plus one added. |
| `dragging` | Knowledge | Files held over the page: full-window drop target. |
| `tray` | Knowledge | Dialog closed while uploading: the tray in the bottom corner. |
| `editing` | Knowledge | A Proof line open for editing. |
| `save-error` | Knowledge | The same edit with "Couldn't save this line. Your edit is still here. Corral keeps using the previous version until it saves." and **Try again**. |
| `conflict` | Knowledge | Pricing: two sources disagree ($35 vs $39); **Use this** on either. |

Review states are frozen (no tickers), so screenshots are stable. `kbReviewState(view, state, reviewStates)` only honours them when `view === "knowledge"`, with the same `designReview` gate as every other `?state=`.

### Decisions
1. **Ready is quiet; colour is for exceptions.** A ready row shows only its passage count. Only partial (caution) and failed (negative) rows get colour, and they sort to the top. Reading rows show the stage in words plus a 3px bar, not a spinner.
2. **Neutral file tiles.** PDF, DOCX and MD share one paper tile with a mono label; web pages get a globe. No red PDF/blue Word icons competing with the status column.
3. **The knowledge is a document, not a form.** Numbered sections, 15px body, citations as sidenotes with the page or path (click → that source in the detail rail). At 390 the sidenotes drop under each line.
4. **Your edits win.** Every line says who wrote it ("Drafted by Corral from 2 sources" / "Edited by you"). Re-reading a source never overwrites a line you edited; if a source now disagrees, it becomes a conflict instead.
5. **Every drafted line is cited; an uncited line is yours.** Corral never drafts a line without a source. A line with no citation is labelled "Your claim · no source" (Never say rules: "Your rule"), and the editor says so while you type.
6. **Three kinds of "needs you", resolved in place:** *review* (new line Corral isn't sure about: Looks right / Remove), *stale* (its source was removed: Keep as my claim / Cite another), *conflict* (sources disagree: both shown with dates, newest marked, Use this). They're gathered in one box at the top and counted in the index. Corral doesn't use a flagged line in emails until it's resolved.
7. **Removing a source is undoable, and honest.** The confirm says how many lines cite it; lines that relied only on it are marked stale (not deleted), and the toast offers Undo.
8. **One dialog for files and web pages.** "This page" or "Whole section" (crawl the path). Client-side checks (type, size, count, URL) happen before upload and name the fix. The drop zone works anywhere on the page.
9. **The pipeline is shown as receipts.** The detail lists Uploaded → Checked → Read → Split → Searchable, each with the fact that proves it (size, "no macros", pages read, passage count). A partial read names the skipped pages and why.
10. **The top bar carries the product switcher and one primary: Add sources.**

### Component APIs (`import { … } from "@/components/app"`)
```ts
<KnowledgeBase state?: KbReviewState addOpen onAddOpenChange contained? />         // host: tabs, list+detail, dialogs, tray, toasts
<SourceList sources filter onFilter selected? onOpen onAction?(id, "reread"|"replace"|"remove") onAdd? />
<SourceDetail src knowledge? onBack? onAction? onJump?(itemId) />                   // pipelineSteps(src) gives the receipts
<KnowledgeEditor sections onChange sources initialEditing? failFirstSave? initialFocus? onOpenSource? onShowSources? />
<UploadDialog open onClose q product existing?: string[] inline? onReplace? />      // q = useUploadQueue({ initial?, live?, onDone? })
<UploadTray q onOpen inline? />   <DropZone onFiles compact? />   <UrlAdder onAdd(host, path, whole) />   <QueueRow it onRetry? onDismiss? onReplace? />
<FileTile kind size?: 20|28|36 label? />   <SourceState src compact? />   <Progress value? label tone? />   <CiteChip cite sources onOpen? onRemove? />
```
Shapes (`components/app/kb/data.ts`) are the starting contract: `Source { id, name, kind: "pdf"|"docx"|"md"|"url", host?, meta, passages?, cited, by, added, updated, status }`, `SourceStatus = ready | processing{stage, pct} | partial{read, total, skipped, note} | failed{failure, at}`, `KSection { id, title, hint, add, items: KItem[] }`, `KItem { id, q?, body, cites: {src, loc?}[], by: "corral"|"you", when, flag? }`, `KFlag = review{note} | stale{removed, when} | conflict{options[]}`.

### What Krak wires to ENG-65/66
- **Limits and types** from `lib/kb/upload.ts`: `MAX_FILE_BYTES` (25 MB), `MAX_FILES_PER_DROP` (20), `ACCEPTED` / `ACCEPT_ATTR` (PDF, DOCX, Markdown). `checkFile` returns the exact copy, including the convert-it fix for .key/.pages/.pptx/.doc/.xlsx/.csv/.zip/images. `checkUrl` adds https:// and rejects localhost/private addresses; the server must re-check (SSRF).
- **Progress events per stage**: `upload` (bytes %), `scan`, `parse` (pages read of total), `chunk`, `embed`. Map each to `SourceStatus.processing{stage, pct}`; `stageLabel(stage, kind)` gives the words (web pages say Fetching / Reading pages). `overallPercent` weights stages equally for the tray.
- **Failure codes** → `FAILURE` keys: `interrupted`, `encrypted`, `no-text`, `rejected` (macros/embedded files), `duplicate` (same content hash in this KB), `unreachable`, `blocked` (robots/403). Each carries its title, fix and the one action. Partial reads return `{read, total, skipped}`.
- **429 / Retry-After** on upload or re-read: keep the item queued and retry after the header (reuse `retryAfterSeconds` from `lib/auth/code.ts`).
- **Web pages re-read weekly** ("re-read weekly" in meta); a changed page that contradicts an edited line creates a `conflict`, never an overwrite.
- **Remove** = soft delete: passages leave retrieval now; items whose only citations were this source get `flag: stale`. Undo (in the toast) restores both.
- **Edits**: optimistic; a failed save keeps the text open with the save-error banner. ⌘↵ saves, Esc cancels.
- Two uploads at a time per tab, as the simulator does.

### Tests (added)
`lib/kb/upload.test.ts`, `lib/kb/state.test.ts` (under the 90% coverage gate) and `components/app/kb/kb.test.tsx` (27 component tests: list sorting/filters, detail receipts for ready/partial/failed, upload validation and every failure, URL checks, tray, editor edit/save/save-error/Esc, review/stale/conflict resolution, remove + Undo), plus a `/app?view=knowledge&state=empty` case in `test/pages.test.tsx`. ENG-79 still owns e2e upload, a11y and visual baselines.

### Open questions
1. Are 25 MB per file and 20 files per drop the real limits? Any per-KB cap (pages, passages)?
2. Supported types: PDF, DOCX, Markdown and URLs only? Plain .txt, .pptx and Google Docs links are the next most likely asks.
3. OCR for scanned pages: the design treats them as skipped (partial). If ENG-66 adds OCR, partial becomes rarer but the state stays.
4. Does the crawler support "Whole section" (a path prefix), and with what page cap? The design says "~40 pages".
5. Duplicate detection: by content hash or file name? The copy says "Already in this knowledge base".
6. A retrieval test ("Ask what Corral would say") is designed out of M2 and deferred.
7. Is the product switcher one KB per product (as designed), or one KB per workspace with product tags?
8. Where does the pricing switch ("Corral may quote prices in emails") persist: per product KB or per sequence?

## 11. Leads: table, bulk actions, detail, status tags, segments, CSV import (M3, ENG-53 → build ENG-81)

Everything extends the M1 Companies table (`SegmentTable`) and primitives; nothing is forked. Styleguide §25–29. Rules and import logic are pure and tested in `lib/leads/` (`segment.ts`, `import.ts`, `state.ts`); components are in `components/app/leads/` (CSS `leads.css`, `l-*` classes, imported in `app/globals.css`).

### Routes and states (`/app?view=companies|segments&state=…` outside production)
| `?view=companies&state=` | What shows |
|---|---|
| (none) | Live. Tabs All 1,284 · Fit 80+ 212 · In a sequence 38 · Replied 9. Sortable headers, row checkboxes, click a row for the detail rail. |
| `loading` | Skeleton rows at 40px (two-line cards at 390). |
| `error` | "Couldn't load companies", with Try again. |
| `empty` | First run: "Bring in the companies you already know", with Import a CSV / Find companies. |
| `no-results` | Filters Fit ≥ 90 + Ethiopia. Names the tightest rule and what loosening it gives ("At ≥ 80, 1 company matches"), plus Clear filters. |
| `partial` | Info banner: "Corral is still scoring 212 of 1,284 companies." Scoring rows show a shimmer in the fit cell. |
| `selected` | 3 selected; the floating bulk bar: count · Enroll · Set status · Add to segment · Export · clear · Esc. |
| `select-all` | Whole view selected: "All **1,284** companies in All are selected. Clear selection". Selecting a page first offers "All 23 on this page are selected. Select all 212 in Fit 80+". |
| `bulk-confirm` | Enrolling 1,284 → a dry-run breakdown: 1,072 will be enrolled; 38 already in a sequence, 9 replied in the last 30 days, 41 unsubscribed/said no, 124 no verified email. Sends spread over 6 working days at the pool's 210/day. |
| `bulk-running` | The bar becomes progress ("Enrolling 407 of 1,072") and keeps running if you navigate; a toast with "View the 212 skipped" when done. |
| `status-menu` | Set status for 3 selected, from the bar. |
| `detail` | Kilima Dairies in the 400px rail (full screen with a back row at 390). |
| `duplicate` | Kilima Dairies Ltd: caution banner "Looks like Kilima Dairies" (same website root and a matching person; merging keeps the original's history and status), Merge / Keep both. It's still scoring, so Enroll is disabled and says why. |
| `import` · `import-file-error` | Step 1: drop zone and what Corral needs; an .xlsx with the one fix (File → Save As → CSV UTF-8). |
| `import-map` · `import-map-errors` | Step 2: every column with sample values, a Select per column and how it was matched ("Matched by name/values"). Errors: no company or website column, two columns on Work email, Full name together with First/Last. Continue is blocked with "Fix 3 things above to continue". |
| `import-review` | Step 3: 53 new · 5 already in Corral · 2 repeated in this file · 4 can't be imported; the duplicate policy (Skip / Fill in blanks / Overwrite); bad rows by spreadsheet row, column, value and problem. The button says what happens: "Import 53, update 5". |
| `import-running` · `import-done` | Progress, closable ("Keeps going if you close this.", Hide); then receipts, "Download them as CSV" for the 4 rows left behind, and **Make a segment from this import**. |

| `?view=segments&state=` | What shows |
|---|---|
| (none) | The saved segment's rules as chips over the same table; top bar Export + **Enroll segment**. |
| `builder` | Rules editor above the table: field · condition · value per rule, all/any, a live "Matches now" count and a peek list. |
| `builder-empty` | Rules that match nothing: the tightest rule and what loosening it would give. |
| `builder-error` | An out-of-range number and an empty pick: marked inline, ignored in the count ("2 unfinished rules are ignored"), Save disabled with "Finish 2 rules to save". |
| `loading` · `error` · `selected` · `detail` | As for companies. |

### Decisions
1. **Filters and segments are one rule model** (`Rule { id, field, op, value }`, `Match = all | any`). The chips over the table are rules; **Save as segment** saves them. A segment is **live**: companies join and leave as Corral re-scores them.
2. **Add to segment** (from the bulk bar) **pins** companies, even if they stop matching the rules. The toast says so ("pinned, even if rules change"). A segment is rules plus pinned ids.
3. **Selection:** checkbox per row, a header checkbox with a mixed state, and the Gmail pattern for the whole view (page first, then "Select all N"). One floating bar holds every bulk action; Esc clears it. "Whole view" is the current tab plus filters, and it doesn't span tabs.
4. **Large actions** (≥ `BULK_CONFIRM_AT` = 100) always confirm with a **dry-run breakdown** of what will be skipped and why, and how the mailbox pool spreads the sends. They then run in the background with progress in the bar. Smaller ones run at once with an Undo toast.
5. **Duplicates** match by work email first, then by website domain (`normDomain` strips protocol, www and path). On import you pick a policy (skip, fill in blanks, overwrite). Repeats inside the file keep the first row. In the table a likely duplicate gets a mark and, in the detail, **Merge** (keeps the original's history and sequences) or **Keep both**.
6. **Import never writes until the last step.** Columns are guessed by header synonyms, then by sniffing values, and each field is taken once. Mapping problems block Continue and name the columns. Bad rows are skipped, not fatal, and can be downloaded to fix. Limits: 20 MB, 50,000 rows, CSV/TSV (comma, semicolon, tab), UTF-8 with or without BOM.
7. **Statuses:** two tags per company. **Reply status** (Not contacted, Contacted, Interested, Objection, Referral, Meeting booked, Not interested, **Unsubscribed**) is set by Corral from replies; a status you set sticks until they reply again. **Email status** (Verified, Catch-all, **Unverified**, Bounced) comes from verification. Unsubscribed and Bounced are permanent blocks on enrolling. The tag is the control (`StatusMenu`); each option carries its meaning (`STATUS_HELP`). New in M3: Unverified (neutral) and Unsubscribed (negative).
8. **Logos:** an unknown company gets a neutral monogram tile (`Logo` accepts any name). Colour in the table is only for exceptions (status tags, fit bar, errors).
9. **Mobile (≤ 767px container):** rows become two-line cards (company + fit, person + reply), the detail goes full screen with a back row, the bulk bar compacts to count + Enroll + clear, builder rules stack, and import mapping rows stack.

### Component APIs (`import { … } from "@/components/app"`)
```tsx
<LeadsView view="companies"|"segments" state? segment? importOpen onImportOpenChange builderOpen onBuilderOpenChange onEnroll(n, replied) onFind reviewSample? enrollAllSignal? />
<SegmentTable leads selected onToggle? label? sort? onSort?(key) allChecked?: boolean|"mixed" onToggleAll? onOpen?(id) active? limit? hover? />   // M3 props are all optional; M1 usage unchanged
<LeadDetail lead onClose onStatus(id, status, "reply"|"email") onEnroll onMerge? onKeepBoth? onOpenLead? />
<SegmentBuilder rules onRules match onMatch leads name? onName? onSave onCancel saveLabel? total? />   // name present = new segment
<ImportDialog open onClose existing: Existing[] seed? sample? onDone?(message) onSegment? inline? />
<StatusMenu value onChange label options?={LEAD_STATUSES|EMAIL_STATUSES} defaultOpen? align? side? />   <MultiPick values options onChange label invalid? />
```
Also changed, with backwards-compatible props: `Check` (`mixed`, stops click propagation), `Toggle` (`label`; aria-hidden without one), `Select` (`label` names its listbox), `DropZone` (`hint`, `accept`, `multiple`, `lead`), `Logo` (any string), `Lead` type (optional `country`, `size`, `industry`, `source`, `scoring`, `dupOf`; `company` is a string).
Logic (`lib/leads/`): `filterLeads`, `matches`, `ruleIssue`, `describeRule`, `sortLeads`, `nextSort`, `selectionLabel`, `selectedCount`, `parseCsv`, `checkCsvFile`, `checkCsvShape`, `guessMapping`, `mappingIssues`, `rowErrors`, `findDuplicates`, `importPlan`, `leadsReviewState`.

### What Krak wires (ENG-81)
- **Server-side everything that counts:** filtering, sorting and totals run in the API. The client helpers mirror the semantics for review, and so tests can pin them. Selection sends either ids or `{ all: true, rules, match, tab }`, never 1,284 ids.
- **Dry-run endpoint** for bulk actions: returns `{ willEnroll, skipped: [{ reason, n }], days }` for the confirm dialog. Run the real job in the background with progress events for the bar.
- **Segment preview count** for the builder (debounced ~250ms as rules change), plus a 4-row peek.
- **Import:** parse on the client for mapping and preview (first 5 rows), then upload the file and mapping. The server re-parses and re-validates (limits, emails, dedupe against the whole workspace, not just loaded rows), streams progress, and returns the bad-rows CSV.
- **Dedupe:** email, then domain, server-side and case-insensitive. Merge moves people, activity, sequences and segment pins onto the original.
- **Virtualize the table** at scale (ENG-81 asks for 10k rows). Keep the 40px row, sticky header and container-query columns. "Showing the first N. The rest load as you scroll." stays as the fallback copy.
- **Statuses:** manual reply-status changes are stored with `setBy: "you"` until the next inbound reply. Unsubscribed is final and also suppresses the address workspace-wide.
- **Tests (ENG-81):** component tests exist (`components/app/leads/leads.test.tsx`, 19; `lib/leads/*.test.ts`, 18; a `/app?view=companies&state=empty` page case). Still to add: e2e import → segment, 10k-row virtualization, a11y and visual. **The Playwright visual baseline `app-companies.png` needs regenerating** (new top bar, sortable headers, header checkbox), and the sidebar segment counts changed (13 / 12 / 5, to match the sample rules).
- Review mode: `?state=` seeds each state. The Import CSV dialog offers "Try it with a sample trade-show export" (64 rows with 3 bad emails, 1 row with no company, 5 already in Corral and 2 in-file repeats).

### Also fixed (M1 a11y findings on `/styleguide`)
⌘K loading list is `aria-busy` with the skeleton hidden from AT (the "Searching" status announces). The calendar is a labelled `group` (not a `grid` without rows), with full-date labels on day buttons. The demo toggle is named. Select listboxes are named. Both 390px scroll areas (contrast ladder, skeleton table) are focusable, labelled regions. The kbd hint on primary buttons is now `rgb(255 255 255 / .9)` (4.9:1; was 4.26:1). axe: 0 findings across 33 routes × 1440/390.

### Open questions
1. Real limits: 20 MB / 50,000 rows per import? A workspace cap on companies?
2. Dedupe keys: is email → website right? Should a company name plus country match count as "possible"?
3. Merge rules: which side wins per field? The design keeps the original and fills blanks from the duplicate.
4. Should "Select all" span tabs, or stay within the current tab plus filters (as designed)?
5. Status taxonomy: are Referral and Objection statuses or reply labels? Is Unsubscribed per address or per company?
6. The ENG-53 Linear attachments link GitHub `Uzski-Corp/camposocial-client` #162/#190. Is that the right repo, or stale links from another project?
7. Pool rate: the confirm uses 210/day from the mailbox pool card. Does the API expose the real per-day capacity for the dry run?

## 12. Discovery runs, enrichment state and provenance (M4, ENG-54 → build ENG-82)

A **discovery run** finds companies that fit one product: it searches the web (Serper), reads each site (Corral crawler), scores it against the product's knowledge base, and only then spends credits finding a person (site → Hunter → Dropcontact) and checking the email (ZeroBounce), and only for companies above the fit bar. Results land in **Companies** as they are found (source **Corral search**), so nothing waits for the run to finish. Styleguide §30–33. Logic is pure and tested in `lib/discovery/` (`run.ts`, `provenance.ts`, `state.ts`); components are in `components/app/discovery/` (CSS `discovery.css`, `d-*` classes, plus shared `.c-enrich` and `.c-stale`; imported in `app/globals.css`). Sidebar: **Discovery** after Companies (globe icon, `G D`). The Companies top bar's primary is now **Find companies** (globe), which opens a new run; the palette's "Find companies" does the same.

### Routes and states (`/app?view=discovery&state=…` outside production)
| `?state=` | What shows |
|---|---|
| (none) | Live. Six runs in the 272px list; the running one ("Dairy & cold rooms · East Africa") ticks every 1.4s until it finishes with a toast. |
| `empty` | No runs yet: "Find companies that fit ColdTrace Sensors", what a run does, **Start your first run**. The top bar hides **New run** (one primary). |
| `loading` · `error` | Skeleton list, stage boxes and table · "Couldn't load discovery runs" (`GET /discovery/runs · 503`), Try again. |
| `new` · `new-error` | The New run dialog (640) over the running run, so the button reads **Queue run** with "Starts after …". Error seed: no countries and 1,000 at fit 60, which needs ~1,352 credits with 1,289 free: "2 things to fix", both named, the button disabled with "Fix 2 things above to start". |
| `queued` | "Queued behind Dairy & cold rooms · East Africa", stages waiting, **Remove from queue**. |
| `running` | Five stages with counts in their own unit (18/18 searches · 164/212 sites · 131/164 companies · 29/46 lookups · 21/38 checks), "75% · about 8 min left · 50 of ~221 credits used", results with enrichment in place, **Pause** / **Cancel run**. |
| `rate-limited` | "**Paused: Hunter's hourly limit**", a live countdown (4:22) from `Retry-After`, "Nothing is lost and no credits are spent while it waits; reading and scoring carry on." Only Find people and Verify pause. |
| `failed` | "**Web search stopped answering**": 41 companies kept, not read, so no credits spent. **Resume from search** / **Edit and run again**. Rows show Queued / "Waits for fit". |
| `partial` | Finished with "15 of 96 sites couldn't be read", by reason (7 blocked, 5 timed out, 2 no website, 1 parked), "Their companies are kept without a fit", **Retry the 5 that timed out**. Summary: 96 found · 84 added to Companies · 12 already in Corral, updated · 14 fit 80+ · 43 credits used; **Open in Companies** / **Make a segment from this run**. |
| `done` | The finished summary and results, **Run again** (setup prefilled). |
| `zero` | "No companies matched": "All of 8 searches came back empty", and what to loosen (size, country, industry), with **Add 201–1,000 and run again**. A disclosure lists each search and what it found. |
| `detail` | Kilima Dairies open from the run (400px rail; the runs list hides below a 1,680px container): "Found via" the search that found it, and **Where this data came from** with the email's evidence open. |

| `?view=companies&state=` (M4) | What shows |
|---|---|
| `stale` | Caution banner "Contact details for 86 companies were last checked over 90 days ago", **Re-check 86 · 172 credits**. Stale emails carry a clock mark ("Checked 4 months ago"); the open detail says the same with **Re-check · 2 credits**. |
| `provenance` | Kilima Dairies open with the email's evidence chain expanded. |

### Decisions
1. **One run at a time per workspace.** Starting another while one runs queues it ("Queue run", "Starts after …"). Credits held by the running run (its estimate minus what it has used) aren't free.
2. **Score before enriching.** Every company found is read and scored; finding people and checking emails (the steps that cost credits) only run for companies at or above the **fit bar** (60/70/80, default 70). Companies under the bar are still added with their fit, marked "Not looked up", and can be enriched later. The New run estimate updates as the limit and bar change (`estimateCredits`), before anything is spent.
3. **Every field keeps its evidence chain** (`Evidence { kind, what, url?, at, confidence? }`), newest last: where it was found, who confirmed it, when, how sure. The detail shows one row per field (value, source · age) that expands into the chain, plus a freshness line.
4. **Values go stale by field** (`STALE_AFTER`): email 90 days; person, title, phone 180; fit 90; size, industry, country 365. **Anything you typed never goes stale and is never overwritten** ("Entered by you, so Corral won't overwrite it."). Corral re-checks a stale email before sending anything, so a stale mark is information, not a blocker.
5. **Enrichment state is shown in place**, as quiet tertiary text where the value will be: Queued, Reading site, Scoring, Finding people, Verifying, Not looked up, No one found, Couldn't read site, "Waits for fit". No per-cell spinners; the fit bar is dimmed until scored.
6. **Failure keeps what was found** and stops before spending credits. **Resume** continues from the stage that stopped.
7. **Provider limits pause only the stages that need that provider**, say so with a countdown, and resume by themselves.
8. **Unreadable sites are kept without a fit**, grouped by reason (`SKIP_TEXT`); only timeouts are worth a retry. Blocked sites stay unread; adding a contact by hand scores them.
9. **Zero results explain themselves**: how many searches ran, and one hint per narrow criterion (`zeroResultHints`), with the widest one as the primary action.
10. **Results are Companies.** A run dedupes against existing companies (updates them, "already in Corral, updated") and **Make a segment from this run** creates a segment of its results.
11. **Mobile (≤ 767px container):** the run comes first with an "All runs" back row; stages become a vertical list (also in any container under 600px); results are two-line cards; the detail is full screen with "Back to results"; banner actions drop under the text; the New run dialog stacks its labels.

### Component APIs (`import { … } from "@/components/app"`)
```tsx
<DiscoveryView state? setupOpen onSetupOpenChange onOpenCompanies onSegment(name) />
<RunsList runs open onOpen(id) onNew />   <RunTag run />   <StageStrip run />
<RunPanel run results active? onOpen(id) onAction(RunAction) countdown? actions? />   // RunAction: pause | cancel | resume | retry-timeouts | segment | open-companies | edit | widen | unqueue
<RunSetup open onClose onStart({ name, criteria, limit, enrichAt, queued }) inline? seed? queueBehind? held? />
<ProvenanceList list: FieldProv[] today initialOpen? onRecheck? rechecking? />   <StaleBanner list today person? onRecheck? rechecking? />
<LeadDetail … prov? today? provOpen? onRecheck?(id) rechecking? foundVia? backLabel? />   // M4 props optional; M3 usage unchanged
```
`Lead` gains optional `enrich?: EnrichState`; `SegmentTable` renders it in place (and exports `StaleMark`). `LeadsView` gains the `stale` and `provenance` states. `AppDemo` gains `discovery?: DiscoveryReviewState`.
Logic (`lib/discovery/`): `STAGES`, `overallPercent`, `currentStage`, `runHeadline`, `etaText`, `estimateCredits`, `setupIssues`, `zeroResultHints`, `advanceRun`, `enrichLabel`, `enrichBusy`, `fitPending`, `SKIP_TEXT`; `STALE_AFTER`, `ageDays`, `formatAge`, `shortAge`, `freshness`, `origin`, `confidenceWord`, `staleFields`, `chainSummary`, `SOURCE`, `FIELD_LABEL`; `discoveryReviewState`.

### What Krak wires (ENG-82, backend TBD)
- **Runs API:** `POST /discovery/runs` (criteria, limit, enrichAt, productId) → queued or running; `GET /discovery/runs`; pause, resume (from the failed stage), cancel, remove from queue, retry timeouts. **Progress events per stage** (`{ stage, done, total, state }`, SSE or polling) and per company (`enrich` state), so the table fills in place.
- **Provider 429s:** pause the affected stages with `resumeAt` from `Retry-After`; the client shows the countdown. The run continues other stages.
- **Credits:** a balance endpoint (month, left, held) and a **dry-run estimate** for the New run dialog (replaces the client's `estimateCredits` shares). Refuse a start that can't be afforded with the same numbers the dialog shows.
- **Provenance storage:** per company and field, the evidence chain (`kind`, `what`, `url`, `at`, `confidence`), with user edits stored as `kind: "you"` and never overwritten by enrichment.
- **Stale re-check job:** re-verify stale contact fields before any send, and on demand (single and bulk, 2 credits per company in the design).
- **Dedupe with existing companies** (the §11 keys: email, then domain), counting "already in Corral, updated". Results are ordinary Companies with `source: "Corral search"` and `foundVia` (query and rank).
- Review mode: `?state=` seeds each state; without a state the dairy run advances locally (`advanceRun`).

### Tests
- Added: `components/app/discovery/discovery.test.tsx` (15: every run state's copy and actions, setup issues and the disabled button, queueing, the live tick to done, estimate changes, enrichment cells, stale banner and re-check, provenance expansion and "entered by you"), `lib/discovery/*.test.ts` (11), `lib/leads/state.test.ts` (21 states), and a `/app?view=discovery&state=empty` page case.
- For ENG-82: e2e of a run (start → progress → partial → open in Companies → make a segment), axe on `/app?view=discovery` plus every state above and companies `stale` / `provenance`, and visual baselines at 1440 and 390. **Existing baselines that need regenerating:** anything showing the sidebar (it gains Discovery) and `app-companies.png` (the top bar's primary is now Find companies).

### Open questions
1. Credit pricing and plan limits: what does a lookup and a check cost, and what are the monthly allowances? The design uses 2,000/month, 1 credit per people lookup and per email check, and ~1.6 checks per lookup.
2. Enrichment order: is "score before enriching, people only above the fit bar" right, or should some plans enrich everything?
3. Hunter, Dropcontact and ZeroBounce plan limits (the rate-limited state assumes Hunter's hourly cap).
4. Freshness windows (`STALE_AFTER`): are 90 / 180 / 365 days right?
5. Can blocked sites be retried another way (e.g. OpenClaw/browser crawl), or do they stay unread?
6. One product per run (as designed), or several?
7. The ENG-54 Linear attachments link GitHub `Uzski-Corp/camposocial-client` #163/#191, as ENG-53's did. Right repo, or stale links?
8. Krak's worktree (ENG-80, earlier layering) once lacked the M2 knowledge base and the `pen` icon; worktree HEAD 82b2973 has them. Confirm nothing else from that layer is expected to change.

## 13. Fit score: the bar in every state and why it scored (M5, ENG-55 → build ENG-83)

A fit score is **a short list of weighted checks** (100 points), each measured against one line of the product's knowledge base and backed by **the evidence Corral read**, with a link to that field's M4 provenance chain. The panel reads like a case file: claim, points, finding, the quote, where it came from, and what it was measured against. It is not a chart. The existing Open Range blue `FitBar` (`components/app/primitives.tsx`) is **extended, not replaced**: a plain `value` renders exactly as before (same classes, same `aria-label` "Fit N of 100", no extra markup). Styleguide §34–35 ("Things that float" moves to §36). Logic is pure and tested in `lib/fit/score.ts`; components are in `components/app/fit/` (`Reasoning.tsx`, demo data `data.ts`, CSS `fit.css` with `f-*` classes, imported in `app/globals.css`). Bar state CSS is in `components/app/app.css` (`.c-fit` modifiers).

**Baseline: this batch assumes M4 is applied.** It is built on worktree HEAD f70ca0f, which already contains M4 (682fed6, byte-identical to the M4 batch) and Krak's two follow-ups (020fffb, f70ca0f). It edits M4 files (`SegmentTable`, `Detail`, `Leads`, `Discovery`, `lib/leads/state*`, this document), so on an older tree apply M4 first.

### Routes and states (`/app?view=companies&state=…` outside production)
| `?state=` | What shows |
|---|---|
| `fit` | Kilima Dairies open, scrolled to **Why it scored 94**: "Strong fit. Runs three cold rooms at its Nakuru plant, about 400 tonnes. Lost a night's milk to a compressor failure in March." Then "Scored 2 days ago · read 38 pages of kilima.co.ke · measured against 5 lines of the ColdTrace Sensors knowledge base · high confidence", and six checks (rooms 30/30, pain 25/25, size 12/15 partly, buyer 10/10, region 10/10, alerting 7/10 partly), each with quotes and **Where this came from**. |
| `fit-scoring` | Tamu Bakeries **Rescoring**: "Reading tamu.ug: 12 of about 38 pages", checks ticking Checked / Checking… / Waiting, "The last score, 86 from Sep 12, stays in use until this finishes." Table rows read **Rescoring** with a sweeping bar. |
| `fit-none` | Savanna Juice Co. **Not scored yet** ("added 2 min ago and is in line"), **Score it now** / **Set the fit myself**. Table rows read **Queued**; Mara Cold Stores reads **No website** (no Score it now). Unscored rows sort last. |
| `fit-low` | Zanzibar Spice Cold Rooms, **53, low confidence**: "2 of 6 checks have no evidence (35 of 100 points); Corral could only read one page. Checks without evidence count as zero, so 53 is a floor: it could reach 88 if they hold." Unknown checks say what's missing, with **Tell Corral …** (opens that field). The bar's segments are outlined. |
| `fit-changed` | Nyota Beverages **84 ↑26**: "Up 26 from 58 on Sep 12. What changed:" three dated reasons (new evidence, a KB edit, a news post). Rift Valley Grain and Mombasa Reefer also carry ↓9 / ↑6. |
| `fit-override` | Bahari Foods: **Why Corral scored 61** under "You set this to 83" with your note, who and when, **Use Corral's 61**. The table and detail show 83 with a pen. |
| `fit-disagree` | Rift Valley Grain: "You said this score is wrong" with your note, "The score stays as it is until then", **Rescore now**. Rescoring re-reads with the note: 81 → 63, "Down 18 … Re-read rvgrain.co.ke with your note". |
| `fit-error` | Kigali Cold Chain **Last score: 85**: "Couldn't score Kigali Cold Chain. The scoring model didn't answer, twice. Nothing changed: the last score, 85 from Sep 12, still stands." `POST /fit/score · 504 · Sep 29, 14:02`, **Try again**; the last score's checks stay below. Table reads **Failed**; a company with no earlier score says it stays out of fit filters. |

The Discovery result detail also uses the panel (scored today, by the run).

### Decisions
1. **Score = the sum of weighted checks against KB lines** (design weights: runs cold rooms 30, loses stock 25, size 15, reachable ops/quality lead 10, region 10, no live alerting 10). Each check has a verdict (Holds / Partly / Doesn't hold / No evidence), points, a one-line finding, the evidence (quote or fact, source, where, when, `field` for provenance) and the KB line it was measured against. The summary line comes from the band plus the two heaviest findings that hold.
2. **Missing evidence counts as zero, and is named.** A thin score is a floor; the ceiling (`value + unknown weight`) is shown. Confidence: **low** if unknown checks weigh ≥ 25 points or fewer than 3 pages were read; **medium** if ≥ 10 points or fewer than 8 pages; otherwise high.
3. **Your override wins** for sorting, filters and segments (`shownValue`). Corral keeps scoring underneath, shows its own number, and **Use Corral's N** clears yours (with Undo on setting). Validation: a whole number 0–100; the note is optional.
4. **A disagreement is a note, not a number.** Corral re-reads the site with it and rescores; the change is explained like any other ("Re-read … with your note"). The note is kept on the score.
5. **The last score stays in use while rescoring and after an error.** Nothing silently becomes blank. Never-scored companies are excluded from fit filters and sort last.
6. **Changes are explained.** A change since the last score shows ↑/↓ on the bar and a dated "What changed" list until the next score.
7. **Bar states** (`FitBar`): `state="scoring"` (sweep 1.6s, disabled under `prefers-reduced-motion`), `state="none"`, `state="error"` (keeps the last number with an alert mark), `confidence="low"` (outlined segments), `delta`, `by="you"` (pen). Each has a full accessible name ("Fit 84 of 100, up 26 since the last score"); the table uses short visible labels (Scoring / Rescoring / Queued / No website / Not scored / Failed) so the column keeps its width.
8. **Scoring in the table now uses the bar's scoring state** instead of the M3/M4 skeleton text, for the M3 `scoring` flag and the M4 pending enrichment states (the enrichment word, e.g. "Reading site", becomes the bar's label).
9. Evidence cites link to the field in **Where this data came from** (M4): it opens that row and focuses it, scrolling only the detail pane.
10. **Mobile:** the detail is full screen as in M3; banners drop their action under the text; forms stack.

### Component APIs (`import { … } from "@/components/app"`)
```tsx
<FitBar value size? state?: "scoring" | "none" | "error" confidence?: "low" delta? by?: "you" text? />   // plain value unchanged
<FitReasoning status: FitStatus company domain today initialForm?: "override" | "disagree" busy?
  onRescore? onOverride?(value, note) onClearOverride? onDisagree?(note) onOpenField?(field) onAddField?(field) />
<SegmentTable … fitOf?(lead) => { value } & FitBarMeta />
<LeadDetail … fit?: FitStatus fitActions?: FitActions fitForm? fitBusy? fitFocus? />   // without fit, M3/M4 "Why it fits" unchanged
```
`FitStatus` = `scored { score }` · `scoring { pages, of, checked, last? }` · `none { why: queued | no-site | new, since? }` · `error { code, at, tries, last? }`. `FitScore { product, value, at, checks, pages, kbLines, history?, override?, disagree? }`.
Logic (`lib/fit/score.ts`): `scoreOf`, `band`, `BAND_WORD`, `confidence`, `shownValue`, `changeOf`, `ceilingOf`, `summaryLine`, `fitLabel`, `barOf(status, short?)`, `VERDICT_WORD`, `NONE_TEXT`, `NONE_SHORT`, `overrideIssue`. Demo data (`components/app/fit/data.ts`): `KILIMA_FIT`, `scoreFor(lead)`, `fitStatusFor(lead, state)`, `FIT_OPEN`. `LeadsReviewState` gains the 8 `fit*` states (29 total).

### What Krak wires (ENG-83, backend TBD)
- **Scoring API:** `POST /fit/score` (company, product) → a job; `GET` returns `FitScore` with checks, verdicts, points, findings, evidence (`kind`, `text`, `quote?`, `where`, `at`, `field`) and the KB line (`section`, `title`, `text`) per check, plus pages read and KB lines used. Progress (`pages`, `of`, `checked`) for the scoring state.
- **History:** keep the previous score and the reasons for a change (new evidence, KB edit, your note), for "What changed" and the ↑/↓.
- **Override and disagreement storage** per company and product (value, note, who, when); overrides feed sort/filter/segments; a disagreement triggers a rescore with the note as context.
- **Rescore triggers:** KB edits for that product, new or changed evidence (M4 re-checks), a disagreement, and on demand. Errors keep the last score and store `code`, `at`, `tries`; retry with backoff.
- **Confidence** can come from the backend; the client rules above are a fallback.
- Wire into the lead table (`fitOf`) and the lead detail (`fit`, `fitActions`) per ENG-83. Review mode: `?state=fit*` seeds each state.

### Tests
- Added: `components/app/fit/fit.test.tsx` (12: the plain bar is unchanged, every bar state's name and label, the panel for scored / override / low / changed / disagree / scoring / error / none, override and disagreement validation, provenance links, table short labels, clearing an override and setting one again, rescoring after a disagreement), `lib/fit/score.test.ts` (8), and `lib/leads/state.test.ts` (29 states).
- Krak's `e2e/leads.a11y.spec.ts` spreads `LEADS_REVIEW_STATES`, so it picks up the 8 `fit*` states automatically.
- For ENG-83: component tests as above against real data; e2e (open a company → Why? → Where this came from; set and clear an override; disagree → rescore); axe on every `fit*` state; visual baselines at 1440 and 390. **Existing baselines that change:** anything showing a row whose fit is pending (M3 companies `partial` and `duplicate`; M4 discovery `running`, `failed`, `partial`) and the lead detail (the "Why it fits" block becomes the reasoning panel when a score is present).

### Open questions
1. Check weights per product: fixed in the KB's "Who it's for / Pains" or set per product? The design uses 30/25/15/10/10/10.
2. Confidence thresholds (25/10 points, 3/8 pages): right?
3. Do overrides expire (for example after 90 days, like fit freshness in §12) or when the evidence changes a lot?
4. Should disagreement notes feed the knowledge base (suggest a KB edit), or stay per company?
5. Does a rescore cost credits? The design shows none.
6. ENG-55's GitHub link is `Uzski-Corp/camposocial-client` #164, as ENG-53/54 had. Right repo, or stale?

## 14. Sequences: builder, step editor, mailbox pool (M6, ENG-56 → build ENG-84)

A sequence reads top to bottom like the thread it will become: **each email, then the rule that decides whether the next one goes**. The rule is always a wait plus a condition (no reply · opened, no reply · not opened). **Replied is not a branch**: a reply ends the sequence for that person at any step, as do a booked meeting, a bounce or an unsubscribe (out of office pauses). The step editor is write on the left and **the real email on the right**, filled in for any company in the audience, with every value traced to its M4 provenance. Corral's draft uses only knowledge-base lines (M2), numbers each claim to its line, and says what it left out and why. The **Mailbox pool** is a tab of the same page: one card per mailbox answering "is it sending, how much today, is it still warming up, is it healthy". Styleguide §36–38 ("Things that float" moves to §39). Logic is pure and tested in `lib/sequences/sequence.ts` (review states in `lib/sequences/state.ts`); components are in `components/app/sequences/` (`Sequences.tsx`, `Steps.tsx`, `Editor.tsx`, `Pool.tsx`, demo data `data.ts`, CSS `sequences.css` with `q-*` classes, imported in `app/globals.css`).

**Baseline: this batch assumes M4 and M5 are applied.** It is built on worktree HEAD 0249e49 (branch `eng-55-fit`), which contains M4 (682fed6), M5 (684b673, byte-identical to the M5 batch) and Krak's onboarding LCP fix (0249e49, not touched here). It edits M5 files (`AppDemo`, `app/app/page.tsx`, `components/app/index.ts`, the styleguide page and CSS, `test/pages.test.tsx`, this document), so apply M4, then M5, then M6.

### Routes and states (`/app?view=sequences&state=…` outside production)
| `?state=` | What shows |
|---|---|
| `empty` | **Write your first sequence**: "A sequence is a few short emails, a few days apart, that stop the moment someone replies…", **Draft one with Corral** (opens a new sequence with Corral's draft) / **Start blank**. |
| `loading` · `error` | List and step skeletons · "Couldn't load sequences. Sequences keep sending on the server; this is only the page failing to load them." `GET /sequences · 503`, **Try again**. |
| `draft` | **Dairy cold rooms · first touch** (Draft · 3 steps · 8 days · 86 companies in Dairy & cold rooms · East Africa · their morning): step 1 (new thread), **Wait 3 days · No reply**, step 2 (reply), **Wait 5 days · Opened, no reply · otherwise Stop**, step 3; **Add a step**; **At any step** (Replied / Out of office / Meeting booked / Bounced or unsubscribed). A quiet "⚠ 2 things to fix before launch · Show" line; **Launch**. |
| `conditions` | The condition menu open on the wait before step 3: No reply (default) · Opened, no reply · Not opened. Choosing anything but No reply adds **otherwise Stop / Skip this step**. |
| `editor` | Step 1 open (the list hides; steps column + editor): Subject, Message with **{ } Insert variable** and **Draft with Corral**, **In this step** (per-variable fill: "cold_storage · Empty for 23 of 86 · Add a fallback"; unsubscribe link present), and the preview **as Lena Fischer · Mara Cold Stores** ("your 14 cold rooms in Athi River"), with **Where these came from** (source · what · age). |
| `copilot` | Corral's draft in the write column: body with numbered cite markers 1–4, **Every claim, and the line it came from** (section, the KB line, source files, "written by you"), **Left out, and why** (no price while the KB has $35 and $39 → "Resolve it in Pricing and terms"; no battery life, its source was removed Sep 26), "Checked against Never say", **Use this draft** / **Keep mine**. The preview shows the draft filled in. |
| `errors` | Launch pressed with problems: "Can't launch yet: 2 things to fix" — "Step 1: {{cold_storage}} is empty for 23 of 86 companies. Add a fallback, like {{cold_storage \| your cold rooms}}, or leave those 23 out." and "Step 2 has no unsubscribe link…", each with **Fix in step N**; the steps carry "1 to fix"; the editor's Message field is in error and the preview **as Brenda (Mbarara Milk Collectors)** shows `[cold_storage]` and why ("Corral could only read one page of mbararamilk.ug…"). |
| `launch` | The Launch dialog (fixed draft): 82 companies get step 1 (86, 4 already in Cold-room pilot) · first emails Thursday 1 Oct, 08:10–10:40 their time · spread over 2 mornings alongside the 2 running sequences (6 mailboxes, rotated, 2–7 minutes apart) · 9 emails older than 90 days re-checked first (18 credits) · stops on reply, meeting or unsubscribe. **Cancel** / **Launch to 82**. |
| `launching` | "Launching to 82 companies · Nothing has been sent yet": Re-checking 9 emails (9 of 9 still good) ✓ · Filling every variable (46 of 82) · Scheduling across the pool (Waiting). **Cancel launch** in the header. Live, it ticks to Running and toasts. |
| `running` | **Cold-room pilot**: Enrolled 312 · Still in it 118 · Replied 43 (13.8%) · Meetings 11 · Bounced 2 (0.6%) · Unsubscribed 3, "Next: Tomorrow 08:10–10:40 their time: 36 emails (step 2 · 21, step 3 · 9, step 4 · 6)", per-step Sent / Opened / Replied and "N due next". **Pause** (toast with Undo). Opening a step shows it read-only: "Pause the sequence to change its steps". |
| `paused` | **Dairy proof drip** "Paused by Tomás Ibarra · Sep 28, 16:40", his note, "22 emails that came due wait here; nothing sends until you resume, and then they go out over the next morning, not all at once. Replies still arrive in the Unibox." **Resume** in the header. |
| `mailboxes` | The pool tab: "117 of 129 sent today · 4 of 6 mailboxes sending · tomorrow up to 137 · ⚠ 2 need you". Problems first: **hello@** Disconnected since 06:12 (Google sign-in expired; its share is spread over the others) **Reconnect**; **ops@** Resting: bounce spike (4 of 31 today, 12.9%, usually 0.5%; 3 at mwanzafish.co.tz), rests until tomorrow 08:00, **See the 4 bounces** / **Send again now**; **amara@** (Microsoft 365) warming day 9 of 14, "20 a day now, 35 from Oct 4"; **sales@** day 3 (8 a day); tomas@ / wanjiru@ warm. Each card: Today meter, Warm-up, Health, Checks (SPF · DKIM · DMARC), **Daily cap 20 · 30 · 35**. The sidebar widget reads "117 / 129 today · 6 mailboxes · 2 need you" and opens this tab. |

No state (`/app?view=sequences`) is live: Cold-room pilot open, every interaction works (edit, gates, add a step, Corral's draft, fixes, launch with its checks ticking to Running, pause with Undo, resume, the pool's reconnect / cap / send again).

### Decisions
1. **Steps are emails; gates sit between them.** A gate is `{ wait (days), cond: no-reply | opened-no-reply | not-opened, otherwise?: stop | skip }`. No reply is the default and needs no "otherwise". Days are counted from enrollment and shown on every step ("Day 3 · Reply in thread").
2. **Exits apply at every step, not as branches:** Replied (stops; the thread goes to Needs you), Out of office (pauses until the day after they're back), Meeting booked (stops), Bounced or unsubscribed (stops; never write to that address again). This is where "replied" lives.
3. **Threads:** step 1 opens a thread; later steps reply in it by default ("Re: …" reused, not editable). A step can start a new thread (running sequence step 3 does).
4. **Variables are tokens in the editor, values in the preview.** Syntax `{{key}}` or `{{key | fallback}}`. Keys: `first_name`, `company`, `title`, `industry`, `country`, `cold_storage` (what they keep cold, read by Corral), `sender_first_name` (the sending mailbox), `unsubscribe_link`. Unknown keys suggest the closest one (edit distance ≤ 2: "Did you mean {{first_name}}?"). **Never send raw braces:** a value missing with no fallback blocks launch.
5. **Preview against a real company** from the audience. Each filled value shows where it came from and its age (M4 provenance); fallbacks are highlighted caution, missing values negative with the reason.
6. **Launch checks** (`issuesOf`): empty message, missing subject on a new thread, unknown variable, a variable empty for N companies with no fallback, **no unsubscribe link in a step**. Before the first Launch press they're a quiet line; after it, an error banner with **Fix in step N**, the steps marked, and the field in error. Launch is never disabled; it tells you why.
7. **Launch is confirmed and spread**, never a burst: who (after skipping companies already in a sequence), when (each company's morning, not weekends), from which mailboxes, how many mornings, and the M4 re-check of stale emails first. Then **Launching** shows its checks; nothing sends until they pass, and it can be cancelled.
8. **Copilot drafts cite the knowledge base.** Only KB lines (M2), each claim numbered to its line with source files; conflicts and removed sources are left out and said so (with a link to resolve); Never-say rules are checked. The draft is a proposal: **Use this draft** replaces the step's subject and body; **Keep mine** discards it.
9. **A running sequence's steps are read-only**; pause to change them, and edits apply only to emails not yet sent (emails already sent stay as they were). Pause holds what came due; Resume spreads it over the next morning. *(Decided in M7, was open question 3.)*
10. **Mailbox pool rules:** rotation across sending mailboxes, 2–7 minute jitter, each recipient's morning. **Warm-up 14 days**, `warmupCap(day, cap) = day ≥ 14 ? cap : min(cap, 2·day + 2)` (day 3 = 8, day 9 = 20, as onboarding says). Daily cap 20 / 30 / 35 (applies once warm). **Bounce spike** = ≥ 3 bounces today, ≥ 3% of today's sends and ≥ 3× the 30-day rate → the mailbox **rests until 08:00 tomorrow** on its own and the bouncing domain is held. Health: Bounce spike / Failing checks (SPF, DKIM, DMARC) = bad; 30-day bounces ≥ 2% or complaints ≥ 0.1% = watch; else healthy. A disconnected mailbox sends nothing and its share moves to the others.
11. **Mobile (390):** list → sequence → step as full screens with back rows ("All sequences", "All steps"); the editor splits into **Write / Preview as Lena** tabs below 760px of its own width (container query); pool cards are one column; banners drop their action under the text.
12. **"Opened, no reply" is offered with a reliability hint and is never the default** *(decided in M7, was open question 4)*. In the condition menu the option carries a secondary line: "Opens are a guess. Apple Mail and some others open every email automatically, so this may fire for people who never read it." (`CONDITION_HINT`). Once it's picked, the same line sits under the gate (`OPENS_NOTE`, `.q-gate__note`). No reply stays the default; "Not opened" has no hint yet (see §15 open questions). The menu is 288px wide so the hint wraps to two lines (`Select` `menuWidth`, and `SelectOption.hint` renders a second line in the menu only, never in the trigger).

### Component APIs (`import { … } from "@/components/app"`)
```tsx
<SequencesView state? tab: "sequences" | "pool" onTabChange pool: Mailbox[] onPoolChange newSignal? />
<StepList seq active? issues onOpen(i) onGate?(i, gate) onAdd? openCondition? />   <GateRow gate editable onChange? n />   // condition menu: "Opened, no reply" has CONDITION_HINT
<Select … options: { value, label, meta?, lead?, hint? }[] menuWidth? />   // M7: hint = a second line in the menu only
<StepEditor seq i onClose onChange(step) preview onPreview(id) copilot onCopilot(open) tried issues />
<Preview subject body r audience onPreview? tried? />   <CopilotPanel c onUse onKeep />
<SeqHeader seq actions />  <RunNumbers seq />  <PausedBanner seq />  <IssuesBanner issues onFix(step) />  <Launching seq />  <SeqTag status />  <SeqList … />
<PoolView pool today onCap(id, cap) onReconnect(id) onResume(id) onBounces(id) />   <MailboxCard m today onCap? onReconnect? onResume? onBounces? />   <PoolLine pool />
<AppShell … pool?: { sent, cap, mailboxes, attention } onPool? />   // omitted: the M1 sample widget, unchanged
```
Logic (`lib/sequences/sequence.ts`): `VARIABLES`, `varDef`, `tokensIn`, `suggestVar`, `render(text, recipient)` → parts (text · var · fallback · missing · unknown), `plain`, `CONDITION_TEXT`, `CONDITION_SHORT`, `CONDITION_HINT` and `OPENS_NOTE` (M7), `EXITS`, `stepDays`, `spanDays`, `summaryOf`, `gateText`, `subjectOf`, `pct`, `rate`, `issuesOf`, `WARMUP_DAYS`, `warmupCap`, `todayCap`, `tomorrowCap`, `bounceSpike`, `healthOf`, `poolSummary`, `sendDays`. Demo data (`components/app/sequences/data.ts`): `DRAFT`, `FIXED_STEPS`, `LIVE`, `RECIPIENTS`, `MISSING_WHY`, `COPILOT`, `POOL_HEALTHY`, `POOL_ISSUES`, `seedFor(state)`. `SEQUENCE_REVIEW_STATES` (13).

### What Krak wires (ENG-84, backend TBD)
- **Sequence CRUD:** sequences (name, product, audience segment, send window, status draft / launching / running / paused, who paused and a note), steps (thread, subject, body, gate), autosave ("Edited 12 min ago").
- **Scheduler:** enrollment (skip companies already in a sequence), per-recipient time zone and morning window, weekends off, rotation across the pool with 2–7 min jitter, caps and warm-up, spreading a launch and a resume. `launching` progress (re-check, fill, schedule) from the backend.
- **Conditions and exits:** open tracking for `opened-no-reply` / `not-opened`; reply, OOO (with return date), meeting booked (Cal.com), bounce and unsubscribe detection ending or pausing per person. Replies land in the Unibox (M1).
- **Variables:** values per recipient with provenance (M4 fields), fill counts per variable per audience (`missing`), fallbacks; `sender_first_name` from the sending mailbox; `unsubscribe_link` as a one-click, no-login link (and the `List-Unsubscribe` headers).
- **Launch checks server-side too** (same rules as `issuesOf`); block the launch API on any issue.
- **Copilot:** draft from the product's KB with claim → KB-line citations, left-out items with reasons (conflicts, removed sources), Never-say checks. Never uses text that isn't in the KB.
- **Pool:** mailboxes (provider, owner, state, cap, warm-up day, today's sends and bounces, 30-day bounce and complaint rates, SPF/DKIM/DMARC), auto-rest on a bounce spike and domain hold, Reconnect via the provider's OAuth (Google / Microsoft), cap changes, "Send again now". Feed the sidebar widget (`pool` on `AppShell`).
- Stats per sequence and per step (sent, opened, replied, bounced, due next). Review mode: `?state=` seeds each state.

### Tests
- Added: `components/app/sequences/sequences.test.tsx` (19: empty → blank / Corral, draft gates editable, the conditions menu, add a step, new from the top bar, list navigation, the editor's variables / fallback / unsubscribe / preview picker / tabs, Corral's draft with cites and Use / Keep, the errors state and Fix in step, the Launch dialog, **a live launch from fixing to Running**, cancel launch, pause with Undo, resume, loading / error / retry, the pool's reconnect / bounces / send again / cap, and the pieces alone), `lib/sequences/sequence.test.ts` (15), `lib/sequences/state.test.ts` (2), and a page case in `test/pages.test.tsx`.
- For ENG-84: the e2e from ticket (build a sequence → fix the checks → launch → running), component tests against real data, axe on every `?state=` (a spec spreading `SEQUENCE_REVIEW_STATES` like `e2e/leads.a11y.spec.ts`), visual baselines at 1440 and 390 (CI-only). **Existing baselines that change:** `/app?view=sequences` (was the pending placeholder) and `/styleguide` (§36–39). The sidebar pool widget is now a button when `onPool` is passed (AppDemo passes it), same look; its numbers are unchanged outside `state=mailboxes`.

### Open questions
1. Warm-up ramp: `2·day + 2` to the cap over 14 days matches onboarding (day 3 = 8). Is that the provider-safe curve, or should it come from the backend per provider?
2. Bounce-spike thresholds (≥ 3 bounces, ≥ 3%, ≥ 3× the 30-day rate) and resting until 08:00 the next day: right? Should a spike also pause the sequences it was sending for?
3. ~~Editing a running sequence: the design says pause first. Do we want live edits that apply to unsent emails instead?~~ **Decided (M7):** running sequences are read-only; pause to edit, and edits apply only to emails not yet sent. See decision 9.
4. ~~Is "Opened, no reply" worth offering given Apple Mail privacy opens?~~ **Decided (M7):** offer it with the reliability hint, never as the default. See decision 12.
5. Does a launch skip companies already in any sequence, or only in the same product's sequences? The design skips "already in Cold-room pilot".
6. ENG-56's GitHub link is `Uzski-Corp/camposocial-client` #165 (ENG-84: #193), like ENG-53/54/55. Right repo, or stale?

## 15. Unibox: panes, triage, thread view, Corral's draft states (M7, ENG-57 → build ENG-85)

The Unibox is **extended, not forked**. The M1 `ThreadList`, `ReadingPane`, `ContextRail` and `ReplyCard` (`components/app/Unibox.tsx`, `ReplyCard.tsx`) take a few optional props; without them they render exactly the M1 markup, so the marketing `<Unibox />` and the styleguide's M1 sections are unchanged. The app's Unibox view moved out of `AppDemo` into `components/app/unibox/UniboxView.tsx` and grew: **filter chips** over the list, a **triage** menu on the thread (six kinds, keys 1–6, each saying what Corral does next), the thread with its **earlier steps**, the rail with **fit (M5)**, the **sequence the reply came from (M6)** and the **mailbox the answer goes from**, and **Corral's draft** in every state from drafting to send-with-undo. Styleguide §39–41 ("Things that float" moves to §42). Logic is pure and tested in `lib/unibox/triage.ts` and `lib/unibox/draft.ts` (review states in `lib/unibox/state.ts`); components are in `components/app/unibox/` (`UniboxView.tsx`, `Triage.tsx`, `Thread.tsx`, `Copilot.tsx`, demo data `data.ts`, CSS `unibox.css` with `u-*` classes, imported in `app/globals.css`).

**Baseline: this batch assumes M4, M5 and M6 are applied.** It is built on worktree HEAD 6ec9c71 (branch `eng-56-sequences`: M4 682fed6, M5 684b673 = PR #13, M6 6457eec + Krak's axe spec 6ec9c71 = PR #14). The M6 files in that HEAD are byte-identical to the M6 batch. M7 edits M6 files (`AppDemo`, `Shell`, `app/app/page.tsx`, `components/app/index.ts`, `sequences/Steps.tsx`, `sequences/sequences.css`, `lib/sequences/sequence.ts`, the styleguide page and CSS, `test/pages.test.tsx`, this document), so apply it on top of PR #14.

### Routes and states (`/app?view=unibox&state=…` outside production; `view` can be left out, the Unibox is home)
| `?state=` | What shows |
|---|---|
| `panes` | Needs you **6** (the sidebar count follows it): filter chips **Unread 3 · Interested 2 · Objection 1 · Referral 1** over the list; Brian Kamau's thread with the triage button (Objection ▾), his two earlier Cold-room pilot steps one line each, his reply, Corral's receipts and the cited draft; the rail: Pwani Fresh, **Fit 91 · Strong fit · medium confidence · scored Sep 27** with the three checks that carried it and **Why it scored 91**, key people, **Cold-room pilot · step 2 of 4 · Stopped: replied** with the step trail (1 sent Mon 21 Sep, 2 replied, 3–4 won't send), signals, **Replies go from tomas@coldtrace.io**. At 390 the list shows first. |
| `filtered` | Interested + Objection, unread only: Brian and Wanjiru; **Clear**. |
| `triage-menu` | The menu open on Brian: Interested · Objection (checked) · Referral · Out of office · Unsubscribe · Bounce, each with its key and what Corral then does ("Pauses the sequence; back in Needs you the day they return", M8); the last three say "handled for you". |
| `referral` | Sofia forwards to Aline: **Intro to Aline** as a new thread to aline@kivucoffee.rw with Sofia in cc, citing the one-line pitch; **Send intro**. |
| `ooo` · `unsubscribe` · `bounce` | In **All** (9): Daniel (out until 14 Oct; Cold-room pilot **Paused until 15 Oct, 09:00**; M8: "Back in Needs you Wed 14 Oct, 08:00, the day he's back"), Neema Mushi (Dodoma Dairy Co-op; "won't write to neema@dodomadairy.co.tz again, from any sequence or mailbox"), Juma Magesa at mwanzafish.co.tz (the bounce from Mail Delivery Subsystem, `554 5.7.1`; domain held, as in M6's bounce spike on ops@; Rehema Said found instead). Each reads **Corral handled this** with what it did, **It needs me** and **Change triage**; list rows carry "✓ Handled by Corral". |
| `thread` | Wanjiru's thread: both earlier steps (open any), her reply **as plain text** with **Quoted text hidden** and **2 remote images blocked · Load from kilima.co.ke**, "Shown as plain text. Links open in a new tab and show their real address first."; rail fit **94 · high confidence** from the M5 Kilima score with **Why it scored 94** → `/app?view=companies&state=fit`; sequence → `/app?view=sequences&state=running`. |
| `keys` | The shortcuts sheet (Move · Triage · Reply). |
| `drafting` | "Corral is drafting" (aria-busy): ✓ Read the thread: 3 messages · Checking the knowledge base for ColdTrace Sensors · Writing, then checking against Never say; skeleton lines; **Stop**. |
| `draft` | Brian's draft with cite markers 1–3 and **3 claims, each from a knowledge-base line** (section, the line, source file · page), **Left out. No price: the knowledge base has $35 and $39…**, ✓ Checked against Never say; **Send reply ⌘↵ · Edit R · Redraft ▾** (Shorter / Warmer / More direct). |
| `low` | Amara asks about a −35 °C blast freezer: **Low confidence**; the unsure sentence is marked and says you'll check; why: the KB gives −30 °C to +60 °C for the gateway only, and pages 12–18 of Gateway spec sheet v4.pdf are scanned (M2 partial source); **Add it to the knowledge base**. |
| `refused` | Grace (for Mercy) asks "Is ColdTrace FDA approved?" and for same-day install in Arusha: **Corral won't draft this one**, each ask next to the Never-say rule it hits; **Draft without those claims** (a safe draft: "The FDA doesn't approve temperature sensors… 21 CFR Part 11", no install promise) / **Write it myself**. |
| `edited` | **Your reply · Edited by you · 1 sentence changed**; a caution: "$35 a month: the knowledge base has two prices ($35 and $39). Check before sending."; your sentences aren't checked against the KB, only Never say and prices; **Back to Corral's draft**. A Never-say phrase blocks the send and outlines the check. |
| `undo` · `sending` · `sent` | **Sending to Brian in 7s** (a ring counting down 10 s) · from tomas@coldtrace.io · **Undo ⌘Z**, the reply shown pending in the thread · "Sending from tomas@coldtrace.io, in this thread" · your reply in the thread at 09:44, "Cold-room pilot stays stopped for Brian". |
| `failed` | **Not sent**: "Google didn't take it at 09:44. Your reply is kept here, word for word. Corral tries once more on its own in 5 minutes, or try now." `421 4.7.0 Try again later, closing connection.`; **Try again** / **Edit**. |
| `disconnected` | Amara's thread is in hello@coldtrace-mail.com, **disconnected since 06:12** (M6 pool): "replies go from the mailbox the thread is in so Amara sees one conversation"; **Reconnect hello@** / **Keep as draft**; the rail's mailbox dot turns red. |
| `conflict` | Amara Njoroge (teammate, her own photo since M8) replied to Brian at 09:51 while you were writing: her message in the thread, your reply **On hold** so Brian doesn't get two answers; **Discard mine** / **Keep as a note for Amara** / **Send mine too**. |
| `conflict-lead` (M9) | Brian wrote again at 09:53 while you were writing ("One more thing before you reply: our CFO wants numbers before any call…"): his message in the thread tagged **Wrote again**, your reply **On hold: Brian wrote again**: "Brian wrote again at 09:53, while you were writing. Your reply is on hold so it answers what he said. Redraft answers both emails; nothing was sent." **Redraft** (primary, the safe default: Corral drafts against both emails; the new draft cites Kilima and the free pilot and leaves out the price, since the knowledge base disagrees) / **Edit mine** / **Send mine anyway** (the 10 s undo as usual). His message stays in the thread whichever you pick. |
| `empty` · `loading` · `error` | **Nothing needs you** ("Corral handled 3 on its own… they're in All", **See what Corral handled**) · list, pane and rail skeletons · "Couldn't load the Unibox" `GET /threads?tab=needs · 503`, **Try again** ("replies are still arriving… nothing was sent or archived"). |

No state (`/app` or `/app?view=unibox`) is live: every triage, filter, draft, edit, send, undo, retry, reconnect and conflict action works.

### Decisions
1. **Six triage kinds, one key each** (`TRIAGE`): 1 Interested, 2 Objection, 3 Referral, 4 Out of office, 5 Unsubscribe, 6 Bounce. Each says what Corral does next. **OOO, unsubscribe and bounce are handled by Corral** (`handled`): out of Needs you, in All, marked in the row, with a note and **It needs me**. Other M1 statuses (Meeting booked, Not interested) keep their tags and aren't triage kinds. Re-triaging toasts with **Undo**.
2. **Needs you = not handled, not snoozed.** The sidebar count follows it (`AppShell counts`). Meetings = Meeting booked. Snoozed (H) comes back Monday 08:00. All = everything.
3. **Filters are chips**, in the list column (outside the listbox): Unread plus each triage kind that has threads in the tab, with counts, and Clear. They wrap on desktop and scroll sideways at 390.
4. **Email is rendered as text, never raw HTML.** Quoted history is folded, remote images are blocked until asked for (per sender domain), links show their real address. This is the safe-rendering rule ENG-85 tests. Earlier messages in the thread are one line each until opened.
5. **Replies go from the mailbox the thread is in** (M6 pool), never another one: a disconnected mailbox holds the reply with Reconnect, rather than rerouting it.
6. **Corral's drafts cite the knowledge base** (M2 lines, numbered, with the source file), say what they left out (no price while the KB has $35 and $39; no install date outside Nairobi/Mombasa), and are checked against Never say. **Low confidence** marks the sentence it can't support and phrases it as a follow-up, with a way to add the fact. **Never-say asks are refused**: no draft at all, the asks shown next to the rules, and two ways on.
7. **Your edits are checked before sending** (`checksOf`): empty and Never-say block; a price the KB disagrees on cautions. Pressing Send with a blocker doesn't send; it says why and outlines the check (M6 rule: never a silent disabled button).
8. **Send waits 10 seconds for Undo** (`UNDO_SECONDS`, ⌘Z), then sends. A sent reply stays in the thread and the sequence stays stopped. **Failed** keeps the words and retries once on its own. **Conflict**: if a teammate replied after you started, the reply is held; the safe default is Discard.
9. **Keyboard:** J/K move, ↵ opens, Esc back (phone), 1–6 triage, T menu, R reply (edit Corral's draft, draft one, or write from a refusal), ⌘↵ send (also from the textarea), ⌘Z undo send, E archive, H snooze, ? sheet. Keys don't fire while typing or in a dialog/menu; the triage menu takes ↑↓, ↵, 1–6 and Esc itself.
10. **Mobile (390):** list → thread as full screens with the back row, chips scroll, the pane head truncates to one line, receipts wrap, draft heads wrap, send-state reasons sit above the text.
11. **Sample-data alignment:** Wanjiru's pilot terms now follow the M2 KB (30 days, up to three rooms, free); the M1 marketing sample (60 days, "install in a morning") is untouched. Brian's M7 draft drops the M1 "paid the sensors back in one quarter" line (not in the KB).

### Decisions recorded in M8 (answers to the §15 open questions)
12. **Out of office counts as handled** (decision 1 stands; Needs you is 6, not 7). **It comes back to Needs you on the return date when Corral can read one**, at 08:00 that day (`lib/unibox/ooo.ts`: `returnDate(text, today)` reads "until 14 October", "back on Oct 14th", "returning 14/10", day first; a date already past rolls to next year; "away from 5 Oct until 14 Oct" takes the 14th; anything it can't trust returns nothing). Daniel's note now ends "Back in Needs you Wed 14 Oct, 08:00, the day he's back". The sequence still resumes the day after (15 Oct, 09:00, his morning). With no date it can read, the thread stays in All, the sequence pauses 14 days, then resumes (decided in M9, §16 decision 16).
13. **The undo window is 10 seconds** (`UNDO_SECONDS`, server-side delay), for every reply including first replies to a new contact.
14. **Any message newer than the draft holds a send, from the lead or a teammate.** The draft remembers the newest message it was written against; if the thread has anything newer at send time, the send is held. A teammate's message shows the M7 `conflict` card (Discard mine / Keep as a note / Send mine too). A newer message from the lead uses the same held card with the lead's message above it and the copy "{First} wrote again at {time}, while you were writing. Your reply is on hold so it answers what {she/he} said." with **Redraft** (Corral drafts against the new message), **Edit mine** and **Send mine anyway**; the safe default is Redraft. Review states: `conflict` (a teammate) and, since M9, `conflict-lead` (the lead); ENG-85 tests both.
15. **"Not opened" gets the reliability hint too** (`NOT_OPENED_NOTE`: "Opens are a guess, so some people who read it may still count as not opened."). `CONDITION_HINT` now has both open-based conditions; the gate note shows under whichever is chosen, and the option in the menu carries it.
16. **Teammate Amara Njoroge has her own photo** (`av-njoroge.jpg`, Pexels 28606691, reference only, credited in `round3/IMAGE-SOURCES.md`); the lead Amara Nwosu keeps `av-amara.jpg`. The thread's teammate message and the M2 knowledge-base "by" lines use it.

### Component APIs (`import { … } from "@/components/app"`)
```tsx
<UniboxView threads setThreads active setActive tab setTab pane setPane state? onArchive(id) hotkeys? />   // tab: "needs" | "meetings" | "snoozed" | "all"
<ThreadList … tag?(t) />   <ReadingPane t tag? history? message? draft? />   <ContextRail t fit? sequence? extra? />   // M1 props unchanged
<ReplyCard paragraphs? from? focus? highlight? title? meta? children? note? foot? tone?: "caution" | "negative" busy? label? />
<FilterChips list filters onChange />   <RowTag t />   <TriageMenu t open onOpenChange onPick(triage) />   <KeysSheet open onClose inline? />
<History msgs />   <Message t safe? />   <SentMessage text at from pending? />   <TeammateMessage who email at body />
<FitSummary t />   <SequenceTrail t />   <MailboxLine t disconnected? />
<DraftArea t model? copilot? kind send text original undoLeft from tried? handledNote? a: DraftActions />
<AppShell … counts?: { unibox: "6" } />   <Select … options: { …, hint? }[] menuWidth? />
```
`Thread` gains optional `email`, `sender`, `triage`, `handled`, `snoozed`, `mailbox`, `history: ThreadMsg[]`, `seq: { id, name, step, of, state }`; `company` accepts any name. Logic: `lib/unibox/triage.ts` (`TRIAGE`, `triageDef`, `triageByKey`, `triageOfStatus`, `triageOf`, `filterThreads`, `triageCounts`, `isFiltered`, `toggleTriage`, `step`), `lib/unibox/draft.ts` (`DraftKind`, `SendKind`, `UNDO_SECONDS`, `NEVER_SAY`, `neverSayHits`, `PRICE_CONFLICT`, `priceIssue`, `checksOf`, `canSend`, `paragraphs`, `stripMarks`, `marks`, `changedSentences`), `UNIBOX_REVIEW_STATES` (23). Demo data: `UNIBOX_THREADS`, `UNIBOX_COPILOT`, `HANDLED_NOTE`, `BRIAN_EDIT`, `TEAMMATE_REPLY`, `SEND_ERROR`, `DISCONNECTED`, `uniboxSeedFor(state)`; `inTab`, `needsYou`, `neighbour`, `UNIBOX_TABS`.

### What Krak wires (ENG-85, backend TBD)
- **Threads:** list per tab with counts (Needs you excludes handled and snoozed), unread, snooze until, archive (with undo), the sidebar count (`counts.unibox`). Earlier messages per thread, sender vs person (bounces), the thread's mailbox.
- **Email rendering:** sanitize to text (or a strict allow-list), fold quoted history, block remote images with per-domain "load", rewrite links to show their target. This is the "safe rendering of email HTML" test in ENG-85.
- **Triage:** classifier result (kind + confidence) per reply; manual re-triage with undo; handled kinds acting server-side (OOO pause until the return date, unsubscribe suppression across every sequence and mailbox, bounce: mark the address, hold the domain, find another contact).
- **Copilot:** draft from the product's KB with claim → KB-line cites, left-out items, a low-confidence flag with the unsupported sentence and why, refusals on Never-say asks, redraft variants. Same rules as M6's step copilot.
- **Send:** from the thread's mailbox only; 10 s server-side delay so Undo cancels; provider errors (code + text) back to the card; automatic single retry; disconnected mailbox → hold; **conflict detection**: a newer message in the thread (teammate or contact) since the draft opened holds the send.
- Rail data: M5 score with confidence and top checks, M6 sequence step and state per person, mailbox state. Review mode: `?state=` seeds each state.

### Tests
- Added: `components/app/unibox/unibox.test.tsx` (30: data and seeds; panes; filters and clear; no-match; the triage menu and its keyboard; **keyboard triage** J/K/1–6/E/H and the next selection; the keys sheet; handled threads and handing back; OOO and bounce; **safe rendering** (history, quoted text, images); the referral intro; empty / loading / error; drafts ready, drafting → ready and Stop, low, refused → safe draft / write your own, edit checks (price caution, Never-say block); **send → undo → sent**; undo / sending / sent held still; failed → retry; disconnected → reconnect / keep; conflict → discard / note / send too; keys ignored while typing; the M1 pieces unchanged), `lib/unibox/triage.test.ts` (5), `lib/unibox/draft.test.ts` (5), `lib/unibox/state.test.ts` (2), `components/app/sequences/opens-hint.test.tsx` (2, the §14 hint), and a page case in `test/pages.test.tsx`.
- For ENG-85: the e2e of the reply flow (open → triage → edit → send → undo → send → sent), the safe-rendering test against hostile HTML (scripts, remote images, tracking pixels, deceptive links), component tests against real data, axe on every `?state=` (a spec spreading `UNIBOX_REVIEW_STATES` like `e2e/sequences.a11y.spec.ts`; the review project's `REVIEW_SPECS` regex needs `unibox`), visual baselines at 1440 and 390 (CI-only). **Existing baselines that change:** `/app` and `/app?view=unibox` (filters, triage button, rail fit and sequence, the draft card), `/styleguide` (§39–42), the sidebar Unibox count (7 → 6: OOO is handled now), and the sequences condition menu (the hint).

### Open questions
1. ~~Is OOO really "handled"?~~ Yes (M8 decision 12): handled, back in Needs you on the return date. ~~No readable date?~~ Stays in All, the sequence pauses 14 days, then resumes (M9, §16 decision 16).
2. ~~Undo window~~: 10 seconds for every reply (M8 decision 13).
3. ~~Conflict rule~~: any newer message, from the lead or a teammate, holds the send (M8 decision 14).
4. ~~"Not opened" hint~~: yes, same kind of hint (M8 decision 15).
5. ~~Amara Njoroge's photo~~: her own photo (M8 decision 16).
6. ENG-57's GitHub link is `Uzski-Corp/camposocial-client` #166 (ENG-85: #194), like ENG-53–56. Right repo, or stale?

## 16. Handoffs and integrations: Cal.com, Phoenix ERP, AutoSend, Settings → Integrations (M8, ENG-58 → build ENG-86)

A reply turns into a meeting, the meeting into a deal, and the deal gets its follow-up. M8 designs the three handoffs **where you already are** (the meeting as an event in Grace Holloway's thread, a **Handoffs** section in the Unibox rail, **Meeting and handoffs** on the lead) and the one place they are set up: **Settings → Integrations** (`/app?view=settings`), the first designed Settings page. Styleguide §42 Handoffs, §43 Integrations ("Things that float" moves to §44). Logic is pure and tested in `lib/handoff/handoff.ts` (rules, retry, idempotency), `lib/integrations/integrations.ts` (health, mapping, payload, logs) and `lib/unibox/ooo.ts` (the §15 OOO decision); review states in `lib/handoff/state.ts` and `lib/integrations/state.ts`. Components are in `components/app/handoff/` (`Handoff.tsx`, `Integrations.tsx`, demo data `data.ts`, CSS `handoff.css` with `h-*` (handoffs) and `i-*` (integrations) classes, imported in `app/globals.css`).

**Baseline: this batch assumes M4, M5, M6 (PR #14) and M7 are applied.** It is built on worktree HEAD 590b936 (branch `eng-57-unibox`: M7 c49bbe7, byte-identical to the M7 batch, + Krak's Unibox axe spec 590b936), which also holds M4, M5 and M6. M8 edits M7 files (`AppDemo`, `unibox/UniboxView.tsx`, `unibox/data.ts`, `unibox/Triage.tsx`, `unibox/Thread.tsx`, `lib/unibox/state.ts`, `lib/unibox/triage.ts`, `components/app/data.ts`, `app/app/page.tsx`, the styleguide page and CSS, `test/pages.test.tsx`, this document), plus M2 (`kb/data.ts`), M3 (`leads/Detail.tsx`, `leads/Leads.tsx`, `leads/data.ts`, `lib/leads/state.ts`) and M6 (`lib/sequences/sequence.ts`, `sequences/Steps.tsx`, `sequences.test.tsx`, `opens-hint.test.tsx`) files, so apply it after M7.

### Routes and states
**Thread and lead** (`/app?view=unibox&state=…`, and the same names on `/app?view=companies&state=…`, which opens Nyota Beverages). All are Grace Holloway (VP Operations, Nyota Beverages, fit 84), 20 min intro · ColdTrace Sensors, **Thu 1 Oct, 10:30–10:50 EAT**, Google Meet, host Tomás Ibarra, guests Grace and **Mercy Mushi** (QA lead, added by Grace), booking `bk_7Hq2Lw`.

| `?state=` | What shows |
|---|---|
| `meeting-booked` | Meetings tab. **Grace booked a meeting** · Cal.com · Yesterday, 16:18 (Booked) with the time, guests and receipts (BOOKING_CREATED, signature checked · Cold-room pilot stopped at step 3 · Deal PX-2288 opened in Phoenix, Discovery · AutoSend: Before your call, Wed 30 Sep, 10:30), placed where it happened, before Grace's "Booked for Thursday…" note. Rail **Handoffs**: Cal.com Booked · Phoenix ERP **Deal opened** PX-2288 · Discovery · AutoSend **Scheduled**. This is also what the live app shows (Grace's thread and Nyota's lead). The M7 `refused` draft still applies to her FDA question. |
| `meeting-rescheduled` | **Grace moved the meeting** · Today, 09:20: **Mon 5 Oct, 14:00–14:20 EAT**, was ~~Thu 1 Oct, 10:30~~; her reason from Cal.com ("Mercy is at the Arusha plant on Thursday."). Deal updated (same deal, same stage); Before your call **Moved** to Fri 2 Oct, 14:00 (24 h before is a Sunday, so Friday). Row tag "Meeting moved". |
| `meeting-cancelled` | Back in **Needs you**, status Interested. Grace's email ("…I've cancelled Thursday. Can we pick this up after the 15th?"), then **Grace cancelled the meeting** (struck time, her reason). Deal **back to Lead, still open**; Before your call **Stopped** (not sent). Corral's draft for a person: "After the 15th works well: pick any time… cal.com/tomas/20min", left out: "Doesn't suggest a date before the 16th". Row tag "Meeting cancelled". |
| `meeting-no-show` | Back in **Needs you**. **Nobody from Nyota joined** · Thu 1 Oct, 10:45 (No-show): "You marked Grace and Mercy as no-shows at 10:45 in Cal.com." Deal back to Lead with the no-show noted; After your call **Held**. One personal draft ("Sorry we missed each other… ten minutes works too"), nothing automatic. |
| `deal-error` | The booking is fine; under it: **Not in Phoenix yet: 401 invalid_signature.** "Someone changed the signing secret in Phoenix, and Corral still signs with the old one. A 401 won't fix itself, so Corral isn't retrying." (tried once, 16:18) · **Update the secret** (→ `settings&state=error`) · **Try again now**. Rail: Phoenix **Not sent**. |
| `deal-duplicate` | **Phoenix already has Nyota Beverages Ltd (ACC-0192).** Open deal PX-2210 "QA sensors, Dar es Salaam", owned by Wanjiru Kamau, at Discovery, last touched Sep 12. "Corral won't choose for you." A choice: **Add this meeting to PX-2210** (default: same website, still open; Wanjiru gets a note) · **Open a new deal under ACC-0192** · **Don't send it to Phoenix**; **Send to Phoenix** / **Keep it out of Phoenix**. |
| `nurture-off` | AutoSend isn't connected: **Before your call can't go.** "It's due Wed 30 Sep, 10:30. Corral won't send it from your cold mailboxes…" · **Connect AutoSend** (→ `settings&state=connect-autosend`). Rail: AutoSend **Waiting**. |

**Settings → Integrations** (`/app?view=settings&state=…`):

| `?state=` | What shows |
|---|---|
| `integrations` (and live) | Sub-nav (Workspace, Team, Mailboxes →, **Integrations**, API keys, Billing; the others keep their place with a line). The flow **1 Reply (Unibox) → 2 Meeting (Cal.com) → 3 Deal (Phoenix ERP) → 4 Follow-up (AutoSend)**, each with its connection's dot. Three rows: tile, name, role, pill, what it does, last event (mono), one action (**Manage**). Footer: "Everything in and out is signed and logged. Replays are safe…" |
| `none` | Nothing connected: "Corral still finds, writes and replies without them. Start with Cal.com…"; three **Connect** (Cal.com primary). |
| `connect-cal` · `connecting` | **Connect Cal.com**: Corral can / Corral never, "one webhook… signed", **Continue to Cal.com** · **Waiting for Cal.com** (spinner; I'm back; Open cal.com again). Cancel leaves it off. |
| `connect-erp` · `connect-erp-failed` | **Connect Phoenix ERP**: the address (https only), the signing secret Corral made (shown once, Copy), "Let Phoenix tell Corral when a deal is won or lost", and the test deal: **delivered: 200 in 0.4 s** / **failed: 401 invalid_signature** with three things to check (secret exact incl. `whsec_`, restart Phoenix, server clock within five minutes); Connect is disabled until the test passes. |
| `connect-autosend` | Back from AutoSend sign-in: **Project**, **Send as** (a verified sender on AutoSend's domain, never a cold mailbox), journeys **Before your call** / **After your call**; "Only people who replied or booked go to AutoSend"; Use an API key instead. |
| `connected` | Cal.com page: Overview (connected as, link in drafts, the six triggers it listens for (four statuses; a no-show three ways since M9), signed with X-Cal-Signature-256, since), What Corral does with it, tabs Overview · Logs · Permissions; **Disconnect**. |
| `reauth` | Cal.com **Needs sign-in**: "Cal.com's sign-in expired at 06:40. Bookings still arrive and are kept… 1 booking from 07:55 is waiting. Reconnect and it catches up; nothing is lost." **Reconnect Cal.com**. |
| `error` | Phoenix **Failing**: "Phoenix is refusing deals: 401 invalid_signature since 08:12… 2 deals are waiting; Corral isn't retrying, because a 401 won't fix itself." **Update the secret**; Logs tab counts 2. |
| `disconnect` | **Disconnect Phoenix ERP?** (danger): what stops (deals, won/lost coming back, the secret is deleted) and what stays (deals already in Phoenix). The toast offers **Reconnect**. |
| `logs` | Phoenix log (kept 30 days, secrets never logged): All · Problems 2 · From Phoenix ERP · From Corral. Rows: time, event (in/out), about, result pill + code + ms + attempt. The failed `deal.create` is open: why, **Sent** (headers with the signature redacted, Idempotency-Key) and **Came back**, **Replay** "with `corral:deal:mwanza:bk_Q81xRr`, so Phoenix can't open it twice". |
| `mapping` · `mapping-errors` | Phoenix field mapping: each Phoenix field (label, Required, id · type), **Filled from** (a Select of Corral fields with their type), **For Grace** (the value). **What Phoenix gets** (the JSON payload). Errors: "2 fields need you before deals can go. Deals wait until it's fixed; nothing is dropped." Deal owner required and empty; Fit score (number) filled from Sequence and step (text). **Save mapping** disabled with the reason beside it; **Send a test deal**. |
| `scopes` | Cal.com **Permissions**: Corral can (with why), Corral never, **Where the key lives**, how to revoke from Cal.com. |
| `autosend` | AutoSend page: its role and **Two engines, never mixed**: your mailbox pool (cold email and every reply, one to one, no unsubscribe header, 30–35 a day) → AutoSend on mail.coldtrace.io (after they reply or book; Before your call, After your call; unsubscribe link that stops Corral too), and why. |
| `loading` · `load-error` | Skeleton rows · "Couldn't load integrations" `GET /api/v1/integrations · 503`, "Nothing was disconnected. Bookings, deals and follow-ups keep flowing." **Try again**. |

### Decisions
1. **Handoffs live where the lead is.** No handoff inbox: the meeting is an event in the thread, the three handoffs are one line each (rail, lead), and only what needs a person gets a card under the meeting. Settings is for setting up and for looking back (logs).
2. **Cal.com webhooks, by Cal.com's names:** `BOOKING_CREATED` (booked), `BOOKING_RESCHEDULED` (moved), `BOOKING_CANCELLED` (cancelled), `BOOKING_NO_SHOW_UPDATED` (no-show marked by the host) (`CAL_TRIGGER`). Since M9 a no-show also comes from Cal Video on its own, `AFTER_HOSTS_CAL_VIDEO_NO_SHOW` / `AFTER_GUESTS_CAL_VIDEO_NO_SHOW`, treated the same (`CAL_TRIGGERS`, `statusForTrigger`; decision 17). Every delivery is checked against `X-Cal-Signature-256` (HMAC-SHA256 of the body with the webhook secret); unsigned or wrong is rejected (401) and logged, never read. Deliveries are de-duplicated on the booking uid + trigger (the log shows the second one as **Duplicate**, 200, not acted on).
3. **The rules** (`afterMeeting(status, { autosend })`):

| Meeting | Sequence | Unibox | Phoenix deal | AutoSend | Draft |
|---|---|---|---|---|---|
| Booked | stops | Meetings | create at Discovery | Before your call, 24 h before | no |
| Moved | stays stopped | Meetings | update (same deal, new time) | Before your call moves | no |
| Cancelled | stays stopped | **Needs you** | update → Lead, still open | stopped | a personal note |
| No-show | stays stopped | **Needs you** | update → Lead, still open, no-show noted | After your call held | a personal note |

   Nothing restarts the cold sequence on its own. Cancelled and no-show never close or delete anything in Phoenix.
4. **"Before your call" goes 24 hours before**, moved back to Friday at the same time when that lands on a weekend (`beforeCall`), in the attendee's time.
5. **AutoSend's role: the second engine.** Cold email and every reply stay one-to-one in the mailbox pool (no unsubscribe header, no tracking images). Only people who **replied or booked** go to AutoSend, which sends from its own domain (mail.coldtrace.io) with an unsubscribe link, and an AutoSend unsubscribe stops Corral too. When AutoSend isn't connected, its email **waits**; Corral never sends it from a cold mailbox. Events: `meeting_booked`, `meeting_ended`. Cancelled, no-show and unsubscribed start nothing automatic.
6. **Phoenix ERP gets one deal per lead and meeting**, pushed signed (HMAC-SHA256 + timestamp, `X-Corral-Signature`, `X-Corral-Timestamp`; Phoenix drops anything older than five minutes) with an **idempotency key** `corral:deal:{lead}:{bookingUid}` (updates add `:v{n}`) so a retry or a replay can't open a second deal (`idempotencyKey`). Stages: booked/moved → **Discovery**, cancelled/no-show → **Lead** (`STAGE_FOR`); **Won/Lost only come back** from Phoenix (signed, same secret) and stop every sequence for that company.
7. **Retries:** a 5xx, 408, 429 or network error retries at 1, 5, 30 min, 2 h and 6 h (six attempts), then needs you (`RETRY_MINUTES`, `nextRetry`, `retryable`). Any other 4xx (401, 403, 409, 422) **isn't retried**: it won't fix itself; it says why and what to fix.
8. **A duplicate in the ERP is a question, not a merge.** Phoenix answers 409 with the account and open deal; Corral shows who owns it and how recent it is and offers add-to-deal (default when the domain matches and the deal is open), a new deal under the account, or don't send. It never merges on its own.
9. **Field mapping is explicit and previewed.** Every required Phoenix field must be filled from a Corral field of a type that fits (`mappingIssues`, `fits`: a number fits a text field, not the reverse); the payload for a real lead (Grace) is shown; Save is disabled while anything needs you, with the reason beside it. When Phoenix adds a required field, deals **wait**, nothing is dropped.
10. **Connection health is five words** (`healthOf`): Not connected, Connecting, **Connected**, **Needs sign-in** (caution: things are kept and wait), **Failing** (negative: say since when, what's waiting, and whether Corral is still retrying). A connection that needs you shows it on its row with the one action, and at the top of its page.
11. **Permissions are said in plain words** before connecting and on the Permissions tab: what Corral can (with why), what it never does, where the key lives, how to revoke from the other side. Secrets are shown once when made and afterwards only as `whsec_••••9f2c` (`redact`); the Phoenix address must be https, public, with no credentials in it (`urlProblem`).
12. **Logs per integration**, 30 days, in and out: time, event, about, result (Delivered · Duplicate · Rejected · Failed), code, ms, attempt; a row opens to what was sent and what came back (signature redacted), and failed pushes **Replay** with the same idempotency key. Filters: All, Problems, from them, from Corral (`filterLogs`, `isProblem`).
13. **Disconnect is a confirm that says what stops and what stays**, and nothing in the other system is deleted; the toast offers Reconnect.
14. **Mobile (390):** Settings' sub-nav becomes a sideways scroller; the flow stacks with the arrows turned; rows put their action under the text; logs and the mapping table become stacked cards (the "For Grace" value labelled); dialogs are full width.
15. **Sample data:** Grace's thread gets `meeting: "booked"` (the live app shows the booking); Nyota's lead gets its booking and deal in Activity and "Cold-room pilot · step 3 of 4, stopped (meeting booked)" (it said "Not in a sequence"). Dates use fixed words ("Wed 30 Sep", not the locale's "Sept").

### Component APIs (`import { … } from "@/components/app"`)
```tsx
<SettingsView state? />   <Integrations state? />                     // state: SettingsReviewState
<HandoffMeeting h compact? />   <HandoffSteps h />   <HandoffRail h />   <HandoffProblems h lead? />   <HandoffSection h />   // h = handoffFor(state?)
<HandoffFlow conn />   <IntegrationLogs id initialOpen? />   <FieldMapping broken? />   <IntegrationScopes id compact? />
<LeadDetail … handoff?: ReactNode />                                  // rendered before Sequence
<AppDemo … settings?: SettingsReviewState />                          // /app?view=settings&state=…
```
`Thread` gains optional `meeting?: MeetingStatus`; `RowTag` shows "Meeting moved / cancelled / no-show". `UniboxSeed` gains `handoff?` and `patch?` (per-thread changes for a state; `AppDemo` applies them); `draftKindFor(id, copilot?)`. Logic: `lib/handoff/handoff.ts` (`MeetingStatus`, `DealState`, `NurtureState`, `CAL_TRIGGER`, `MEETING_WORD`, `ErpStage`, `STAGE_FOR`, `afterMeeting`, `beforeCall`, `RETRY_MINUTES`, `nextRetry`, `retryWords`, `retryable`, `idempotencyKey`), `lib/integrations/integrations.ts` (`Connection`, `healthOf`, `redact`, `urlProblem`, `fits`, `mappingIssues`, `dealPayload`, `LogRow`, `filterLogs`, `isProblem`, `RESULT_WORD`), `lib/unibox/ooo.ts` (`returnDate`, `backInNeedsYou`), `HANDOFF_REVIEW_STATES` (7, also spread into `UNIBOX_REVIEW_STATES` (30) and `LEADS_REVIEW_STATES` (36)), `SETTINGS_REVIEW_STATES` (18), `settingsReviewState(view, state, reviewStates)`. Demo data: `HANDOFFS`, `handoffFor`, `INTEGRATIONS`, `settingsSeed`.

### What Krak wires (ENG-86, backend ENG-76)
- **Cal.com:** OAuth connect (read bookings and event types; create/remove Corral's webhook), the webhook endpoint with `X-Cal-Signature-256` verification, a replay-safe inbox (booking uid + trigger), the four triggers mapped by `afterMeeting`, the link in drafts, reauth detection that keeps deliveries and catches up.
- **Phoenix ERP:** signed outgoing pushes with timestamp and idempotency key, the retry policy (`retryable`, `RETRY_MINUTES`), 409 → duplicate choice, the saved mapping and payload build (`dealPayload`), the signed stage-change webhook back (Won/Lost stop sequences), secret rotation with a 24 h overlap.
- **AutoSend:** connect by sign-in (OAuth) first, an API key as the fallback (decision 18), project and sender, contact upsert for people who replied or booked only, events `meeting_booked` / `meeting_ended`, unsubscribes back into Corral's suppression.
- **Settings API:** `GET /api/v1/integrations` (health per connection, last event, problem + waiting count), connect / disconnect, logs per integration (30 days, redacted), mapping get/save, test deal, replay.
- Review mode: `?state=` seeds each state.

### Tests
- Added: `components/app/handoff/handoff.test.tsx` (16: data for every state and the rules; the meeting card booked / moved / no-show and compact; the three steps; refused deal with the fix link and Try again; the duplicate choice; AutoSend waiting; nothing to show; the lead section; the Unibox in booked, cancelled and no-show (back in Needs you, row tag, draft) and duplicate; Nyota's lead in `deal-error`), `components/app/handoff/integrations.test.tsx` (16: every seed; the page and sub-nav; none; **connect Cal.com** → waiting → connected; cancel leaves it off; Phoenix test deal failed / copy secret / connect; AutoSend; reauth → reconnect; error → update the secret; **disconnect** → Reconnect; logs: open, replay, filter; mapping; broken mapping blocks Save; permissions; AutoSend's role and back; loading and load-error → retry), `lib/handoff/handoff.test.ts` (11), `lib/integrations/integrations.test.ts` (10), `lib/unibox/ooo.test.ts` (5), updated state tests (unibox 30, leads 36), `opens-hint.test.tsx` (the Not opened hint), and page cases for `settings&state=reauth` and `state=meeting-cancelled`.
- For ENG-86 / ENG-96: the e2e **connect flow** (none → Connect Cal.com → back → connected → a signed test booking lands in the thread) and **handoff flow** (booking → sequence stops → deal pushed → AutoSend event; cancel → Needs you), webhook signature and replay tests (wrong signature 401, same delivery twice acts once, stale timestamp), contract tests for the Phoenix payload against the mapping, axe on every `?view=settings&state=` and the unibox handoff states (the existing leads a11y spec already spreads `LEADS_REVIEW_STATES`, so it now covers the 7 handoff states too; a settings spec and the unibox spec are new), visual baselines at 1440 and 390 (CI-only). **Existing baselines that change:** `/app?view=unibox` Meetings/Grace (the meeting card and rail Handoffs), Nyota's lead detail, `/app?view=settings` (was the pending view), `/styleguide` (§42–44), the sequences condition menu (the Not opened hint) and the `conflict` state (Amara Njoroge's photo).

### Decisions recorded in M9 (answers to the §16 open questions)
16. **OOO with no return date Corral can read:** the thread stays in All, the sequence **pauses 14 days, then resumes**. (`lib/unibox/ooo.ts` already says so on the thread: "No return date Corral could read. It stays in All; the sequence waits 14 days, then carries on." The server schedules the resume.)
17. **No-show: both sources, treated the same.** The host-marked `BOOKING_NO_SHOW_UPDATED` and Cal Video's automatic `AFTER_HOSTS_CAL_VIDEO_NO_SHOW` / `AFTER_GUESTS_CAL_VIDEO_NO_SHOW` all mean `no-show` (`CAL_TRIGGERS`, `statusForTrigger`; anything else is ignored). The Cal.com page's **Listens for** names all six. Dedupe stays on booking uid + trigger, and a second no-show for the same booking (the host marks it after Cal Video already said so) is a no-op: the thread is already back in Needs you and the deal already notes it.
18. **AutoSend: sign-in first, an API key as the fallback.** As designed: `connect-autosend` is the page you land on after AutoSend's sign-in, with **Use an API key instead** under it.
19. **The lead-side conflict gets its own review state**, `conflict-lead` (§15 table; decision 14).

### Open questions
1. ~~OOO with no readable return date~~: stays in All, pauses 14 days, resumes (decision 16).
2. ~~No-show trigger~~: host-marked and Cal Video's automatic ones, the same (decision 17).
3. **Still open, for Krak:** Phoenix ERP's real stage names, required fields and duplicate response. The design assumes Lead / Discovery / Proposal / Won / Lost, the twelve fields in the mapping and a 409 with the account and open deal. What does Phoenix actually expose?
4. ~~AutoSend: OAuth or an API key?~~ Sign-in first, API key as the fallback (decision 18).
5. ~~A review state for the lead-side conflict?~~ Yes, `conflict-lead` (decision 19).
6. ENG-58's GitHub link is `Uzski-Corp/camposocial-client` #167, like ENG-53–57. Right repo, or stale?

## 17. Developers: MCP connections, API keys and the docs (M9, ENG-59 → build ENG-88)

Corral as a developer surface, in Corral's own voice rather than a docs template. **Settings → Developers** gets three pages under their own heading in the settings nav: **MCP** (an AI client works in Corral as a person), **API keys** (a job works in Corral without one) and **Docs** (the MCP server and the API, inside the app). MCP comes first on purpose: a person's AI client should sign in, not carry a key. Styleguide §44 Developers ("Things that float" moves to §45). Logic is pure and tested in `lib/mcp/keys.ts` (areas, scopes, presets, the key's shape, expiry and status, last-used words, validation, rotate) and `lib/mcp/tools.ts` (the 15 tools for ENG-75, errors, limits, each client's config); review states in `lib/mcp/state.ts`. Components are in `components/app/mcp/` (`Connections.tsx`, `Keys.tsx`, `Docs.tsx`, `Shared.tsx`, `Developer.tsx`, demo data `data.ts`, CSS `mcp.css` with `m-*` classes, imported in `app/globals.css`).

**Baseline: this batch assumes M4, M5, M6 (PR #14), M7 (PR #15) and M8 are applied.** Built on worktree HEAD 67c3f50 (`eng-58-handoffs`, which holds M4–M8: M8 as dbe8bae plus Krak's axe commit 67c3f50), with the tree identical to the staged M8 batch. M9 edits M8 files (`handoff/Integrations.tsx`: the settings nav; `handoff/data.ts` and `lib/handoff/handoff.ts`: the no-show triggers), M7 files (the `conflict-lead` state in `unibox/`), `AppDemo`, `app/app/page.tsx`, `app/globals.css`, `icons.tsx`, the styleguide and this document.

### Routes and states (`/app?view=settings&state=…` outside production)
Everything is Tomás Ibarra in ColdTrace, **Wed 30 Sep, 09:45 EAT**. The server is `https://mcp.corral.app/mcp` (Streamable HTTP; OAuth 2.1 or an API key; 60 calls a minute per connection).

**MCP**

| `?state=` | What shows |
|---|---|
| `mcp` (and **MCP** in the nav) | The server URL with **Copy**. Connected clients, each: mark, client, device, who, how it signed in (signed in / API key `n8n lead sync`), the preset (Read only · Read and draft · Custom), its scopes as mono tags, its last tool and time, calls this week, **Activity**. Cursor (Tomás's MacBook Pro), Claude (claude.ai, Amara Njoroge), Claude Code (tomas@coldtrace-dev), n8n (on a key). Footer: a signed-in connection lasts until you disconnect it or 90 days without a call, and acts as its person. |
| `mcp-empty` | **Nothing connected yet**: "Most sign in with your Corral account, so there's no key to paste or leak"; a picker of the five clients (each with where its config goes); a link to the docs. |
| `mcp-connect` | **Connect a client**, Cursor picked: client tiles (radios), **Sign in with** Corral account / API key, **Add to Cursor** (the `cursor://…/mcp/install` link), three steps, the `~/.cursor/mcp.json` block with **Copy**; **I've added it**. |
| `mcp-connect-claude` · `mcp-connect-key` | Claude: Settings → Connectors → Add custom connector, the name and URL. VS Code with a key: `.vscode/mcp.json` with a `promptString` input, so the key is asked for once and kept in VS Code's secret storage, not the file; **Create a key** link. |
| `mcp-consent` | The page a client opens in your browser (`/oauth/authorize`), shown in place of Settings: **Claude Code wants to use Corral**, as whom, in which workspace, where it sends you back; the presets as cards (Read and draft picked), then per area None / Read / Write (/ Send on the Unibox) with what each level lets it do; a caution when Send is on; **Never, whatever you pick** (passwords, keys, billing; teammates; a sequence past its launch checks); *N tools · until you disconnect it*; **Deny** / **Allow**, then a done card. |
| `mcp-waiting` · `mcp-connected` | **Waiting for Cursor** (config copied ✓ · Cursor opens Corral to sign in ⟳ · first call, usually `tools/list`; restart hint), **Back to the config** / **Check again** · **Cursor is connected**: read only, first call at 09:45, **sees 7 tools** (listed), a first thing to ask. Done adds it to the top of the list, highlighted. |
| `mcp-activity` | Cursor's page: who, status, **Disconnect**; tabs **Activity** (every call in 7 days: time, tool, arguments, result, ms; one `429 rate_limited`) and **What it may do** (signed in, preset and scopes, the tools it sees, the access read-only: to widen it you reconnect, so a client can never widen its own access). |
| `mcp-error` | "2 connections are failing. Nothing they asked for happened, and nothing was sent." Failing rows first: Claude Code **Missing a scope** (asked for `send_reply` three times; 403 each; **See the calls** → its page with the three 403s and **Allow sending** → the consent page) and Zapier **Key expired** (its key expired Sep 21; 12 calls refused; **Replace the key** → `key-expired`). |
| `mcp-revoke` | **Disconnect Cursor on Tomás's MacBook Pro?** (danger): its next call gets 401; last call and count; drafts it saved and its log stay; other connections and keys aren't touched. |
| `mcp-loading` | Skeleton URL bar and rows, "Loading connections" for screen readers. |

**API keys**

| `?state=` | What shows |
|---|---|
| `keys` (and **API keys** in the nav) | "For scripts and tools that can't sign in… AI clients like Cursor or Claude should connect through MCP instead." Banners: **Zapier (old) expired Sep 21 and is still being called** (12 refused, last 08:02, **See the calls**) and **Metabase reporting expires in 4 days** (**Rotate now**, the old secret keeps working 24 h). Table: name (test tag, made by, when), key `crl_live_…7Qa2`, **Can reach** (top scope per area), **Last used** (12 min ago · n8n Cloud; Never used; *12 refused since*), **Expires** (Nov 10 · ● in 4 days · ● Expired · Never expires · ● Old secret until 09:45 tomorrow), a row menu (Details and last calls · Rotate · Revoke; an expired key: See the refused calls · Delete). Footer: only a hash and the last four are kept; one revoked in 30 days. |
| `keys-empty` | **No API keys yet**: make one for something that runs without you; use MCP sign-in for a person's AI client; keys expire in 90 days unless you choose. **Create key** · Read the docs. |
| `key-create` · `key-create-errors` | **Create API key**: Name ("name it after what uses it"), Environment Live / Test, Expires (30 days · **90 days** · 1 year · Never, "allowed, not advised"; the date and a week's warning), **What it may do**: presets as cards, then the per-area picker, where the Unibox offers None / Read / Write only, with a lock line: "Keys can draft but can't send. Sending needs a signed-in MCP connection." The count reads "N scopes. Keys can draft but can't send: the Unibox stops at Write. Sending needs a signed-in MCP connection." (M10: Send is gone from keys entirely, decision 15.) Errors: "Two things before this key can exist: a name and at least one area.", the name field's message, the picker outlined red. A taken name: "A key called … already exists. Rotate that one, or pick another name." |
| `key-reveal` | **HubSpot sync is ready** · "Copy it now. This is the only time Corral shows it." The secret large, **Copy** primary; "Corral keeps a hash and the last four (…6uGa)… Lose it and you rotate."; the same as a `CORRAL_API_KEY=` line; what it can reach and when it expires; **Done, I've stored it**. The new row is highlighted behind. |
| `key-rotate` · `key-rotated` | **Rotate n8n lead sync?** The old secret **Keeps working for 24 hours** (until 09:45 tomorrow, to swap it in n8n Cloud without a gap) or **Stops now** (if it leaked); last used and calls this week. Then **New secret for n8n lead sync**, once, with "The old secret (…7Qa2) works until 09:45 tomorrow"; the row reads ● Old secret until 09:45 tomorrow. |
| `key-revoke` | **Revoke n8n lead sync?** (danger, no undo): **In use: last call 12 min ago from n8n Cloud** (1,204 this week; "if you're replacing it, rotate instead"); calls get `401 invalid_token`; what it already did stays. |
| `key-expired` | Zapier (old)'s page: ● Expired Sep 21; "Something still calls with this key: 12 calls refused since it expired", from where; facts (can reach, made, expires, last good call, limits); **Refused calls** (three `401 invalid_token`); **Make a replacement** (same name and scopes, new secret, 90 days → the reveal). |
| `keys-error` | "Couldn’t load your API keys" `GET /api/v1/keys · 503`: "No key was changed or revoked, and calls with them still work." **Try again**. |
| `keys-loading` (M10) | Skeleton banner and rows, "Loading API keys" for screen readers. |
| `keys-owner` (M10) | Tomás as a workspace **owner**: a line under the header, "You're an owner: you manage every key, whoever made it. Members manage only their own." A new **Owner** column (between Key and Can reach): *You* + the name, or the person's name. Every row menu has Rotate and Revoke. |
| `keys-member` (M10) | Amara Njoroge as a **member**: "You're a member: you manage the keys you made. The others are read-only; their owner or a workspace owner manages them." Her own key (Metabase reporting) has the full menu. Everyone else's rows are dimmed with a **Read-only** lock tag; their menu keeps **Details and last calls**, then a heading "Only Tomás or an owner" over **Rotate** and **Revoke**, both disabled. A banner about someone else's key (Rotate now) says who can act instead of offering the button. |
| `keys-member-key` (M10) | Amara opens n8n lead sync (Tomás's): the facts, scopes and last calls as usual; in place of Revoke / Replace, a note: "Made by Tomás. Only Tomás or an owner can rotate or revoke it." |

**Docs**

| `?state=` | What shows |
|---|---|
| `docs` (and **Docs** in the nav) | An editorial page: kicker, **Corral, from the tools you already work in**, a lead paragraph, the facts (server, transport, sign-in, version 2026-09). Numbered sections **01 Connect** (client tabs: steps and the config per client; or connect from Settings → MCP), **02 Sign-in and keys** (two cards: for a person's AI client / for a job that runs without you; scopes explained), **03 Tools** (search; grouped by area; each row: name, Read / Write / Sends email, what it does, its scope; open: arguments, its guardrail, "Ask your client", the call as MCP `tools/call` or `curl`, the result, credits), **04 Guardrails**, **05 Errors** (401 invalid_token · 403 insufficient_scope · 409 thread_changed · 422 never_say · 429 rate_limited, with what to do), **06 Limits**, **07 Changes**. A sticky **On this page** with **Connect a client** at 1440. |
| `docs-tool` | Lands on `send_reply` open: the guardrail (same 10 s undo and Never say; 409 if anyone wrote since the draft; **signed-in connections only, a key gets `403 key_cannot_send`**), its argument, the call as MCP `tools/call` and the result (`status: "undo"`, `sent: false`). Its curl tab says there's no curl for this one: API keys can't send. |
| `docs-search-empty` | Search "invoice": **No tool for "invoice"**: "Billing, team and mailbox settings stay in the app, on purpose." **Show all 15**. |

No state is live-only: create, reveal, copy, rotate (either way), revoke, delete, replace, the row menu, connect → waiting → connected, client and sign-in switching, disconnect, the consent's presets, per-area levels and Allow / Deny, and the docs' tabs, search and tools all work.

### Decisions
1. **One scope model for keys and MCP.** Six areas (companies and contacts, segments, sequences, Unibox, knowledge base, scoring), each None / Read / Write; the Unibox alone has **Send**, and only for a signed-in connection (decision 15). Write implies read, send implies write (`scopesOf`, `accessOf`, `hasScope`). Scopes are `area:read`, `area:write`, `unibox:send`. Three starting points: **Read only** (default), **Read and draft** (triage, drafts, segments; sends nothing), **Choose per area**. Send is never preset.
2. **A client only sees the tools its scopes allow** (`toolsFor`): MCP's `tools/list` leaves the rest out, so a client never learns about a tool it can't call. If it calls one anyway, `403 insufficient_scope`, logged, and the connection shows **Missing a scope**.
3. **MCP is sign-in first.** OAuth 2.1 with PKCE via the consent page; the client acts as that person (their Unibox, mailboxes and Never say). Changing access means reconnecting through consent; a client can't widen its own access. API keys are for jobs without a person, and for clients without OAuth, as a Bearer header.
4. **The 15 tools** (ENG-75), by area: `search_companies`, `get_company`, `update_lead_status`; `list_segments`, `create_segment`; `list_sequences`, `enroll_in_sequence`; `list_threads`, `get_thread`, `draft_reply`, `send_reply`; `search_knowledge`, `add_knowledge_source`; `explain_fit`, `score_company` (1 credit). Examples use this workspace's data.
5. **Guardrails hold whoever calls.** A send waits out the same 10 s undo and Never-say check as the button; `draft_reply` cites the knowledge base and lists what it left out; `enroll_in_sequence` doesn't launch (step 1 waits for launch checks); new knowledge sources wait in Review; `send_reply` answers **409 thread_changed** if the lead or a teammate wrote since the draft (the MCP side of §15 decision 14); every call is logged 90 days.
6. **Keys.** `crl_live_` / `crl_test_` + 32 characters; shown **once**; Corral keeps a hash and the last four and shows `crl_live_…7Qa2` after (`redact`, `isKeyShaped`). Expiry 30 / **90** / 365 days / never (allowed, not advised), a warning a week before (`EXPIRING_DAYS`). Status: Active, Expires soon, Rotating, Expired, Revoked (`statusOf`; `works`). A name is required, unique (case-insensitive), under 48 characters; a key needs at least one scope (`validateKey`).
7. **Rotating keeps the old secret 24 hours** by default (`ROTATE_OVERLAP_HOURS`, `rotate`), or stops it now if it leaked. Same name, scopes and expiry.
8. **Revoking is immediate and says what's using it** (last call, where from, calls this week) and points to rotating when you mean to replace. An expired key is deleted, not revoked. An expired key that's still being called is a problem on both pages, with the refused calls and **Make a replacement**.
9. **Last used is always shown**, with where from (the client or IP), and "Never used" for a key nobody has called.
10. **Limits:** 60 calls a minute per key or connection, 20 of them writes, 30 sends an hour and never past a mailbox's daily cap; `429 rate_limited` with `Retry-After` (`RATE`).
11. **Each client's config is written by Corral** (`configFor`, `stepsFor`), checked against the clients' current docs (Sep 2026): Cursor `~/.cursor/mcp.json` `mcpServers.corral.url` (+ the `cursor://anysphere.cursor-deeplink/mcp/install` link, `cursorDeeplink`); Claude Code `claude mcp add --transport http corral <url>` (a key with `--header "Authorization: Bearer …"`; OAuth via `/mcp`); Claude: Settings → Connectors → Add custom connector; VS Code `.vscode/mcp.json` `servers.corral` with `type: "http"` (a key through an `inputs` `promptString`, never in the file); any other client: `mcpServers` with a Bearer header. Client marks are two letters on a tile, no third-party logos.
12. **The docs are a page, in the app.** Numbered sections, one lead paragraph, real calls; the tools table is the same list the server serves. Deep links land on a tool (`docs-tool`).
13. **Mobile (390):** the settings nav keeps the page you're on in view (Developers sits past Billing); tables become stacked rows with the row menu top right; connection rows put scopes and the action under the text; the connect dialog's clients wrap to three; the access picker stacks the level under the area; the docs lose the side contents, and the facts become a list.
14. **Also in this batch:** the Unibox **`conflict-lead`** state (§15), the no-show triggers (§16 decision 17), and §16's open questions answered (decisions 16–19).

### Decisions recorded in M10 (answers to the §17 open questions; Krak's PR #22 review)
15. **Sending only on a signed-in MCP connection, never on an API key.** Keys can draft but can't send; sending needs a signed-in MCP connection (a person behind it, their 10 s undo). The picker enforces it: `AccessPicker holder="key"` offers None / Read / Write on the Unibox with the lock line, `levelsFor(area, holder)`, `clampFor(access, holder)` turns a pasted `send` into `write`, `validateKey` refuses `unibox: "send"` with `KEY_SEND_REFUSED`, and `keyScopesOf` never yields `unibox:send`. The server does the same: `send_reply` with a key → **403 `key_cannot_send`** (`ERRORS`, `keyMayCall`), and a key's `tools/list` leaves `send_reply` out. Copy everywhere (key-create, key-create-errors, rotate, the docs, `/mcp`, the changelog): "Keys can draft but can't send. Sending needs a signed-in MCP connection." The consent page is unchanged: a signed-in client can still be given Send, never preset, with its caution.
16. **Owners manage every key; members manage their own.** `Role` (`owner` | `member`), `Viewer`, `canManageKey(viewer, key)`, `manageNote(key)`. Both see the whole workspace's keys (so nobody makes a duplicate or wonders what's calling); a member sees other people's keys read-only, actions disabled with who can act, never hidden. Owners get the **Owner** column and every action. Connections follow the same rule when ENG-77 adds disconnect-by-others. The real role comes from `/me` (§ M1 `account.role`); review states pick it with `devSeed(state).viewer`.
17. **`score_company` costs 1 credit over MCP, the same as in the app.** Already in `TOOLS`; `/pricing` and the plans' compare table say so ("Scoring over MCP · 1 credit").

For **Krak's settings.a11y spec**: `MCP_REVIEW_STATES` is now **29**; spread it as before and the four new states come with it: `keys-loading`, `keys-owner`, `keys-member`, `keys-member-key`. Things to assert beyond axe: in `keys-member` the other people's row menus hold **Rotate** / **Revoke** as disabled `menuitem`s (the shared `DropdownMenu` uses native `disabled`, so arrow keys skip them) after a heading line that names who can act, "Only Tomás or an owner"; the **Read-only** tag is text, not colour; the key page says who can act in words (`manageNote`); `keys-owner` has a real `columnheader` "Owner". (If you'd rather screen readers land on the disabled items, switch `DropdownMenu` to `aria-disabled` and keep them focusable; that's a shared M1 change, so I left it.)

### Component APIs (`import { … } from "@/components/app"`)
```tsx
<SettingsView state? developer? onSection? />  // developer: McpReviewState; onSection(label) keeps the crumb in step
<Developer section="mcp" | "keys" | "docs" state? />   <McpConsent onDone?(ok) />
<AccessPicker value onChange? invalid? holder?: "oauth" | "key" />   // M10: holder "key" stops the Unibox at Write   <CopyBlock label text what where? secret? tall? />   <ScopeTags scopes max? />
<AppDemo … developer?: McpReviewState />      // /app?view=settings&state=mcp…|key…|docs…
```
Logic: `lib/mcp/keys.ts` (`Area`, `Access`, `AREAS`, `Scope`, `scopesOf`, `accessOf`, `hasScope`, `PRESETS`, `KEY_PREFIX`, `isKeyShaped`, `redact`, `EXPIRY`, `DEFAULT_EXPIRY`, `ROTATE_OVERLAP_HOURS`, `EXPIRING_DAYS`, `expiresOn`, `statusOf`, `works`, `STATUS_WORD`, `lastUsedWords`, `expiryWords`, `validateKey`, `isValid`, `rotate`, `RATE`; M10: `Holder`, `maySend`, `levelsFor`, `clampFor`, `KEY_SEND_REFUSED`, `KeyScope`, `keyScopesOf`, `Role`, `Viewer`, `canManageKey`, `manageNote`), `lib/mcp/tools.ts` (`MCP_URL`, `API_URL`, `TOOLS`, `tool`, `byArea`, `searchTools`, `toolsFor`, `callBody`, `curlFor`, `ERRORS` (M10: + `403 key_cannot_send`), `errorFor`, `keyMayCall` (M10), `CLIENTS`, `client`, `configFor`, `stepsFor`, `cursorDeeplink`), `MCP_REVIEW_STATES` (29 since M10), `mcpReviewState(view, state, reviewStates)`, `sectionOf`, `SECTION_TITLE`. Demo data: `API_KEYS`, `MCP_CONNECTIONS`, `devSeed`, `DEV_NOW`. Unibox: `SendKind` gains `"conflict-lead"`; `DraftActions` gains `onRedraftBoth`; `UniboxSeed` gains `followUp?`; `FollowUpMessage`, `LEAD_FOLLOWUP`, `BRIAN_REDRAFT`. Handoffs: `CAL_TRIGGERS`, `statusForTrigger`. Icons: `copy`, `key`, `plug`, `code`, `eye`, `lock`.

### What Krak wires (ENG-88, backend ENG-75 / ENG-77)
- **MCP server (ENG-75):** Streamable HTTP at `/mcp`; `tools/list` filtered by the caller's scopes (`toolsFor`); each tool from `TOOLS` (name, arguments, what it returns); errors as MCP results with `isError` and the codes in `ERRORS`; the guardrails in decision 5 enforced server-side, not in the client.
- **OAuth and keys (ENG-77):** OAuth 2.1 + PKCE with dynamic client registration and the consent page (`McpConsent`); scoped tokens; API keys hashed with the last four kept; expiry, the week-before email, rotation with a 24 h overlap, revoke; per-key and per-connection limits (`RATE`); the audit log (every call, 90 days) behind **Activity** and a key's calls, including refused ones.
- **Settings API:** `GET /api/v1/keys` (status, last used + where from, calls 7 d, refused since expiry), create (returns the secret once), rotate, revoke/delete; `GET /api/v1/mcp/connections` (client, device, who, auth, scopes, last call, health + problem), disconnect; calls per connection or key.
- **Unibox (ENG-85):** the held send for a newer lead message (§15 decision 14, `conflict-lead`), Redraft against both messages.
- Review mode: `?state=` seeds each state.

### Tests
- Added: `components/app/mcp/mcp.test.tsx` (25: a seed and page for every state; the settings nav; keys listed masked with last used, expiry and banners; **create → errors → reveal once → copy → listed**; taken name, per-area Send, Test env, cancel; **rotate** with and without the overlap; **revoke** in use; the row menu (rotate, delete an expired key, details → revoke); expired → **replace**; banners; empty and error → retry; connections listed; **connect Cursor → waiting → back → connected → listed**; per-client configs incl. the key header and VS Code's prompt; empty picker; errors (missing scope → the calls → Allow sending; expired key → replace); activity, access and **disconnect**; revoke cancel; loading; the consent's presets, Send caution, Allow / Deny, and in place of Settings; the docs' client tabs, tool open / close, curl, credits, no arguments; `docs-tool`; search empty → all → narrowed), `lib/mcp/keys.test.ts` (9), `lib/mcp/tools.test.ts` (10), `lib/mcp/state.test.ts` (3); the Unibox `conflict-lead` flow in `unibox.test.tsx` (redraft, edit mine, send mine anyway; the unibox state count is **31**); `lib/handoff/handoff.test.ts` (the no-show triggers).
- For ENG-88 / ENG-98: the e2e **key flow** (create with scopes → copy the secret → call the server with it → rotate → the old one works inside the overlap → revoke → 401) and **connect flow** (connect a client → consent → first call lands in Activity → disconnect → 401); security tests (the secret never in a response after create, logs or the DOM after Done; a hashed lookup; a client asking for a tool outside its scopes gets 403 and isn't listed; send_reply → 409 after a newer message; rate limits); axe on every `?view=settings&state=` M9 state (Krak's unibox axe spec picks up `conflict-lead` from `UNIBOX_REVIEW_STATES`); visual baselines at 1440 and 390 (CI-only). **Existing baselines that change:** `/app?view=settings` (the nav gains Developers; the old API keys placeholder is gone), `/styleguide` (§44 Developers, §45 Things that float), the Cal.com page's Listens for.

### Open questions
1. **Still open, for Aegon:** the server URL `https://mcp.corral.app/mcp` and key prefix `crl_live_` / `crl_test_` are my placeholders. Real host and prefix? (`/mcp` shows *To confirm · Aegon* next to the host.)
2. **Still open, for Aegon:** is there a Test environment (sample data, sends nothing) in ENG-77, or should keys be Live only? The design keeps Live / Test.
3. ~~Should `unibox:send` be allowed on API keys?~~ No: sending only on a signed-in MCP connection (decision 15).
4. ~~Credits for `score_company` over MCP?~~ 1 credit, the same as the app (decision 17).
5. ~~Who can manage keys and connections?~~ Owners all, members their own; others' read-only with the reason (decision 16).
6. ENG-59's GitHub link is `Uzski-Corp/camposocial-client` #168 (ENG-88: #197), like ENG-53–58. Right repo, or stale?

## 18. Marketing site, share images, and every empty / error / loading state (M10, ENG-60 → build ENG-87, gate ENG-97)

The public site at launch quality, built from the product rather than pictures of it, and one pass over every state in the app so nothing ships blank. Both landings now embed **real app screens and components** (`ProductFrame` + `Screen`, and single pieces like `FitPiece`), so a landing can't drift from the product. New pages: **/pricing**, **/security**, **/mcp**, **/changelog**, **/legal/terms · privacy · dpa** (outlines), a **404**, route-level **loading / error** files, and **share images** for every public route. Styleguide **§46 Every state** indexes every review state from one list (`lib/states`). Logic and data are plain modules with tests: `lib/marketing/site.ts` (routes, nav, footer, CTAs, changelog, the claims still to confirm), `lib/marketing/plans.ts` (plans, compare table, FAQ), `lib/marketing/share.ts` (the share cards and their alt text), `lib/states/index.ts` (the state index), `lib/contacts/state.ts`.

**Baseline: built on worktree HEAD 6424e57** (`eng-59-mcp`: M4–M8 as before, M9 as 17a12cd, and Krak's M9 axe commit 6424e57; PR #22 stacked on #16), with the tree identical to it. It also carries Krak's PR #22 review notes (§17 decisions 15–17, the owner/member key states) and the five M3 target-size fixes.

### Routes and states
| Route | What it is |
|---|---|
| `/open-range` | The landing, rewritten on real components: hero with the Companies screen (Fit 80+ with Kilima's reasons open), the tally, **Every row is a person who decides** (`ProvenancePiece`: where Wanjiru's email came from), the fit bar signature with `FitPiece`, **Replies arrive sorted** (the Unibox on Brian's draft), **It writes at a human pace** (a sequence's Launch dialog), **When they say yes** (`HandoffPiece`: Grace booked, the deal, AutoSend), People, **Ask Cursor who replied** (the real Cursor config), pricing from `PLANS`, the footer from `FOOTER`. Anchors `#product #unibox #sequences #handoffs #pricing`. `HowItWorks.tsx` is gone (the flow sections replace it). |
| `/fenceline` | The same product in the engraved theme: hero and Pl. II are the Companies and the F&B · East Africa segment screens, Pl. III is `FitPiece`, Pl. IV the Unibox on Brian's draft; the plans read the same `COMPARE` rows as /pricing; real links and the shared footer. |
| `/pricing` | Plans ledger (Field $49 · **Range $149** · Territory, let's talk) with a reads meter, what a read is (receipts), the compare table (grouped like the product; at 390 each cell carries its plan name), and the FAQ as `details`. *To confirm · Aegon* on prices. |
| `/security` | **What Corral can touch, and what it can't**, in five numbered sections: **Nothing replies without you** (drafts, the 10 s undo, Never say, API keys can't send), **Your mailboxes stay yours** (caps, warm-up, unsubscribes), **Who and what is signed in** (sign-in, roles, MCP clients and keys; a live frame of Settings → MCP Activity), **Your data** (a ledger where every unconfirmed fact is marked *Pending* / *To confirm · Krak or Counsel*), **Tell us** (security@corral.app). |
| `/mcp` | The public face of §17: facts (server, transport, sign-in, tools, host *To confirm*), connect a client (the same steps and configs as Settings), sign-in vs keys side by side with the key's picker stopping at Write, the 15 tools by area (`send_reply`: *Signed-in clients only*; `score_company`: 1 credit), guardrails, errors (incl. `403 key_cannot_send`), limits. |
| `/changelog` | Entries from `CHANGELOG`, newest first: 1.0 on Oct 7 with a live frame and what shipped per area. |
| `/legal/[doc]` | `terms`, `privacy`, `dpa`: the section outline and a draft note, `noindex` and out of the sitemap until `claim("legal")` is confirmed; `dynamicParams = false`. |
| unknown URL | `app/not-found.tsx`: **Nothing here fits.** "Corral read this address and found no page", the address as a receipt with a zero fit bar, then home and the nav. `noindex`. |
| `/styleguide/share` | The seven 1200×630 cards (`SHARE_CARDS`), screenshotted into `opengraph-image.jpg` + `.alt.txt` in `app/`, `open-range`, `fenceline`, `pricing`, `security`, `mcp`, `changelog` (static files, Next's file convention). Re-shoot with `m10-wip/og.mjs` whenever a card or photo changes. |
| `/app?view=contacts&state=` | `loading` (the table skeleton) · `empty` (**No contacts yet**: people arrive as Corral reads companies; **Find companies** → Discovery) · `error` (**Couldn't load contacts**, `GET /api/v1/contacts · 503`, nothing lost, **Try again**). |
| `/app?view=settings&state=` | `keys-loading` · `keys-owner` · `keys-member` · `keys-member-key` (§17). |
| route files | `app/app/loading.tsx` (`AppSkeleton`: the shell outline, sidebar, top bar and thread rows), `app/app/error.tsx` (a view threw: **Couldn't open this part of Corral**, Try again, Go to the Unibox, the digest in mono), `app/error.tsx` (a marketing page threw: nav and footer stay), `app/global-error.tsx` (the root layout threw: plain HTML, one button). |

`robots.ts` disallows `/app`, `/onboarding`, `/styleguide`; `sitemap.ts` lists the public routes minus sign-in and the unconfirmed legal pages. The root layout sets `metadataBase` (`SITE_URL`), the title template `%s · Corral`, Open Graph and `summary_large_image`.

### Decisions
1. **The site shows the product, not a drawing of it.** `ProductFrame` holds a real `AppDemo` (contained, hotkeys off, a review state picked): it mounts when it scrolls within 900 px (or `eager` in a hero), shows `AppSkeleton` until then, and is **`inert` with `role="img"` and a label** until the visitor presses **Try it**; then it's a live region with a ring. `contain: layout paint` keeps a dialog inside the frame. Single pieces (`FitPiece`, `ProvenancePiece`, `HandoffPiece`, `KeyAccessPiece`, `McpConfigPiece`, `McpClientsPiece`) are the app components at their own size.
2. **One source for what the site says.** Routes, nav, footer, CTAs, changelog, plans and the compare table live in `lib/marketing`; the landings, /pricing, the sitemap and the tests read them, so a price or a link changes in one place. No `href="#"` anywhere (tested).
3. **Unconfirmed claims are visible, on purpose.** `CLAIMS` lists what someone must confirm before Oct 7 (prices → Aegon; data region, encryption, retention → Krak; subprocessors, legal text → Counsel; the MCP host, key prefix and Test keys → Aegon). Each shows a *To confirm · who* pill where it's used. Launch = every claim `confirmed: true` and the pills gone.
4. **Keys draft, people send, on the public pages too** (§17 decision 15): /mcp, /security, the changelog and the MCP share card say it in the same words.
5. **One state system, one voice** (the audit). Every view already used the shared `Skeleton` / `SkeletonTable` / `SkeletonThreads` / `EmptyState` / `ErrorState`; M10 adds `AppSkeleton` and fills the gaps (Contacts; keys loading; the route files). Rules, now true everywhere: an empty state says what goes here and the one thing to do; an error says what failed, that nothing was lost, **Try again** as the primary button, and the request last in mono as `GET /api/v1/<path> · <status>` (Discovery, Sequences and the Unibox now use the full path; Leads and the knowledge base drop "Service Unavailable" / "Bad Gateway" and make Try again primary); titles use ’ (Couldn't → Couldn’t across components, lib and the styleguide).
6. **Every state is indexed** (`lib/states`): `SURFACES` (shell, knowledge, companies, segments, discovery, contacts, sequences, unibox, handoffs, integrations, developers, products) with their review-state lists, `kindOf` (empty / loading / error / partial / progress / view, by name with per-surface overrides), `gaps` (a surface missing empty, loading or error with no reason fails the test), `allStates()` with each state's URL, and `ROUTE_STATES`. Products has no states on purpose: it is still the M1 placeholder (launch blocker below).
7. **Share images are composed, not drawn**: real pieces on the Open Range paper, the headline, a fit bar and the host. The alt text sits next to the card in `SHARE_CARDS` and is written into `.alt.txt` by the script.
8. **Performance (lab, cheap):** marketing pages load no app code they don't show. The root `error.tsx` / `not-found.tsx` (which ship with every route) and all marketing modules import from deep paths, never the `@/components/app` barrel; `Screen` loads `AppDemo` with `next/dynamic` (`ssr: false`) only when a frame comes near. Measured below.
9. **Target size (M3 findings, WCAG 2.2 AA 2.5.8, non-blocking per Krak but cheap):** the rule-chip remove button is 24×24 (`.l-chip__x`), and the styleguide's §27 builder stacks at 390 so no control is squeezed under 24 px.
10. **Contrast (found by the new sweep):** Fenceline's `--mk-copy-muted` darkens to #6B645A (5.2:1 on paper) and `--mk-copy-faint` to #857E73 (large text only, 3.5:1); Open Range's tally grey to #8F8F8B (3.3:1 at 40 px).

### Performance (Playwright + CDP, 4× CPU, Slow 4G 150 ms / 1.6 Mbps, cold cache, review build)
| Width | Route | FCP | LCP | CLS | TBT | JS transferred* | Images |
|---|---|---|---|---|---|---|---|
| 390 | `/open-range` | 2.1 s | 2.1 s | 0 | 535 ms | 315 KB | 220 KB |
| 390 | `/fenceline` | 2.3 s | 4.2 s | 0.016 | 108 ms | 315 KB | 137 KB |
| 390 | `/pricing` | 1.8 s | 1.8 s | 0 | 107 ms | 206 KB | 0 KB |
| 390 | `/security` | 1.7 s | 1.7 s | 0 | 316 ms | 221 KB | 0 KB |
| 390 | `/mcp` | 1.9 s | 1.9 s | 0 | 127 ms | 221 KB | 0 KB |
| 390 | `/changelog` | 1.9 s | 1.9 s | 0 | 223 ms | 337 KB | 0 KB |
| 390 | `/legal/terms` | 1.9 s | 1.9 s | 0 | 106 ms | 206 KB | 0 KB |
| 390 | `/no-such-page` | 1.4 s | 1.4 s | 0 | 116 ms | 243 KB | 0 KB |
| 1440 | `/open-range` | 2.1 s | 2.1 s | 0 | 595 ms | 341 KB | 700 KB |
| 1440 | `/fenceline` | 2.4 s | 3.7 s | 0.002 | 116 ms | 341 KB | 404 KB |
| 1440 | `/pricing` | 1.9 s | 1.9 s | 0.001 | 113 ms | 243 KB | 0 KB |
| 1440 | `/security` | 1.8 s | 1.8 s | 0 | 355 ms | 243 KB | 0 KB |
| 1440 | `/mcp` | 1.8 s | 1.8 s | 0 | 359 ms | 243 KB | 0 KB |
| 1440 | `/changelog` | 1.7 s | 1.7 s | 0.026 | 510 ms | 363 KB | 17 KB |
| 1440 | `/legal/terms` | 1.8 s | 1.8 s | 0 | 111 ms | 243 KB | 0 KB |
| 1440 | `/no-such-page` | 1.5 s | 1.5 s | 0 | 110 ms | 243 KB | 0 KB |

\* JS transferred in the first ~3 s, including Next's prefetch of linked routes. First-load JS gzip, measured from the HTML's own scripts: text pages (`/pricing`, `/legal/*`) **185 KB** (the framework floor; the 404 **182 KB**), `/changelog` 196 KB, `/mcp` and `/security` ~230 KB, the landings **232 KB**, `/app` 361 KB. Before the deep-import fix every route, `/sign-in` included, carried the whole app (**~345 KB gz**) because the root `error.tsx` / `not-found.tsx` imported the barrel.

Reading it: CLS is ~0 everywhere (frames reserve their height). Everything but Fenceline is under 2.5 s LCP on this profile. **Fenceline's LCP (3.7–4.2 s) is the engraved hero plate** (`land-plate.jpg`, 77 KB WebP at 750 w; hatching compresses badly), already `priority`; the licensed replacement (launch item 1) should be engraved coarser or served smaller. **Open Range's TBT (~540–600 ms) is the live hero screen** mounting straight after hydration; if ENG-87's budget is 300 ms, the cheap fix is to mount the hero `ProductFrame` on first interaction or idle and show its `AppSkeleton` (already the placeholder) until then. `/security`, `/mcp` and `/changelog` sit at 220–510 ms for the same reason, lower down the page.

### Component APIs
```tsx
// components/marketing/site (import the page's own module plus "@/components/marketing/site/styles" in route files)
<SitePage current? kicker title lede? aside? landing? theme? />   <Section n id? title wide? />   <ToConfirm who />
<SiteNav current? landing? />   <SiteFooter landing? />
<ProductFrame label caption? height? phone? tone?: "light" | "photo" eager? className?>{<Screen view unibox? leads? sequences? discovery? developer? />}</ProductFrame>
<FitPiece /> <ProvenancePiece /> <HandoffPiece /> <KeyAccessPiece /> <McpConfigPiece /> <McpClientsPiece />
<PricingPage /> <SecurityPage /> <McpPage /> <ChangelogPage /> <LegalPage doc /> <NotFoundBody />
// components/app
<AppSkeleton frame?: "viewport" | "contained" label? />   <SkeletonThreads rows? bare? />   <AppDemo … contacts?: ContactsReviewState />
```
Logic: `lib/marketing/site.ts` (`SITE_URL`, `LAUNCH`, `ROUTES`, `PUBLIC_ROUTES`, `HOME`, `homeOf`, `NAV`, `FOOTER`, `CTA`, `SAMPLE_NOTE`, `CHANGELOG`, `CLAIMS`, `claim`, `isConfirmed`), `lib/marketing/plans.ts` (`PLANS`, `priceWords`, `COMPARE`, `FAQ`), `lib/marketing/share.ts` (`SHARE_CARDS`), `lib/states/index.ts` (`SURFACES`, `KINDS`, `REQUIRED`, `kindOf`, `hrefOf`, `allStates`, `gaps`, `countsOf`, `ROUTE_STATES`), `lib/contacts/state.ts` (`CONTACTS_REVIEW_STATES`, `contactsReviewState`).

### What Krak wires (ENG-87; gate ENG-97)
- **CWV budgets** in CI on `/open-range`, `/fenceline`, `/pricing`, `/security`, `/mcp`, `/changelog` (and `/` once it's chosen): suggested LCP ≤ 2.5 s and CLS ≤ 0.1 at the Slow 4G / 4× profile above, TBT ≤ 300 ms, first-load JS ≤ 200 KB gz on the text pages and ≤ 250 KB on the landings. The table above is the starting point; Lighthouse CI will read a little differently.
- **Visual baselines** at 1440 and 390 for every route in the table, `/styleguide` (§44 gains the key picker and the member view; **§46 Every state** is new) and the new states. **Existing baselines that change:** both landings (rewritten), `/styleguide` §27 builder at 390 and the leads rule chips (target size), every view's error state (the detail line and ’), Settings → API keys (the Owner column and role line), the key-create dialog (no Send), `docs-tool` (curl note), Fenceline's muted greys.
- **axe**: add the marketing routes, the 404, `/app?view=contacts&state=…`, `/app?state=…` and the four key states. The simplest way is to walk `allStates()` from `lib/states` instead of each spec's own list. Scroll marketing pages to the end before scanning so every frame mounts.
- **Real endpoints behind the states:** `GET /api/v1/contacts`; the role on `/me` (owner / member) for the key views; `403 key_cannot_send` on the server.
- **Sign-up:** there is no self-serve sign-up route; every *Start* CTA goes to `/sign-in` (`CTA.start`). Change it in one place when there is one.
- **Pick `/`:** `app/page.tsx` is still the design index linking both landings. At launch it should be the chosen landing (`HOME`), with the other removed or `noindex`.

### Tests
- Totals: 55 files, 640 tests, coverage 99.1% statements / 98.0% branches. Added: `lib/marketing/site.test.ts` (9: every link is a real route, the footer anchors exist on the home landing and /mcp, CTAs, changelog order and links, keys can't send, the claims and owners, plans and the compare table incl. 1 credit; the share cards), `lib/states/index.test.ts` (8: no surface without empty, loading and error or a reason; overrides and reasons are honest; the M10 states are indexed; kinds; links; route files; counts), `components/app/Contacts.test.tsx` (4), the key tests in §17 (owner and member views, `keys-member-key`, no Send on key-create, the lock line, the curl note), updated `leads`, `kb`, `discovery`, `sequences`, `fit` tests for ’ and the detail lines.
- For ENG-87 / ENG-97: the budgets and baselines above; an e2e that every footer and nav link returns 200; `/robots.txt` and `/sitemap.xml` contents; each route's `og:image` resolves to a 1200×630 JPEG with its alt.

### Launch readiness (Oct 7), across M1–M10
| # | Item | Where | Owner | State |
|---|---|---|---|---|
| 1 | **Photographs**: every photo and app avatar is a reference stand-in, not model-released; replace or remove before any public page ships | `docs/design/IMAGE-SOURCES.md` (launch-blocker table) | Aegon → Bau | **Blocking** |
| 2 | **Claims** in `CLAIMS`: prices; data region, encryption, retention; subprocessors; legal text; MCP host, key prefix, Test keys | `lib/marketing/site.ts` (pills on the pages) | Aegon · Krak · Counsel | **Blocking** |
| 3 | **Legal pages**: real Terms, Privacy notice and DPA; then drop `noindex` and add them to the sitemap | `/legal/*` | Counsel | **Blocking** |
| 4 | **Which landing is `/`** (Open Range is `HOME` today) | `app/page.tsx`, `HOME` | Aegon | Open |
| 5 | **Sign-up route** (CTAs go to /sign-in) | `CTA.start` | Krak | Open |
| 6 | **Host** (`SITE_URL` https://corral.app, `MCP_URL`), **security contact** (security@corral.app), walkthrough address (hello@corral.app) are placeholders | `lib/marketing/site.ts`, `lib/mcp/tools.ts` | Aegon | Open |
| 7 | **Products view** is still the M1 placeholder ("designed in a later milestone"); it's in the nav | `AppDemo` `PendingView` | Aegon (scope) → Bau | **Decide**: design it or hide it for launch |
| 8 | **Settings → Workspace, Team, Billing** are placeholders; Team is where owner / member is set (§17 decision 16), Billing where credits are | Settings sub-nav | Aegon (scope) → Bau | **Decide** |
| 9 | **No offline state** (a dropped connection shows each view's error) | — | Bau, if wanted | Open |
| 10 | Phoenix ERP's real stages, required fields and duplicate response | §16 open question 3 | Krak | Open |
| 11 | Test environment for keys, and the real host and prefix | §17 open questions 1–2 | Aegon | Open |
| 12 | PR stack: #16 (M8) → #22 (M9, HEAD 6424e57) → M10 on top | `next/m10/` | Krak | In review |
| 13 | ENG-53–60 GitHub links point at `camposocial-client` (#167–169) | Linear | Krak | Check |
| 14 | Remove `SAMPLE_NOTE` from public pages once 1–2 are done; re-shoot the share images | `lib/marketing/site.ts`, `m10-wip/og.mjs` | Bau | After 1–2 |

### Open questions
1. **For Aegon:** which landing is `/` at launch, Open Range or Fenceline? (Both are launch quality; the pages link home to `HOME`.)
2. **For Aegon:** the real host and contact addresses (`corral.app`, security@, hello@) and the prices.
3. **For Aegon:** Products, Team and Billing: design them before Oct 7, or hide Products and ship Settings with those three as "coming soon"?
4. **For Krak:** is there a sign-up route coming, or does sign-in create the workspace (M1 onboarding)? The CTAs assume the latter.
