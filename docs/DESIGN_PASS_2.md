# CarSage Design Pass 2

**Status: plan with the decisions of 2026-10-22 applied (see "Decisions" below), built one ticket at a time; each ticket's progress is in Jira.** This document reviews the app as it is after CAR-67 to CAR-74, proposes a more modern look, and lists tickets. It was written on 2026-10-22 on branch `ui/polish`, after commit `6c5327b`.

**Your goals:** a more modern look, better icons, better animation, a better nav bar, the new features (maintenance, expenses, fuel log, odometer, real fuel economy) visible on the Dashboard, and Aceternity and Componentry used where they genuinely help.

## Decisions (2026-10-22)

These answer §6 and override anything below that says otherwise.

1. **Photo-adjacent places:** allowed **for icon markup only** (the Fuel Log scan-card icons and the camera and photo SVGs in Car Profile, Car Onboarding and AI Advisor). No camera, photo, upload or limits logic changes, and each such diff is shown as proof.
2. **No account menu.** Log Out stays a plain button. A menu is only worth building with 3 or more items.
3. **D9 is dropped.** Any underline on the Landing headline is plain CSS, inside D6.
4. **Unused assets** (D8) are deleted only after proof for each file (no reference anywhere, and an identical build before and after).
5. **CSS budget:** 72 kB minified and 13 kB gzip, **measured and reported in every ticket**, and enforced by `scripts/check-bundle.mjs` from CAR-75.
6. **No Aceternity source is ever copied or installed, and no animation library is used.** Any library needs your approval first, with its bundle cost and licence. `components.json` no longer lists the Aceternity registry, and `CLAUDE.md` carries the rule.
7. **D7 (status colours) is required**, not optional.
8. **D4 is built by Opus 5.5** (it was Sonnet 5.5).

**Jira keys**

| Ticket | Jira |
|---|---|
| D1 Motion | CAR-75 |
| D2 Icons | CAR-76 |
| D3 Header v2 | CAR-77 |
| D4 Dashboard data | CAR-78 |
| D5 Dashboard UI | CAR-79 |
| D6 Landing | CAR-80 |
| D7 Status colours | CAR-81 |
| D8 Favicon and assets | CAR-82 |
| D10 Category icons | CAR-83 |
| D9 | dropped |

## 1. Summary

- **Icons:** one Lucide set copied into `src/components/icons.jsx`. Neither self-hosted font has the arrow, check, caret or sparkle glyphs the app uses as text icons (§2.2), so those render differently on every device today.
- **Motion:** a small CSS-only system (three durations, two easings, a fixed list of what moves). No library.
- **Desktop header:** sticky, with a scroll shadow and an active-link bar. Log Out stays a button (no account menu). The mobile menu from CAR-74 stays.
- **Dashboard v2:** a hero card for the active car with four tiles (odometer, real fuel economy, last fill-up, next service), then month cost, maintenance due and DIY success. **Every number comes from data the page already loads, and the two `fuel_logs` queries become one.** No new tables, queries or backend.
- **Libraries:** of 27 Aceternity and Componentry items viewed, **none is needed** and none will be used (decision 6). The one that fit, Componentry `annotated-text`, is dropped (D9); any underline is CSS. Everything else is built in CSS (§3.5).
- **Cost:** about 39 h in total (D9 dropped), 28.5 h for the core with the header (D1 to D5 and D7). Entry-chunk impact is planned to net out near zero (§6).
- **Findings that need no redesign:** "Due soon" looks like "Overdue" on the four red-accent themes and reads as blue on three others (D7), and `public/favicon.svg` is 343 kB (D8).

## 2. Review of the current state

### 2.1 How it was checked
- **Logged out:** Landing and Log In at 1280 px and 390 px, headless browser.
- **Dashboard for 0, 1 and 3 cars:** through a local fixture backend (a fake session, made-up cars and a few fuel, expense and maintenance rows, every request answered inside the test browser, nothing sent out). The real demo account has 4 cars and cannot be shown with fewer without deleting data.
- **Real account:** you logged in once in one headed browser window on a fresh profile folder. I walked 8 logged-in screens at both widths, view-only (navigation and screenshots, nothing clicked or saved), plus close-ups of the header and menus. That profile folder was deleted afterwards. The earlier saved profile was not used or copied.
- **Screenshots** are in the session scratchpad, outside the repo (`scratchpad\design2\shots`, `shots-real`).
- **Real demo data:** 4 cars (Honda CR-V, Ferrari 488, Mercedes C230, Mazda MX-5), nothing logged this month, no maintenance items, DIY success 60%.

### 2.2 Icons and emoji, every place
Source scan of `src/` (tests excluded). "Photo-adjacent" files hold camera or photo markup, so their icons need your OK before they change.

| Place | What is used today | Count |
|---|---|---|
| Landing feature, step and trust cards | 🚗 🧭 💬 🧾 🔒 | 5 |
| Landing hero and cards | ✦ → ↓ ✓ as text glyphs | 7 |
| Dashboard Quick Access | 🧭 💬 ⛽ | 3 |
| Dashboard links | → glyph | 5 |
| Car Profile spec rows | 🚗 🏷 📅 🔧 ⛽ 📊 🛠 🛢 ⚙ 🔁 🪪 🔢 | 12 |
| Car Profile "Default car" badge | ✓ glyph | 1 |
| Trip Planner result rows | ⛽ 🚦 ⏱ 📍 🛢 | 5 |
| Header My Car menu | ▾ glyph | 1 |
| AI Advisor | ▶ (send), ✓ ("You said this fixed it") | 2 |
| Sign Up, Log In, Reset, Onboarding buttons | → glyph | 4 |
| Onboarding "Auto-filled" | ✓ glyph | 1 |
| Auth and Reset cards | one inline house SVG each | 2 |
| **Photo-adjacent, needs OK** | Fuel Log scan cards 📷 (2); camera and photo SVGs in Car Profile, Car Onboarding and AI Advisor (5) | 7 |
| Brand marks | `BrandBadge` via simple-icons, Mercedes PNG | unchanged |

- **Finding: the glyph "icons" are not in the fonts.** Checked with the font files: Space Grotesk and Manrope both lack → ✓ ▾ ▶ and ✦ (they have ↓ • · ×). Each of those is drawn by whatever fallback font the device has, so it differs per OS.
- **Finding: the emoji are pastel images on pastel tiles.** They look weak next to Stitch's single-colour line icons, and they cannot follow the brand theme.

### 2.3 Animations and transitions
- **Keyframes (5):**
  - `cold-start-spin`, 0.8 s, loops (static dots under reduced motion since CAR-72);
  - `skeleton-shimmer`, 1.4 s, loops (static under reduced motion);
  - `screen-loading-slide`, 1.1 s, loops (the CAR-67 bar, static under reduced motion);
  - `advisor-typing-bounce`, 1 s, loops (static since CAR-72);
  - `spec-loading-spin`, 0.8 s, loops (static under reduced motion).
- **Transitions (8):**
  - the mobile menu panel, 150 ms transform (CAR-74);
  - the photo overlay buttons, 0.15 s (hover scale 1.06 on the large one);
  - the photo well, the advisor mechanic link, the advisor video card, the maintenance presets, the Advanced options caret: all 0.15 s.
- **What does not move at all:** route changes are a hard cut; cards have no entrance and no hover lift; the My Car dropdown appears instantly; ordinary buttons change colour instantly.
- **No shared tokens:** durations are written out each time, easing is the default `ease`.

### 2.4 Desktop header
- 80 px tall, **not sticky** (it scrolls away on every long page), grid of logo, centred links, actions.
- The logo is a 48 px image whose wordmark is too small to read (Stitch shows the wordmark as text beside the mark).
- Active link: an underline in the theme accent (works on every theme). Hover only changes opacity. The My Car caret is the ▾ glyph (§2.2).
- Right side: USD | LBP on price pages and a plain outlined "Log Out". Nothing says who is signed in.

### 2.5 Dashboard
- **0 cars:** a heading and plain sentences for every section, one button. Honest, but flat.
- **1 car:** one car card, then a single column of unrelated-width blocks. The month and maintenance cards stop at about 640 px while the car and Quick Access cards go full width, so the right edge is ragged.
- **3 and 4 cars (real account has 4):** each car is a full-width card of about 150 px with equal weight. With 4 cars, "All cars, this month" starts about 1,000 px down at 1280 px and about 1,300 px down at 390 px.
- **The new features are invisible.** Odometer, real km/L and last fill-up appear nowhere on the Dashboard, even though the fixture (and any real user's fuel log) has that data. The "Efficiency 12.1 km/L" on each car card is the **stored spec** from the car lookup, not the measured economy.
- **"Due soon" is brand-coloured.** `.maintenance-badge--due_soon` uses `--color-accent`, while `--overdue` uses a fixed red (`#b3261e`). Read from `carBrandThemes.js`: on **Toyota, Honda, Audi and Tesla** the accent is red, so "Due soon" looks like "Overdue" (seen in the Honda fixture screenshot); on **Mercedes, BMW and Volkswagen** it is blue, which does not read as a warning; only the default gold and Ferrari yellow look like "soon". "OK" uses the primary colour, which is near-black on Mercedes and Tesla.
- Raw values (`rwd`, `a`), emoji Quick Access icons, "DIY Success 60%" as the biggest type on the page (the brief says numbers stay plain), and the earlier audit findings are unchanged.
- **States:** a skeleton exists for the cars, the month tile, maintenance and DIY. Since CAR-74 a failed car list shows an error with "Try again".

### 2.6 Landing
- The hero has no product preview, which Stitch has (a dashboard summary card under the CTAs).
- The headline wraps to leave "place" alone on the second line at 1280 px.
- Feature icons are the pastel emoji; the faint gear watermark sits large behind all the content.
- Below the hero (63% of `LandingPage.jsx`'s source) is plain text and cards: a good candidate for a lazy chunk (§6).

### 2.7 Other findings
- **`public/favicon.svg` is 343 kB.** It is four traced paths with huge coordinate lists. Every first visit downloads it for the tab icon. The same bytes sit in `src/assets/favicon-icon.svg`, plus unused `Gemini_Generated_Image_*.svg` (342 kB), `logo-svg.svg` and `background-texture-svg.svg`, none shipped but all in the repo.
- **CSS is 64.7 kB minified (10.9 kB gzip).** The audit's guideline was 64 kB, and there is no guard for CSS. New design work needs a stated CSS budget (§6).
- **Contrast of cyan buttons on Mercedes is fine:** dark `#2b2b2b` text on `#00a0dc`, about 5:1. (I checked this because it looked wrong in a screenshot.)
- **Stitch items not borrowed:** sidebar, telemetry, OBD-II, "system health", tire and battery readouts, "Book Service" are out of scope per CLAUDE.md. What is borrowed: a primary-car hero with four stat tiles, a "Default car" badge, soft cards, a clear primary action.

## 3. Proposals

### 3.1 Icons

**Set and licence.** Lucide (ISC), copied as SVG, no npm dependency (the "no `lucide-react`" rule stays). The Lucide `LICENSE` has two parts, and both must be in the `icons.jsx` header: the ISC text, plus the MIT text (Cole Bemis) for the icons derived from Feather. Of the planned icons these are Feather-derived: `arrow-right`, `arrow-down`, `check`, `chevron-down`, `lock`, `log-out`, `x`, `plus`, `hash`, `trash-2`, and `triangle-alert` (the licence lists it under its old name, `alert-triangle`). The header lists the exact names and their licence, re-checked against the `LICENSE` of the Lucide version actually copied.

**Size and stroke rules**
- Sizes: **16** inline with text, **20** buttons, menu rows and tiles (default), **24** feature cards, **32** only the hero and empty states.
- One stroke token, `--icon-stroke: 1.75`, on every icon (Lucide's default 2 is heavy at 20 px). Round caps and joins.
- Colour is `currentColor`. A decorative icon is `aria-hidden` and `focusable="false"`. An icon that carries meaning gets `role="img"` and a text label; an icon-only button always has an accessible name.
- Tinted tile: 40 px square, radius 12, accent at 16% over white, icon in `--color-accent-text` (AA, from CAR-69). Icon-to-tile contrast must be at least 3:1 on every theme.

**Mapping (current to Lucide)**

| Today | Lucide | Where |
|---|---|---|
| 🚗 | `car` | Landing, Car Profile make |
| 🧭 | `route` | Landing, Dashboard |
| 💬 | `message-circle` | Landing, Dashboard |
| 🧾 | `receipt-text` | Landing |
| 🔒 | `lock` | Landing |
| ✦ | `sparkles` | Landing badge |
| ⛽ | `fuel` | Dashboard, Car Profile fuel type, Trip Planner |
| 🏷 📅 🔧 📊 🛠 🛢 ⚙ 🔁 🪪 🔢 | `tag` `calendar-days` `wrench` `gauge` `cog` `cylinder` `settings-2` `repeat` `id-card` `hash` | Car Profile |
| 🚦 ⏱ 📍 🛢 | `traffic-cone` `timer` `map-pin` `droplets` | Trip Planner |
| → ↓ ✓ ▾ | `arrow-right` `arrow-down` `check` `chevron-down` | everywhere |
| ▶ send, ✓ fixed | `send`, `circle-check` | AI Advisor |
| house on Auth and Reset | the logo mark (no icon needed) | Auth, Reset |
| 📷 and photo SVGs | `camera` | **needs OK** (photo-adjacent) |
| (new) | `triangle-alert` DIY vs mechanic banners, `wrench` DIY, `refresh-cw` retry, `plus` add, `trash-2` delete | Advisor, Dashboard, Car Profile |

**Cost, measured** (36 icons as JSX with one shared `Icon` wrapper; esbuild minified, gzip level 9; median icon 156 bytes of JSX):

| Where it lands | Icons | Min | Gzip |
|---|---|---|---|
| **Entry chunk** (header, buttons, Landing hero, Auth): arrow-right, check, chevron-down | 3 | 0.54 kB | **0.35 kB** |
| Landing feature icons, in the lazy below-the-fold chunk | 6 | 2.12 kB | 0.83 kB |
| Dashboard route | 15 | 3.54 kB | 1.21 kB |
| Car Profile route | 15 | 3.81 kB | 1.26 kB |
| Trip Planner route | 6 | 1.76 kB | 0.82 kB |
| AI Advisor route | 5 | 1.35 kB | 0.69 kB |
| Fuel Log route | 3 | 0.95 kB | 0.51 kB |
| All 36 if one chunk used them all | 36 | 8.12 kB | 2.42 kB |

Only named imports are used, so each chunk ships just the icons it references. The header has no icon of its own: the menu bars are already CSS and the caret becomes `chevron-down`.

### 3.2 Motion system

CSS only, no library. All motion is off or static under `prefers-reduced-motion: reduce`.

**Tokens**

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | 120 ms | hover and focus colour, small state changes |
| `--motion-base` | 180 ms | menus, dropdowns, the mobile panel (today 150 ms) |
| `--motion-slow` | 280 ms | page fade, card entrance |
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | things appearing |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | state changes and closing |

**Exactly what animates**

| Thing | Motion | Notes |
|---|---|---|
| Page change | fade in, 4 px up, `--motion-slow` | on `main` content; transform and opacity only, no layout shift |
| Dashboard cards on first render | fade and 8 px up, 40 ms stagger, at most 6 items | only on first paint of the page, never on a data refresh |
| Cards and tiles on hover and focus | lift at most 2 px, soft shadow, `--motion-fast` | no movement under reduced motion |
| Buttons | background colour, `--motion-fast` | none today |
| Menus (My Car, account, mobile panel) | fade and 4 px, `--motion-base` | My Car is instant today |
| Active-link bar | scale in from the left, `--motion-fast` | CSS only; sliding between links would need JavaScript, not proposed |
| Skeleton shimmer, spinners, typing dots | as today | static equivalents already exist |

**Never animated:** money, km, km/L, percentages and advice text (a plain fade on first appearance at most), no counting-up numbers, no parallax, no auto-play loops on content, nothing that moves behind text.

**Safety net:** one reduced-motion rule that makes any animation and transition effectively instant, plus the per-component static versions already in place (dots instead of a spinner and so on). A test fails if any element that holds a price or a stat value has an animation.

### 3.3 Desktop navigation

```
 Today (80 px, scrolls away)
 +--------------------------------------------------------------------------------------------+
 | (logo 48)        Dashboard   My Car v   Trip Planner   AI Advisor        [USD|LBP] [Log Out] |
 +--------------------------------------------------------------------------------------------+

 Proposed (72 px, sticky)
 +--------------------------------------------------------------------------------------------+
 | (logo) CarSage   Dashboard   My Car v   Trip Planner   AI Advisor            [USD|LBP] [Log Out] |
 |                  =========                                                                  |
 +--------------------------------------------------------------------------------------------+
   ^ shadow appears after 8 px of scroll          ^ Log Out stays a button (no account menu)
   ^ active link: 2 px accent bar under the label (not only a colour change)

 My Car menu (grouped, same keyboard behaviour as today)
   Car Profile
   Fuel Log
   Maintenance
   Expenses
   --------------
   Add a car
```

- **Sticky:** `position: sticky; top: 0`, with `scroll-margin-top` so the Landing anchors (`#features`, `#how-it-works`) are not hidden under it. The mobile bar becomes sticky too (it is already a fixed 64 px).
- **Scroll shadow:** appears after 8 px, with a tiny observer on a sentinel element (about 0.15 kB). No transition under reduced motion.
- **Active-link indicator:** a 2 px bar in the accent colour. It must reach 3:1 against the header on every theme (a test over all themes, like CAR-69's).
- **Wordmark:** "CarSage" as text beside a smaller logo mark (Stitch does this), logo height 40 px.
- **Grouped My Car menu:** unchanged in behaviour (arrow keys, Home, End, Escape, outside click), with a divider before "Add a car" and icons from D2.
- **No account menu (decided).** Log Out stays a plain button; a menu is only worth it with 3 or more items. The email is never shown, as today.
- **Currency switch:** stays inline on pages that show prices (as CAR-54 decided) and in the mobile panel.
- **Mobile:** the CAR-74 menu stays as it is (one 64 px row, Menu button, panel). It only gains sticky and the new icons.

### 3.4 Dashboard v2

**Layout (desktop, active car with 3 other cars)**

```
 +--------------------------------------------------------------------------------------------+
 | header (sticky)                                                                            |
 +--------------------------------------------------------------------------------------------+
   Welcome back                                                         [ + Add another car ]

   +--------------------------------------------------------------------------------------+
   | [photo or brand badge]  2018 Honda CR-V   (Default car)                              |
   |                         AWD | CVT | 1.5L Turbo I4 | Gasoline | BML 78901 | 57 L tank  |
   |                                                                                      |
   |  +--------------+ +--------------+ +----------------+ +--------------------+         |
   |  | (gauge)      | | (fuel)       | | (calendar)     | | (wrench)           |         |
   |  | ODOMETER     | | REAL ECONOMY | | LAST FILL-UP   | | NEXT SERVICE       |         |
   |  | 120,600 km   | | 11.8 km/L    | | 16 Oct, 41 L   | | Oil change         |         |
   |  | as of 16 Oct | | 4 fill-ups   | | $16.14         | | 51 days overdue    |         |
   |  +--------------+ +--------------+ +----------------+ +--------------------+         |
   |                                                                                      |
   |  [ Plan a trip ]  [ Log a fill-up ]  [ Ask the advisor ]  [ Add expense ]            |
   +--------------------------------------------------------------------------------------+

   Your cars:  ( * Honda CR-V )  ( o Ferrari 488 )  ( o Mercedes C230 )  ( o Mazda MX-5 )

   +-----------------------+ +--------------------------+ +---------------------------+
   | THIS MONTH, ALL CARS  | | MAINTENANCE DUE          | | DIY SUCCESS               |
   | $311.67               | | Oil change   Honda  late | | 60% fixed (5 of 8)        |
   | Fuel $66  Other $245  | | Brakes       Ferrari soon| | Latest: tire light        |
   | See expenses >        | | See all maintenance >    | | Ask the advisor >         |
   +-----------------------+ +--------------------------+ +---------------------------+
```

**Mobile (390 px)**
```
   Welcome back              [+ Add]
   +--------------------------------+
   | (brand badge) 2018 Honda CR-V  |
   | AWD | CVT | Default car        |
   | +------------+ +------------+  |
   | | ODOMETER   | | REAL ECON. |  |   tiles 2 x 2
   | | 120,600 km | | 11.8 km/L  |  |
   | +------------+ +------------+  |
   | | LAST FILL  | | NEXT SERV. |  |
   | | 16 Oct     | | 51 d late  |  |
   | +------------+ +------------+  |
   | [Plan a trip] [Log a fill-up]  |   2 x 2 actions, 44 px tall
   | [Ask advisor] [Add expense]    |
   +--------------------------------+
   ( * Honda ) ( o Ferrari ) ( o ... )   chips scroll sideways
   This month / Maintenance / DIY       stacked cards
```

**How many cars**

| Cars | Layout |
|---|---|
| 0 | One empty-state card: "Add your first car" with the primary button. The three lower cards still show their own empty states. No hero, no tiles. |
| 1 | The hero card. No switcher. The lower cards below. |
| 2 | The hero for the active car, and two chips as the switcher. |
| 3 and more | The hero for the active car, and chips that wrap (or scroll sideways at 390 px). Other cars appear only as chips and in the maintenance list, never as full cards, so the Dashboard no longer grows by about 150 px per car. |

The active car is the one from CAR-70 (`useActiveCar()`); choosing a chip calls the existing `setActiveCarId`, so the brand theme follows. The hero is in the car's brand theme. Money is shown through `<Price>` as today; numbers are plain text (a fade at most).

**Tiles: source, helper, new query?**

| Tile | Existing data | Existing helper | New query? |
|---|---|---|---|
| Car summary | `cars` row (already `select *`), `profiles.default_car_id` for the "Default car" badge | `BrandBadge`, `formatKmPerLiter`; display-only formatting of drivetrain and transmission (RWD, Automatic, unit-tested) | No. Optional photo: `getCarPhotoUrl(photo_path)` is a read of the existing `car-photos` bucket; **photo code boundary, needs your OK** |
| Odometer | `fuel_logs.odometer_km`, `filled_at` | `latestOdometer(entries)`, `formatKm` | No |
| Real fuel economy | `fuel_logs.liters`, `odometer_km` | `realEfficiency(entries)` (km/L, `intervalCount`, `distanceKm`; null when no valid step), `formatKmPerLiter` | No |
| Last fill-up | `fuel_logs.filled_at`, `liters`, `cost_amount`, `cost_currency` | `sortFillUps`, `formatFillDate`, `formatLiters`, `<Price>` | No |
| Next service | `maintenance_items` plus records | `dashboardMaintenance(items, readings, today)` filtered to the active car, `describeRemaining` | No |
| This month, all cars | `fuel_logs`, `car_expenses` | `monthlySummary`, `formatMonth` (`lib/costs.js`) | No |
| DIY success | `advisor_messages` | `diyFixRate`, `latestFixedMessage`, `timeAgo` | No |

**Requests.** Today the Dashboard reads `fuel_logs` twice with different columns. D4 merges them into one query with the union of the columns (`id, car_id, filled_at, created_at, liters, odometer_km, cost_amount, cost_currency`), scoped by `user_id` as now. The page goes from 6 requests to 5. No new tables, columns, policies or backend, and no change to the RLS-protected client.

**States for each tile** (copy has no em dashes)

| Tile | Skeleton | Empty | Error |
|---|---|---|---|
| Odometer | one bar and a label bar | "No reading yet. Add the odometer to a fill-up." (link to Fuel Log) | shared with the other fuel tiles |
| Real fuel economy | same | "Needs two fill-ups with odometer readings." (link to Fuel Log) | shared |
| Last fill-up | same | "No fill-ups yet." with "Log a fill-up" | shared |
| Next service | same | "Nothing tracked yet." with "Set up reminders" (link to Maintenance); "All caught up" when nothing is due | its own message and Try again |
| This month, all cars | as today | as today | as today, plus Try again |
| DIY success | as today | as today | as today |
| Car list | as today | 0 cars card | "Couldn't load your cars" with Try again (done in CAR-74 follow-up) |

The three fuel tiles come from one request, so one error line with one Try again covers them, and the rest of the page keeps working.

### 3.5 Library shortlist

**Rules applied:** free components only, `shadcn view` run for each, at most 4 in the whole app, and no library code in the entry chunk. I ran the real `npx shadcn view` for 27 items (17 Aceternity, 10 Componentry), saved outside the repo, and measured each one's own code with esbuild plus the libraries it needs.

**Licences**
- **Aceternity UI:** its own "Aceternity License", not MIT. It allows end products, commercial or personal, and modification, but **prohibits redistributing the item or its source files** and reselling. The registry JSON carries no licence field. If this repo is ever public, committing their source could count as redistribution, which is a reason to rebuild in CSS rather than copy. Pro blocks are not available: `empty-state-with-cards` returned "Unauthorized", as expected.
- **Componentry:** MIT (Harsh Jadhav, 2026), confirmed on its GitHub repo. A copied item must keep the MIT notice.

**Library costs, measured** (gzip, React external)

| Library | Gzip | Who needs it |
|---|---|---|
| `motion/react` (`motion.div`) | 45.95 kB | 14 of the 17 Aceternity items viewed |
| `motion/react` with `LazyMotion` and `domAnimation` | 31.47 kB | the smallest possible use |
| `framer-motion` | 45.93 kB | 3 Componentry items |
| `gsap` core | 27.68 kB | `layered-stack` |
| `@radix-ui/react-tabs` | 9.74 kB | Aceternity `tabs` |

For comparison, the whole Dashboard route chunk is **3.7 kB gzip** today and the route limit is 60 kB, so even the cheapest `motion` use is about 8 times the Dashboard chunk. No library of these can go in the entry chunk (0.84 kB of room).

**Every item viewed**

| Item | Own code, gzip | Needs | Reduced motion | Accessibility gaps | Verdict |
|---|---|---|---|---|---|
| Aceternity `spotlight` | 0.63 kB | nothing (CSS keyframe) | no | decorative SVG | Rebuild in CSS: the hero glow already exists |
| `meteors` | 0.52 kB | `motion` | no | decorative | No |
| `bento-grid` | 0.48 kB | `@tabler/icons-react` | no | none | CSS Grid instead |
| `card-hover-effect` | 0.73 kB | `motion` | no | pointer-only | No: CSS lift |
| `glowing-effect` | 1.53 kB | `motion`, rAF loop, pointer handlers | no | pointer-only | No |
| `moving-border` | 0.89 kB | `motion` | no | none | No |
| `hover-border-gradient` | 0.93 kB | `motion` | no | pointer-only | No |
| `navbar-menu` | 0.83 kB | `motion` | no | **hover only, no keyboard support** | No: the existing menu is tested and keyboard-complete |
| `floating-navbar` | 0.83 kB | `motion` | no | hides on scroll | No |
| `tabs` | 0.84 kB | `motion`, Radix tabs | no | Radix is accessible, the wrapper is not reduced-motion aware | No: plain buttons for the car switcher |
| `stateful-button` | 0.84 kB | `motion` | no | none | No: CSS states in T10 `Button` |
| `loader` | 1.15 kB | `motion` | no | none | No: skeletons exist |
| `tooltip-card` | 1.09 kB | `motion` | no | hover only | No |
| `noise-background` | 1.34 kB | `motion` | no | decorative | No |
| `pointer-highlight` | 0.90 kB | `motion` | no | decorative | No: CSS underline |
| `dotted-glow-background` | 1.66 kB | canvas, rAF loop | no | decorative, constant GPU work | No |
| `background-gradient` | 0.57 kB | `motion` | no | decorative | No |
| Componentry **`annotated-text`** | 2.63 kB | nothing | **yes** | the marks are `aria-hidden`, the text stays real | **Optional, lazy** (see below) |
| `hover-transition` | 2.98 kB | nothing | yes | keyboard yes | No: it is for image hovers, the app has no image grid |
| `split-flap-display` | 2.00 kB | nothing | no | **no accessible text at all** (letters read one by one) | No |
| `text-morph` | 1.80 kB | rAF loop | yes | ok | No |
| `magnetic-dock` | 2.56 kB | `framer-motion` | yes | keyboard yes | No: a macOS dock, pointer magnification does nothing on touch |
| `flight-status-card` | 3.10 kB | `framer-motion` | no | none | No: next-service progress is a CSS bar |
| `layered-stack` | 0.67 kB | `gsap` | no | pointer handlers | No |
| `grain-gradient` | 2.84 kB | `three`, WebGL | yes | decorative | No: heavy GPU work |
| `animated-gradient`, `signature` | not measured | WebGL shader; `opentype.js` | n/a | n/a | No |

**Recommendation: at most 1 of the 4 allowed, and none required.**
- **Optional:** Componentry `annotated-text` as a hand-drawn underline on "one place" in the Landing headline. It is MIT, handles reduced motion, and has no dependency. Its own code is 2.63 kB gzip, so it would be loaded **after first paint** with `import()`, with the plain text and a CSS underline as the fallback. Benefit: a bit of character. A CSS underline in D6 gives about 90% of the effect for about 0.2 kB, so I recommend **dropping it** unless you want the hand-drawn look.
- **Re-check of Componentry for one subtle Landing element:** `annotated-text` is the only one that fits. `grain-gradient` and `animated-gradient` need WebGL, `hover-transition` and `image-*` items need pictures, and the rest are dock, carousel or text-effect novelties.
- **Built in plain CSS instead:** bento layout (CSS Grid), card lift on hover and focus, hero glow, gradient borders (none planned), status badges, the tab-like car switcher (buttons with `aria-pressed`), skeleton shimmer, the Landing underline, the next-service progress bar, and a sparkline (a small inline SVG polyline if wanted later).

## 4. Tickets

Existing pending tickets (T9 to T21 in `docs/UI_TICKETS.md`) are kept except where noted: **T10's icon part moves to D2, T11 is replaced by D4 and D5, and T13 is replaced by D6.** T12, T14 to T21 follow the new icons and motion tokens when they are built.

### D1 (CAR-75). Motion tokens and system
- **Summary:** add the §3.2 tokens, move every existing transition onto them, add the page fade, the first-render card entrance, hover lift, button colour transitions, menu fades, and a reduced-motion safety net.
- **Acceptance criteria:**
  1. `--motion-fast`, `--motion-base`, `--motion-slow`, `--ease-out`, `--ease-in-out` exist and every non-looping transition or animation uses them (a CSS test lists any literal duration left).
  2. A route change fades the content in over at most 300 ms; Dashboard and Landing layout shift stays under 0.1 and Landing and Dashboard first paint is not delayed (production build, 5 runs).
  3. With `prefers-reduced-motion: reduce`, no CSS animation is running on Landing, Dashboard or AI Advisor (Playwright `getAnimations()`), and the static equivalents from CAR-72 and CAR-67 still show.
  4. No element holding a price, odometer, km/L or advice text has an animation (a test over the stylesheet and the markup classes).
  5. CSS grows by at most 0.6 kB gzip.
- **Recommended model:** Sonnet 5.5. **Estimate:** 3 h.
- **Retest:** `App.pending.test.jsx`, `accessibilityCss.test.js`, `headerCss.test.js`, every page's visual smoke at 1280 and 390 px, layout shift.

### D2 (CAR-76). Icons: Lucide set in `icons.jsx`
- **Summary:** create `src/components/icons.jsx` from §3.1 and replace every emoji and glyph icon outside the photo-adjacent files.
- **Acceptance criteria:**
  1. `icons.jsx` holds the listed Lucide icons, its header carries the ISC and MIT notices with the Feather-derived names, and `package.json` gains no dependency.
  2. One `Icon` base: default size 20, stroke from `--icon-stroke` (1.75), `aria-hidden` unless a `title` is given.
  3. A test fails if an emoji, or the glyphs → ✓ ▾ ▶ ✦, appears in any non-test `src` file other than an allow-list of the photo-adjacent files.
  4. The entry chunk gains at most 0.4 kB gzip of icons (arrow-right, check, chevron-down); every other icon is imported only by a route or lazy chunk; the bundle guard passes.
  5. Meaningful icons have a text alternative, icon-only buttons have accessible names, and the tile icon contrast is at least 3:1 on every theme.
- **Recommended model:** Sonnet 5.5. **Estimate:** 4 h. Replaces the icon part of T10 (about 2.5 h of it).
- **Implementation note (CAR-76, 2026-10-22): where the build differs from the plan above, and why.**
  - **Two files, not one.** A module shared by the entry chunk and a lazy chunk is built into the entry chunk whole (measured: all 27 icons landed in the entry with a single `icons.jsx`). `icons.jsx` therefore holds the `Icon` wrapper and the four entry icons (ArrowRight, Check, ChevronDown, Sparkle), and `iconsMore.jsx` holds the other 23 for route chunks and the lazy Landing sections. Both carry the licence notices. A test keeps `icons.jsx` at those four.
  - **The Landing split was pulled forward from D6** (criterion 1 there), because the Landing feature icons could not load lazily otherwise: everything below the hero is now the `LandingSections` chunk behind a screen-tall placeholder.
  - **Entry cost, measured:** `icons.jsx` is 0.52 kB gzip (wrapper 0.29, four icons 0.23) against the 0.35 kB estimate, which covered three icons. With the Landing split the entry chunk is 130.89 kB gzip, 0.92 kB smaller than before (131.81).
  - **Also changed:** the house icon on Log In, Sign Up and Reset is the logo mark; the Advanced options caret (a text glyph in CSS) is drawn with borders; the Car Profile spec icons moved inside each `<dt>` (aria-hidden) because an SVG cannot come from CSS `content`.
- **Retest:** Landing, Dashboard, Car Profile, Trip Planner, AI Advisor, Auth, Reset and Onboarding tests (some match text such as "Default car" with its check mark), axe on all screens, bundle guard.

### D3 (CAR-77). Desktop header v2
- **Summary:** sticky header with scroll shadow, active-link bar, wordmark and a divider in the My Car menu. Log Out stays a button.
- **Acceptance criteria:**
  1. The header is sticky at every width, the Landing anchors are not hidden under it (`scroll-margin-top`), and it is 72 px tall at 861 px and wider (64 px below, unchanged).
  2. The shadow appears after 8 px of scroll and not at the top, causes no layout shift, and has no transition under reduced motion.
  3. The active link has a 2 px bar, at least 3:1 against the header on every brand theme (a test over all themes).
  4. There is no account menu: Log Out stays a plain button (a menu is only worth building with 3 or more items), and the email is never shown.
  5. USD | LBP stays inline on price pages and in the mobile panel; the CAR-74 mobile menu behaves exactly as before.
  6. Axe finds no violations on any screen at 1280 and 390 px.
- **Recommended model:** Opus 5.5 (the header is on every page). **Estimate:** 6 h.
- **Retest:** `SiteNav.test.jsx`, `headerCss.test.js`, `App.test.jsx`, `App.authRedirect.test.jsx` (the Log Out flow), `currencyToggle.integration.test.jsx`, layout shift on Dashboard and Landing, mobile menu walk-through.

### D4 (CAR-78). Dashboard data layer
- **Summary:** one `fuel_logs` read for the page and a pure helper that derives each car's snapshot. No UI.
- **Acceptance criteria:**
  1. The Dashboard sends one `fuel_logs` query (union columns, scoped to the user) instead of two; total requests go from 6 to 5.
  2. `lib/carSnapshot.js` returns odometer, real economy, last fill-up and next service for a car, using only existing helpers, with unit tests for: no data, one reading, partial fills, an unrealistic km/L (ignored as today), and a car with no fuel logs.
  3. A failed `fuel_logs` request produces one error state with a retry; the maintenance, month and DIY data are unaffected.
  4. No new table, column, policy or backend call; the queries are still filtered by the signed-in user.
- **Recommended model:** Opus 5.5 (decided). **Estimate:** 4 h.
- **Retest:** `DashboardPage.test.jsx` (its fuel_logs mocks change), `activeCarPages.test.jsx`, `protectedRoutesNoData.test.jsx`.

### D5 (CAR-79). Dashboard v2 UI
- **Summary:** the §3.4 layout: active-car hero with four tiles and quick actions, car switcher chips, and three equal-width cards below.
- **Acceptance criteria:**
  1. The hero shows the active car in its brand theme with the Default car badge, display-only formatted specs (RWD, Automatic, unit-tested) and a primary "Plan a trip" action; the other cars are chips, never full cards.
  2. The four tiles (odometer, real economy, last fill-up, next service) show real values, and each has the skeleton, empty and error state from §3.4; all numbers are plain text and money goes through `<Price>`.
  3. With 1 car there is no switcher; with 2 or more the chips are buttons with `aria-pressed`, keyboard-operable, and choosing one changes the active car and the theme.
  4. 0 cars shows one "Add your first car" card; with 4 cars the first useful number is above the fold at 390 px.
  5. Quick actions link to the existing pages with 44 px targets; the three lower cards share one width.
  6. Layout shift is under 0.1 at 390, 320 and 1280 px for 0, 1 and 4 cars, and axe finds no violations.
- **Recommended model:** Opus 5.5. **Estimate:** 9 h. Replaces T11 (5 h).
- **Retest:** `DashboardPage.test.jsx` (largely rewritten), `activeCarPages.test.jsx`, `ActiveCarContext.test.jsx`, the CAR-74 loading-skeleton tests, layout shift, axe.

### D6 (CAR-80). Landing refresh
- **Summary:** Landing with D2 icons, a static "Example" preview, bento CSS, a fixed headline and a lazy chunk for everything below the hero. Replaces T13.
- **Acceptance criteria:**
  1. Everything below the hero loads as a lazy chunk with a fixed-height placeholder; the entry chunk grows by at most 0.2 kB gzip net, and the bundle guard passes.
  2. A static preview card labelled "Example" (`aria-label="Example of the CarSage dashboard"`) shows hard-coded values; no live data, no telemetry wording, no animated numbers.
  3. The visible headline is the H1 with no orphan word, and the wordmark is text beside the logo.
  4. `#features` and `#how-it-works` links still scroll to their sections after the lazy chunk loads (a test).
  5. Cards lift at most 2 px on hover and focus, with no movement under reduced motion; layout shift at most 0.05.
- **Recommended model:** Sonnet 5.5. **Estimate:** 6 h. Replaces T13 (5 h).
- **Retest:** `LandingPage.test.jsx`, `Logo.test.jsx`, `SiteNav.test.jsx` (anchors), bundle guard, layout shift, axe.

### D7 (CAR-81). Status colours that do not depend on the brand (required)
- **Summary:** fixed semantic colours for Overdue, Due soon and OK.
- **Acceptance criteria:**
  1. Overdue is red, Due soon amber and OK green, from fixed tokens that do not use `--color-accent` or `--color-primary`.
  2. Badge text is at least 4.5:1 on its badge on every brand theme (a test over all themes).
  3. The statuses differ by icon and word as well as colour.
  4. The Dashboard list, the Maintenance page and the Advisor recommendation chips (T16) use the same tokens.
- **Recommended model:** Sonnet 5.5. **Estimate:** 2.5 h.
- **Retest:** `MaintenancePage.test.jsx`, `DashboardPage.test.jsx`, `themeContrast.test.js`.

### D8 (CAR-82). Favicon weight and unused assets
- **Summary:** shrink the favicon and remove files that are not shipped.
- **Acceptance criteria:**
  1. `public/favicon.svg` is 5 kB or less and looks the same at 16, 32 and 48 px.
  2. Each unused file (`Gemini_Generated_Image_*.svg`, `logo-svg.svg`, `background-texture-svg.svg`, and `favicon-icon.svg` if nothing uses it) is removed only after proof that no import, `index.html`, CSS or script references it; a build before and after is identical apart from the favicon.
  3. `index.html` and the font and bundle guards are unchanged and pass.
- **Recommended model:** Haiku 5.5. **Estimate:** 1.5 h. A file is deleted only after proof that nothing references it (decided).
- **Retest:** build, `seoFiles.test.js`.

### D9. Optional hand-drawn underline (DROPPED, decided)
- **Dropped.** Any underline is plain CSS inside D6. The text below is kept only as the record of what was considered.
- **Summary:** Componentry `annotated-text` (MIT) on "one place", loaded after first paint.
- **Acceptance criteria:**
  1. The component loads through `import()` after first paint; entry grows at most 0.1 kB gzip and the lazy chunk is at most 3 kB gzip.
  2. The MIT notice sits in the file header; `clsx` replaces `cn()` so `tailwind-merge` (about 7 kB gzip) is not added.
  3. Plain text with a CSS underline shows before and without JavaScript for the effect; reduced motion shows the finished mark with no drawing.
- **Recommended model:** Sonnet 5.5. **Estimate:** 2 h.
- **Retest:** `LandingPage.test.jsx`, bundle guard.

### D10 (CAR-83). Category icons for Expenses and Maintenance (droppable)
- **Summary:** an icon for each of the 9 expense categories and 5 maintenance presets, for faster scanning.
- **Acceptance criteria:**
  1. Each category and preset has a Lucide icon next to its label, `aria-hidden`, and the label stays the accessible name.
  2. The icons add at most 1.2 kB gzip to the Expenses and Maintenance chunks and nothing to the entry.
  3. The photo notes, upload and form behaviour are untouched.
- **Recommended model:** Haiku 5.5. **Estimate:** 3 h. Touches `ExpensesPage.jsx`, which is photo-adjacent; icon markup only is allowed (decided).
- **Retest:** `ExpensesPage.test.jsx`, `MaintenancePage.test.jsx`, `RecordPhotos.test.jsx`.

### Order, dependencies and what can be dropped

| Ticket | Hours | Needs first | Can be dropped without hurting the rest? |
|---|---|---|---|
| D1 Motion | 3 | none | Yes, but D3 to D6 lose their entrance and hover polish |
| D2 Icons | 4 | none | No: D5 and D6 use the icons |
| D7 Status colours | 2.5 | none | No: required (decided) |
| D4 Dashboard data | 4 | none | No: D5 needs it |
| D3 Header v2 | 6 | D1, D2 | Yes, the CAR-74 header stays as it is |
| D5 Dashboard UI | 9 | D2, D4 (D1 optional) | No: it is the main user-visible goal |
| D6 Landing | 6 | D1, D2 | Yes |
| D8 Favicon and assets | 1.5 | none | Yes |
| D9 Underline | 2 | D6 | Dropped (decided) |
| D10 Category icons | 3 | D2 | Yes |

- **Core (D1, D2, D4, D5, D7):** 22.5 h. With D3: 28.5 h. With D6: 34.5 h. Everything except the dropped D9: 39 h.
- **Net effect on the pending plan:** D2 takes about 2.5 h out of T10, D5 replaces T11 (5 h), D6 replaces T13 (5 h).
- **Suggested order:** D2, D1, D7, D8, D4, D5, D3, D6, then D10 if wanted.

## 5. Bundle and CSS budget

- **Today:** entry 463.29 kB min and 131.81 kB gzip (budget 470 and 134); initial JS 512.29 and 149.16 gzip (budget 516 and 150, the ticket limit). **Only 0.84 kB of gzip room is left in the initial budget.** CSS is 64.7 kB min and 10.9 kB gzip, with no guard.
- **Planned entry impact (gzip, estimates except where measured):**

| Item | Change |
|---|---|
| D2 entry icons (measured) | +0.35 kB |
| D3 scroll-shadow observer | +0.15 kB |
| D6 below-the-fold Landing moves to a lazy chunk (63% of the file's source) | about -0.8 kB |
| D6 lazy-loading glue and the Example card | +0.3 kB |
| **Net** | **about +0.15 kB, inside the 0.84 kB** |

- **If the estimate is wrong,** the lever is D6's split (move more of Landing out), not raising the 150 kB initial limit.
- **Route chunks** (limit 60 kB gzip each): the Dashboard is 3.7 kB today and D5 plus its icons should land at about 8 to 10 kB.
- **CSS (decided):** budget 72 kB min and 13 kB gzip, measured in every ticket and enforced by `scripts/check-bundle.mjs` from CAR-75. D1 to D6 add roughly 3 to 4 kB minified. Raising it further needs your OK.

## 6. Decisions (answered 2026-10-22)

See the "Decisions" section at the top. In short: photo-adjacent icon markup is allowed, no account menu, D9 dropped, assets deleted only after proof, CSS budget 72 kB min and 13 kB gzip measured per ticket, no Aceternity source and no animation library, D7 required, D4 on Opus.

## Appendix: how things were measured

- **Sizes:** esbuild minified output, Node zlib gzip level 9, in kB of 1000 bytes (the unit of `scripts/check-bundle.mjs`). Libraries were measured on their own in a scratch folder outside the repo (nothing was added to `package.json`).
- **Library views:** `npx shadcn view` (`@aceternity/...` through the registry that `components.json` listed at the time, Componentry by its registry URL), read-only, output outside the repo. Licences came from the publishers' own pages and the Componentry GitHub repo.
- **Icons:** the Lucide 1.61.0 SVG files and `LICENSE`, converted to JSX the way `icons.jsx` would hold them.
- **Fonts:** glyph coverage read from the two WOFF2 files with `fontkit`.
- **Layout shift and screenshots:** Playwright, Chromium, production build or dev server as noted.
