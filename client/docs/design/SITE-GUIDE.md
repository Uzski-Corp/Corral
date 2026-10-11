# Marketing site guide

The public site speaks the language of the home page (`/`, landing direction 4, "Agent"). This is that language,
written down so new pages and sections match it. Code: `components/marketing/landing-v/` (`landing-v.css`,
`site-v.css`, `SitePage.tsx`).

## Where it applies

| Page | Wrapper |
| --- | --- |
| `/` | `LandingVariant v="4"` |
| `/pricing`, `/security`, `/mcp`, `/changelog` | `AgentSitePage` |
| `/legal/*`, 404, error, `/sign-in`, `/fenceline` | Not yet: still on `SitePage` / their own chrome |

## Colour

- Page `#F9F9FA`, alternate ground `#EFEFF0`, ink `#141414`, body copy `#3F3F3F`, muted `#6A6A6A`, rules `#E4E4E6`.
- One brand blue, `#224FD1` (`--lv-blue-1`), for data (meters, bars) and small accents. Not for large fills.
- Green (`--color-positive-600`) only for a good result: a fit score, a passing check.
- Buttons are ink (`#141414`, `c-btn--ink`) or white with a hairline (`sn-btn-line`). One ink button per group.

## Type

- Two families: Inter Tight for display (`--mk-font-display`), the system sans for everything else; mono only for
  code, URLs and tool names.
- Every page opens the same way: a 13px muted kicker, one headline (500, tight tracking, `text-wrap: balance`), one
  lede of 17–19px. Section titles are 28–40px.
- Sentence case everywhere. Headlines end with a full stop.

## Layout and spacing

- 1240px container, `clamp(20px, 3vw, 40px)` gutters. Spacing in 8px steps; gaps between cards are 8px, padding
  inside trays 8–12px, padding inside cards 12–24px.
- Long-form content uses numbered sections: number and title in the left margin, the content in a reading measure,
  a hairline above each section.

## Surfaces

The signature: things sit on a ground, and each item is raised off it.

- **Window**: a rounded panel (12–16px). A dark `#141414` title bar when it stands for the product.
- **Tray**: a light grey ground (`#F3F3F3`, `--lv-art-neutral`) holding a list. Each item is its own white card, 10px
  corners, `--sv-raise` shadow (hairline plus a soft 4/12px drop), 8px apart. Use for rules, ledgers, plans, run steps,
  checks and client lists. No dividers between the cards.
- **Plate**: a product moment (a real screen, a piece, an illustration) sits on a grain gradient, 16px corners:
  sea glass (`01`), blue ink (`02`), warm amber (`03`), forest (`04`) in `public/corral/gradients/`. Captions on a
  plate are white at 80%.
- Text-only content (tables, FAQs, changelog items, legal) stays on hairlines, without trays or plates.

## Nav and close

- The landing nav: logo, page links, Sign in, and an ink "Join the waitlist" button. Below 1080px the links collapse;
  below 720px Sign in does too.
- Every page closes with the waitlist band over the sunlit reef and the dark footer. On inner pages the band's form is
  `#join`, so every call to action is `href="#join"`, and signups are tagged `site` (`home` on `/`).

## Motion

- Entrances only, on first view: a 10px rise with opacity, ease-out (`--lv-ease`), staggered. Hover and press states
  150–200ms. Nothing animates on things people use often, and all of it is off under `prefers-reduced-motion`.

## Copy

- Waitlist-only for now: no trials, walkthroughs or sign-in-and-connect CTAs. The call to action is always
  "Join the waitlist".
- Say what the product does, plainly, with real numbers. Anything an owner still has to confirm carries a
  `ToConfirm` tag.
