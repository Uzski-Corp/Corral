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
| `/sign-in` | Email six-digit code (WorkOS Magic Auth) + Google | `?state=sent` (code entry) · `code-verifying` · `code-wrong` · `code-expired` · `code-resent` · `resend-limited` · `change-email` · `error` (sign-in didn't finish) · `invalid` · `cancelled` · `unavailable` (see §9) |
| `/app?view=knowledge` | Knowledge base for one product (live: upload and reading simulators, edit, remove with Undo) | `&state=empty` · `drafting` · `loading` · `error` · `sources` · `source` · `partial` · `failed` · `upload` · `upload-errors` · `dragging` · `tray` · `editing` · `save-error` · `conflict` (see §10) |
| `/onboarding` | 5-step workspace setup with progress and skip | `?step=1…6` (6 = done) · `?skipped=3,4,5` · `?crawl=done` · `?mailbox=1` |
| `/styleguide` | Every component, live, where it is used (sections 01–25; knowledge base is 20–24) | — |

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
- `SignIn` (C, `components/app/screens/SignIn.tsx`): `{ initial? ["default" | "sent" | "error" | "invalid" | "cancelled" | "unavailable" | "code-verifying" | "code-wrong" | "code-expired" | "code-resent" | "resend-limited" | "change-email"]; actions? }`. `error` = the sign-in didn't finish (callback error), `cancelled` = backed out at Google, `unavailable` = auth provider down. The code states and `actions.sendCode` / `actions.verifyCode` are specified in §9.
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
- Hint: "From login@corral.app. Paste it whole, or type it." Errors replace the hint in the same slot, with `role="alert"`.
- `onComplete` fires once, when the value becomes six digits. **Continue** stays for keyboard and assistive-tech users and is disabled until there are six digits.
- Cells use `--color-border-control` (3.24:1, WCAG 1.4.11). The caret cell gets the action ring, wrong gets negative-600, checking gets muted, and expired gets muted digits with a strike-through.

### States (all reachable with `/sign-in?state=…` outside production)
| `?state=` | What shows | Copy |
|---|---|---|
| `sent` | Code entry, empty and focused. The resend link is on a 0:20 cooldown. | "We sent a six-digit code to {email}. Enter it below; it expires in 10 minutes." · "…or send a new code in 0:20." |
| `code-verifying` | The field is read-only, "Checking…" sits next to the label, and the button reads "Checking code…" (disabled). | — |
| `code-wrong` | Inline error. **The digits stay** and are selected on focus, so typing replaces them and Backspace edits. Editing clears the error. | "That code isn't right. Check the newest email from Corral and try again." |
| `code-expired` | The field is locked. The primary becomes **Send a new code**, and the resend line hides (the primary is the resend). | "That code has expired. Codes last 10 minutes." |
| `code-resent` | Success banner. The field is cleared and refocused, and the cooldown restarts at 0:20. | "**New code sent.** Use the code in the newest email. It expires in 10 minutes." |
| `resend-limited` | Caution banner with a live countdown. The resend link shows the same countdown. The banner clears itself at 0:00. | "**Too many codes asked for.** You can ask for 3 codes a minute. The last code we sent still works, or send another in 0:41." |
| `change-email` | Back on the form. The old address is prefilled and selected on focus, with a note under the field. | "We'll send a new code to this address. The code sent to {old} won't work for it." |

Also designed, without their own review state: a failed first send stays on the form with "**Couldn't send your code.** Check your connection, then try again. Nothing was sent."; a failed resend shows "**Couldn't send a new code.** Check your connection, then try again. The last code we sent still works."; and a failed verify (no answer) shows "Couldn't check the code. Check your connection and try again." (field stays editable).

### What Krak wires (`SignInActions`, `components/app/screens/SignIn.tsx`)
```ts
sendCode?:   (email: string) => Promise<CodeSendResult>;   // { ok: true } | { ok: false, reason: "rate-limited", retryAfter } | { ok: false, reason: "network" }
verifyCode?: (email: string, code: string) => Promise<CodeVerifyResult>; // { ok: true } | { ok: false, reason: "wrong" | "expired" | "network" }
```
- If `sendCode` is **absent**, the email button keeps today's behaviour (`startEmail` → AuthKit hosted page), so nothing breaks before the endpoints land. Once both are present, the email path stays in the app.
- `sendCode` is used for the first send, for **send a new code** and for **Send a new code** after expiry. Map a 429 to `rate-limited`, with `retryAfter = retryAfterSeconds(res.headers.get("Retry-After"))` (seconds or an HTTP date; 60 if missing). Map network errors, timeouts and 5xx to `network`. A rate limit on the *first* send still opens the code screen with the limited banner, because an earlier code may be in the inbox.
- `verifyCode`: map WorkOS "invalid code" to `wrong` and "expired" to `expired`. On `{ ok: true }`, set the session and navigate (to `safeReturnTo(next) ?? APP_HOME`, then `/onboarding` for new workspaces, as the callback does). The screen stays on "Checking…" until the page unloads.
- **Soft cooldown:** after every successful send the resend link waits 20s (60s ÷ 3). One tab never hits the WorkOS limit. The server limit still wins (other tabs, other devices), which is when `resend-limited` shows.
- Don't count or cap wrong attempts in the client. If WorkOS locks a code after too many tries, return `expired` and the UI already says the right thing (open question below).
- Review mode (no API): `123456` signs in, `111111` is expired, anything else is wrong, and the 4th send inside a minute is rate-limited.

### Copy changes (every "link" and "15 minutes" is gone)
- Lede: "Use your work email. We email you a six-digit code instead of asking for a password."
- Button: "Email me a sign-in link" / "Email me a new link" → **"Email me a code"**; pending state "Sending link…" → **"Sending code…"**.
- Callback `error` banner: "That link has expired. Sign-in links work once and last 15 minutes…" → **"That sign-in didn't finish. It may have timed out or been opened twice. Start again below; it only takes a minute."**
- `unavailable`: "…send email links right now" → "…send sign-in codes right now". "Email links go through the same provider…" → "Email codes go through the same provider…".
- Tests updated for the new copy: `components/session/SignInScreen.test.tsx`, `test/pages.test.tsx`, `e2e/auth.spec.ts`. New tests: `components/app/screens/SignIn.code.test.tsx`, `lib/auth/code.test.ts`, and extra cases in `lib/auth/signInState.test.ts`. **Playwright visual baselines `sign-in.png` and `sign-in-error.png` need regenerating**, because the lede, button and error banner copy changed.

### Open questions
1. Does WorkOS lock a code after N wrong attempts, and what does the API return then? The design treats it as `expired`, which leads to "Send a new code".
2. Does sending a new code invalidate the previous one? The copy says "use the code in the newest email", which is safe either way. If old codes stay valid, the limited banner's "the last code we sent still works" is still true.
3. The sender address in the hint is `login@corral.app`. Confirm it matches the WorkOS email template.

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
