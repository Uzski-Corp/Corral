# Image sources: Corral round 3 (Next.js landings, /styleguide, M1 app screens)

None of these images are model-released or cleared for brand use. They are reference-grade stand-ins for the design study, and every person, company, quote and number shown with them is sample content. Replace them with commissioned or licensed photography, and brand-owned portraits, before anything ships.

## Launch blocker (M10, for Oct 7): every photograph needs a licensed replacement

**Status: not cleared. Do not ship any of these files on a public page.** None is model-released, none is licensed for brand or advertising use (Unsplash and Pexels licences don't cover implied endorsement by a recognisable person), and the portraits are shown next to invented names, titles, quotes and companies, which is the use those licences exclude. Since M10 the landings, `/pricing`, `/security`, `/mcp`, `/changelog` and the share images embed the real app, so the **app avatars are on public pages too**.

| Where it shows at launch | Files | Replace with | Owner |
|---|---|---|---|
| `/open-range` hero, Unibox plate, read plate, pricing band; sign-in art; app empty-state art | `or/range-wide.jpg`, `or/range-sky.jpg`, `or/range-grass.jpg`, `or/dusk.jpg` | Licensed or commissioned East African landscape (sky, grass, acacia at dusk), same crops | Aegon (buy) → Bau (grade) |
| `/fenceline` plates I–VI | `en/land-plate.jpg`, `en/land-band.jpg`, `en/acacia-plate.jpg` | Same, then re-engraved with `round2/img/engrave2.py` | Aegon → Bau |
| `/open-range` People section, `/fenceline` People plates and hero face stack | `or/p-*.jpg`, `or/hero-wanjiru.jpg`, `en/p-*.jpg`, `en/hero-kamau.jpg`, `en/av-*.jpg` | Model-released portraits of real customers who agreed to be quoted, **or** remove the section until there are real quotes | Aegon |
| Every embedded app screen on the public site and in the share images (`opengraph-image.jpg` for `/`, `/open-range`, `/fenceline`, `/security`) | `app/av-*.jpg` (11) | Model-released stock with an advertising licence, **or** initials avatars on public pages only (as the account menu does in the `no-avatar` review state) | Aegon → Krak (a prop to force initials) |
| The share images | `app/**/opengraph-image.jpg` | Re-shoot from `/styleguide/share` after the photos above are replaced (`/workspace/corral/m10-wip/og.mjs`) | Bau |

Until then, every public page carries the line "Photographs are reference-only stand-ins, not model-released, and are replaced before launch." (`SAMPLE_NOTE` in `lib/marketing/site.ts`); take it out when the table above is done, and not before.

Files live in `client/public/corral/`. Treatments are in `/workspace/corral/round3/img/gen.py` and `portraits2.py`, and in `/workspace/corral/round2/img/treat.py` and `engrave2.py`.

## Landscapes
| Used as | Files | Source |
|---|---|---|
| Open Range sky and dune grass (hero, Unibox plate, grass close-up; M1: sign-in art panel and onboarding card band use `range-wide`, app empty states use `range-sky` and `range-grass` crops) | `or/range-wide.jpg`, `or/range-sky.jpg`, `or/range-grass.jpg` | Unsplash, https://unsplash.com/photos/FK38342kkz0 (images.unsplash.com/photo-1523865820710-ce918e171d67). Film-graded. |
| Open Range dusk (pricing and footer) | `or/dusk.jpg` | Unsplash, images.unsplash.com/photo-1770843093638-1941ee5cbc64 (acacia at sunrise). Film-graded. |
| Fenceline farmland engravings (hero Pl. I, band Pl. II, index card) | `en/land-plate.jpg`, `en/land-band.jpg` | Unsplash, Kiambu, Kenya, by Alphonse Oudia, https://unsplash.com/photos/PW6S2yUhMYA (photo-1747854844312-cd1b46303cda). Engraved. |
| Fenceline acacia engravings (Pl. III, Pl. VI) | `en/acacia-plate.jpg` | Same Unsplash photo as the dusk image (photo-1770843093638-1941ee5cbc64). Engraved. |
| Downloaded, not used | — | Unsplash photo-1690628447186-9021f9479320 (storm cloud field) |

## Portraits (all sample people; names are fictional)
| Shown as | Files | Source |
|---|---|---|
| Wanjiru Mwangi | `or/hero-wanjiru.jpg`, `or/p-wanjiru.jpg`, `en/p-wanjiru.jpg`, `*/av-wanjiru.jpg` | Pexels 12596079 by davidowaga, Nairobi, https://www.pexels.com/photo/a-woman-smiling-at-the-camera-12596079/ |
| Brian Kamau | `or/p-kamau.jpg`, `en/hero-kamau.jpg`, `*/av-kamau.jpg` | Unsplash, https://unsplash.com/photos/afqRNiMCELc (photo-1543644596-b9cb41f6535c) |
| Amara Nwosu (lead, Savanna Juice) | `p-amara`, `av-amara` | Unsplash photo-1531123897727-8f129e1688ce |
| Amara Njoroge (teammate at ColdTrace; M8, before that she borrowed `av-amara`) | `app/av-njoroge.jpg` | Pexels 28606691 by Sylo Mkaleh, Nairobi, https://www.pexels.com/photo/portrait-of-a-young-woman-in-nairobi-studio-28606691/ (raw in `round2/img/raw/p-pexels-28606691.jpg`). Face crop, same app film grade; script `/workspace/corral/m8-wip/img/njoroge.py` |
| Grace Holloway | `p-grace`, `av-grace` | Unsplash photo-1508214751196-bcfd4ca60f91 |
| Reza Santos | `p-reza`, `av-reza` | Unsplash photo-1507003211169-0a1dd7228f2d |
| Tomás Ibarra (now the customer / founder of ColdTrace Sensors) | `p-tomas`, `av-tomas` | Unsplash photo-1547425260-76bcadfb4f2c |
| Daniel Weber | `av-daniel` | Unsplash photo-1500648767791-00dcc994a43e |
| Lena Fischer | `av-lena` | Unsplash photo-1544005313-94ddf0286df2 |
| Mark Ellison | `av-mark` | Unsplash photo-1560250097-0b93528c311a |
| Sofia Brandt | `av-sofia` | Unsplash photo-1573496359142-b8d87734a5a2 |

## Treatments
- `app/av-*`: film grade (warm, lifted blacks, grain), 240px squares, shown in circles. This is the app avatar on every route, including Fenceline, because product UI is Open Range everywhere.
- `or/*`: film grade.
- `en/*`: line engraving (ink #1F1B18 on paper #F2F1ED). Small-display portraits use a coarser line period. `en/av-*` are ink duotones, used only in the Fenceline hero face stack.

cosmos.so was not used.
