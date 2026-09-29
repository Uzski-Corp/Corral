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
| `/sign-in` | Email magic link + Google | `?state=sent` · `?state=error` (expired link) · `?state=invalid` |
| `/onboarding` | 5-step workspace setup with progress and skip | `?step=1…6` (6 = done) · `?skipped=3,4,5` · `?crawl=done` · `?mailbox=1` |
| `/styleguide` | Every component, live, where it is used (sections 01–15) | — |

Keyboard in `/app`: ⌘K / Ctrl+K palette · `[` collapse sidebar · `G` then `I C P S Q R K ,` to jump · `J`/`K` next/previous thread · `E` archive (with Undo toast) · Esc closes the top layer.

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
- `SessionUnavailable` (C): `{ onRetry?() => Promise<boolean> | boolean; detail? (mono, e.g. "GET /api/v1/auth/me · 503"); checkedAt?; autoRetrySeconds? [30, 0 = off]; statusHref? ["#status"] }`. The body of the full-shell fallback. `AppDemo` takes it as `sessionError`.
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
- `SignIn` (C, `components/app/screens/SignIn.tsx`): `{ initial? ["default" | "sent" | "error" | "invalid" | "cancelled" | "unavailable"]; actions? }`. `error` = expired link, `cancelled` = backed out at Google, `unavailable` = auth provider down.
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
- Search latency, OAuth, magic links, crawling and mailbox connection are simulated with timers.
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

**Onboarding help link and inline links (Q2).** Links inside running text are underlined (1px at 45% of their colour, full on hover). The rule sits in `system.css`, so "Book 15 minutes", Terms and Privacy, "send it again" and "open Corral" all get it with no per-link work.

**Sign-in failures (Q3).** Each case has its own screen, all reachable with `?state=` (outside production) and from the callback `?error=` (`lib/auth/signInState.ts#screenForError`):
- `provider_error` → `cancelled`: an info banner that says "You cancelled at Google. No problem, nothing was shared with Corral…". The Google button reads "Try Google again" and the email form stays.
- `auth_unavailable` → `unavailable`: a status screen. "Sign-in is down for a moment", a primary **Try again** (restarts the AuthKit hand-off), a **Status page** link, and "Already signed in on this browser? … open Corral" (→ `/app`) as the fallback. Email links go through the same provider, so they aren't offered as a fallback; the screen says so. When an in-app magic-link endpoint exists, add "Email me a link" here.
- `invalid_request`, `invalid_state`, `auth_failed`, unknown → `error` (the expired-link banner, unchanged).
- The status URL is `#status` for now. Point it at the real status page.

**Session check failing (Q7).** If `/me` fails with 502/503/504, a timeout or a network error before any session is confirmed, the shell stays up and its body becomes `<SessionUnavailable>`. It shows what failed, says nothing is lost and you're still signed in, and offers **Try again** (calls `session.refresh()`, which re-fetches `/me`), a Status page link, an automatic retry every 30s with a countdown, and the failing request in mono. The account row switches from skeleton to a static "Not connected", and nav counts and the mailbox pool are hidden. A 401 still goes to sign-in. Wired in `components/session/AppScreen.tsx`. Review at `/app?state=api-down`, and on `/styleguide` §18.

**Avatar without a picture (Q5a).** Initials `<Monogram>` on the neutral token tint (`neutral-200` fill, `neutral-600` initials, 6.08:1), same 24px box. It's also used when a picture URL fails to load. Review at `/app?state=no-avatar`.

**Account row while `/me` loads (Q5b).** Kept: it already uses the `Skeleton` primitive. Aligned to the text it replaces: 24 circle, name bar 96×10, email bar 120×8, with 6px between, plus `aria-busy` on the row and switcher. Review at `/app?state=account-loading`.

**Sign-out failure toast (Q6).** Final copy: "Sign-out didn't go through. You're still signed in.", with a **Try again** action that retries the same sign-out. It uses the error tone and stays up 10s. Review at `/app?state=signout-failed`, then Account → Sign out.

**Not decided in this batch:** Q4 (keep the in-app "Check your email" screen vs hand off to AuthKit, and the pending label). The current behaviour is unchanged.

