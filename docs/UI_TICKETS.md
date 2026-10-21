# CarSage UI Tickets

These tickets are ready to copy into Jira (project CAR). The findings behind them are in `docs/UI_AUDIT.md`, and the IDs in brackets (X1, S4 and so on) point there.

**Rules for every ticket:**
- Presentation only. Do not change logic, data fetching, camera or photo code, usage limits, Privacy and Terms wording, the database or `.env`.
- One ticket per commit.
- Run the full frontend suite before each commit.
- Show the result at 1280 px and 390 px before committing.
- Keep WCAG AA, keyboard focus and `prefers-reduced-motion`.
- **Bundle budget:** initial JS never grows. Library code lives only in route chunks.

**Bundle costs:**
- **"Measured":** isolated builds with React external (see the audit).
- **"Estimate":** source size of a hand-written component, minified and gzipped.

## Shortlist: the components the whole app uses

Eight in total. Anything not on this list is plain CSS.

| # | Component | Source | Cost (gzip) | Used on |
|---|---|---|---|---|
| 1 | `Button` (primary, secondary, ghost, danger; `loading` and `success` states) | In-house, built on the state pattern of Aceternity `stateful-button` but CSS-only. The Aceternity original wraps `onClick`, hard-codes `bg-green-500` and needs `motion`. | ~0.6 kB est. | every screen |
| 2 | `Card` + `BentoGrid` | `Card` in-house. `BentoGrid` is Aceternity `bento-grid` (free, no motion, no real dependency), restyled to brand tokens, with the hover shift disabled under reduced motion. | ~0.5 kB est. | Landing, Dashboard, Car Profile, Trip results |
| 3 | `Field` (label, control, hint, error) | In-house. Aceternity `input` rejected: blue `#3b82f6` hover glow, needs `motion`. | ~0.4 kB est. | Auth, Onboarding, Fuel, Expenses, Maintenance, Trip |
| 4 | `Skeleton` | In-house, extends the existing `.skeleton-bar` | ~0.2 kB est. | all data screens |
| 5 | `EmptyState` (icon, title, one line, one action) | In-house. The Aceternity empty-state blocks are Pro-only. | ~0.3 kB est. | Dashboard, Maintenance, Expenses, Trip, Advisor, 404 |
| 6 | `StatusMessage` (success, error, info; `role="status"` or `"alert"`) | In-house. No toast library. | ~0.3 kB est. | every form |
| 7 | `Icon` (single-colour line icons replacing emoji) | `lucide-react` 1.61 (ISC), named imports. **It is a third package, outside Aceternity and Componentry, so it needs your OK.** Zero-dependency alternative: copy the ~20 SVG paths into one `icons.jsx` (lucide's ISC licence allows it). | 2.9 kB for 10 icons, measured | Landing, Dashboard, Car Profile, Fuel, Expenses |
| 8 | `SiteHeader` with mobile menu | In-house. Extends the existing accessible `NavMenu` (arrow keys, Escape). Aceternity `resizable-navbar` rejected: its toggle is an SVG with `onClick`, not a button. | ~0.5 kB est. | every screen |

**Total UI library code: ~0 kB from the two registries' runtime** (`bento-grid` is copied source), plus 2.9 kB if `lucide-react` is approved. **`motion` is not needed.**

---

## Foundations

### F1. Design tokens and Tailwind theme mapped to the brand
- **Summary:** One token source for colour, type, spacing, radius and shadow, exposed both as CSS variables (for `index.css`) and as Tailwind v4 `@theme` values (for components). Self-hosted Space Grotesk (headings) and Manrope (body). [X1, X10]
- **Acceptance criteria:**
  1. `src/tailwind.css` `@theme` maps `primary`, `accent`, `cream`, `graphite`, `muted`, `danger`, `border` and the radii to the existing `--color-*` variables. `bg-primary` therefore follows the car theme exactly as `.btn-primary` does today.
  2. Headings compute to `Space Grotesk` and body text to `Manrope` on every screen. Fonts are served from the app's own origin, not `fonts.googleapis.com`: a Google Fonts request would add a third party that the Privacy page does not list. Use `font-display: swap`, at most 2 woff2 files, ≤ 80 kB total, and preload the body font.
  3. A new `--color-accent-ink` token exists for each car theme, so any accent-coloured *text* is ≥ 4.5:1 on white and on cream. The existing `--color-accent` stays for fills.
  4. The watermark opacity is reduced (or the watermark is hidden) behind long-text pages and form cards, so axe can compute contrast and reports no "incomplete" contrast nodes on Privacy, Terms or Reset.
  5. Visual diff: before and after screenshots at both widths, with no layout shift other than the font change.
- **Fix:** plain CSS plus Tailwind `@theme`. Fonts come from `@fontsource-variable/space-grotesk` and `@fontsource-variable/manrope` (OFL), or the woff2 files copied into `public/fonts`.
- **Bundle:** JS +0. CSS +~1 kB. Fonts ≤ 80 kB, cached.
- **Could break:** `index.html.test.js` (if `<link rel="preload">` is added to `index.html`), `noEmDash.test.js` (scans `index.html`). Text-width changes may wrap headings differently.
- **Model:** Opus 5.5, because every later ticket inherits these token decisions.
- **Estimate:** 4 h

### F2. Brand theme safety (contrast and first paint)
- **Summary:** Keep per-car brand colours but stop them causing contrast failures. Stop the green-to-graphite flash. [X2, X3]
- **Acceptance criteria:**
  1. Every accent-coloured text (Recharts legend, `.advisor-fix-feedback__change`, eyebrows) uses `--color-accent-ink`. For all 8 brand themes, contrast is measured ≥ 4.5:1 in a unit test that loops over `carBrandThemes.js`.
  2. The Recharts legend on Expenses and Fuel Log renders its text in `--color-text`, with the colour shown only in the swatch (via the Legend `formatter`).
  3. Car Onboarding (`/cars/new`) always renders in `DEFAULT_THEME`.
  4. **Needs your decision:** whether the theme should follow the car selected on the page (Fuel Log, Maintenance, Expenses, Advisor) instead of the default car. That changes `ActiveCarContext` behaviour, so it is not done without approval.
  5. With reduced motion on, the theme change is instant. Otherwise it is a 150 ms colour transition, not a jump.
- **Fix:** plain CSS, a Recharts `formatter` prop, and one theme override on the onboarding route.
- **Bundle:** +0.
- **Could break:** `carBrandThemes` tests, `ActiveCarContext` tests, `ExpensesPage.test.jsx` (legend text), `CarOnboardingPage.test.jsx`.
- **Model:** Opus 5.5, because it touches theming rules across screens.
- **Estimate:** 4 h

### F3. Route-level code splitting
- **Summary:** Lazy-load each screen so a visitor downloads only the screen they open. Recharts goes only to Fuel Log and Expenses. [Performance baseline]
- **Acceptance criteria:**
  1. Every page in `App.jsx` except Landing and Auth is loaded with `React.lazy`, inside one `Suspense` whose fallback is the shared `Skeleton` page shell. There is no blank flash.
  2. The build shows a separate chunk per lazy route, and `recharts` appears only in the chunks for Fuel Log and Expenses (or a shared chunk they alone import).
  3. The Landing entry chunk is ≤ 480 kB min / ≤ 150 kB gzip (today 1,053 / 305). A `scripts/check-bundle.mjs` (or a vitest test over `dist/`) fails if the entry chunk grows past the recorded budget.
  4. All 55 test files still pass. Tests that render pages directly are unaffected; `App.test.jsx` awaits lazy routes with `findBy*`.
  5. On a throttled "Slow 4G" profile, Landing is interactive faster than before (record both numbers in the commit message).
- **Fix:** plain React (`lazy`, `Suspense`). No library.
- **Bundle:** entry −50% or more (estimate from the measured recharts 545 kB min).
- **Could break:** `App.test.jsx` (synchronous route assertions), `currencyToggle.integration.test.jsx`.
- **Model:** Opus 5.5, because it is an app-wide structural change with test fallout.
- **Estimate:** 3 h

### F4. Shared components: Button, Card, BentoGrid, Field, Skeleton, EmptyState, StatusMessage, Icon
- **Summary:** Build shortlist items 1 to 7 in `src/components/ui/` as `.jsx`, styled with brand tokens, then migrate **no** screens yet. Screens adopt them in their own tickets.
- **Acceptance criteria:**
  1. Each component has a `.test.jsx` covering its states. `Button` keeps the native `type` and `disabled`, sets `aria-busy` while loading, and announces "Saved" through a polite live region on success.
  2. Every interactive part shows a 2 px focus ring that is visible on every theme (contrast ≥ 3:1 against its background).
  3. Under `prefers-reduced-motion: reduce`, the spinner, shimmer and hover shift are static. A test asserts the CSS rule exists.
  4. `BentoGrid` comes from `npx shadcn@latest add @aceternity/bento-grid` and is converted to JSX. The commit message reports the bundle before and after. No `@tabler/icons-react` gets installed (the component does not import it).
  5. A hidden `/__ui` route is **not** added. Components are shown to you through screenshots of a test render.
- **Fix:** in-house plus Aceternity `bento-grid`, plus `lucide-react` only if approved.
- **Bundle:** ~2.3 kB gzip est., plus 2.9 kB measured for icons. Nothing lands in the entry chunk until a screen uses it.
- **Could break:** nothing existing (new files only).
- **Model:** Fable 5.1, because it is the one ticket whose visual and API choices every screen ticket inherits.
- **Estimate:** 8 h

### F5. Header and My Car menu: mobile disclosure
- **Summary:** At ≤ 860 px, collapse the links, currency switch and Log Out into a "Menu" button. The header becomes one 56 to 64 px row. [X4, X7]
- **Acceptance criteria:**
  1. At 390 px the header is ≤ 64 px tall, logged in and out.
  2. The Menu button is a real `<button>` with `aria-expanded` and `aria-controls`. Escape closes it and returns focus to it, and focus moves into the panel on open.
  3. The existing "My Car" submenu keeps its keyboard behaviour (arrow keys, Home, End, Escape) inside the mobile panel.
  4. Every header and footer link is ≥ 44 px tall on touch and ≥ 24 px on desktop.
  5. The logo link has the accessible name "CarSage home".
- **Fix:** in-house (shortlist #8) and plain CSS.
- **Bundle:** ~0.5 kB est.
- **Could break:** `SiteNav.test.jsx` (31 queries, 4 by selector), `currencyToggle.integration.test.jsx`.
- **Model:** Sonnet 5.5, because it follows a well-known pattern already partly in the codebase.
- **Estimate:** 4 h

### F6. Global accessibility CSS: motion, focus, targets
- **Summary:** Close the reduced-motion gaps and make hidden file inputs show focus on their visible label. [X5, X7]
- **Acceptance criteria:**
  1. `cold-start-spin` and `advisor-typing-bounce` stop under `prefers-reduced-motion: reduce`. A Playwright check records no running CSS animations with reduce on.
  2. When a visually hidden file input (`.sr-only` in RecordPhotos, PhotoScan, OdometerScanButton, PendingPhotos, CarProfile, CarOnboarding, FuelLog) has focus, its label shows the focus ring (`:has(:focus-visible)` or a sibling selector). The Tab walk shows no `NO-RING` entries.
  3. `.fuel-log-table-wrap` gets `tabindex="0"`, `role="region"` and an `aria-label`, which clears axe `scrollable-region-focusable`.
  4. The "Forgot password?", "Change" and footer links reach a 24 px minimum target.
- **Fix:** plain CSS plus 3 attributes.
- **Bundle:** +0.
- **Could break:** `FuelLogPage.test.jsx` (table queries), `RecordPhotos.test.jsx`.
- **Model:** Sonnet 5.5, a small but cross-file change.
- **Estimate:** 2 h

### F7. Per-route page titles
- **Summary:** Each route sets `document.title` ("Fuel Log · CarSage"). [X8]
- **Acceptance criteria:**
  1. All 13 screens have distinct titles.
  2. The title updates on client-side navigation.
  3. No em dash appears in any title (`noEmDash` rule).
- **Fix:** a 10-line `useDocumentTitle` hook. No library.
- **Bundle:** +0.1 kB.
- **Could break:** none expected. `index.html.test.js` checks only the static title.
- **Model:** Haiku 5.5, mechanical and well specified.
- **Estimate:** 1 h

---

## Screens

### S1. Landing
- **Summary:** Match the Stitch landing style: line icons, a readable wordmark and lifted cards, plus an optional static product preview. [Audit §1]
- **Acceptance criteria:**
  1. Feature, How-it-works and trust rows use `Icon` and `BentoGrid`/`Card`, with no emoji.
  2. The header shows the "CarSage" wordmark as text next to the mark, readable at 1280 px and 390 px.
  3. The visible headline "Everything about your car, in one place" is the page's H1. The `.sr-only` H1 is removed.
  4. Cards lift on hover and focus by ≤ 2 px. There is no movement under reduced motion.
  5. **Optional, needs your OK:** a static, clearly illustrative preview card under the CTAs (car name, monthly fuel, next service). It uses no live data and shows no telemetry.
- **Fix:** shortlist 2 and 7, plain CSS.
- **Bundle:** +0 entry if Landing stays eager and icons are tree-shaken (~1 kB).
- **Could break:** `LandingPage.test.jsx` (heading queries), `Logo.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 4 h

### S2. Sign Up / Log In
- **Summary:** Polish the auth card and stop showing the login form to a signed-in user. [Audit §2]
- **Acceptance criteria:**
  1. A signed-in user who opens `/login` or `/signup` is redirected to `/dashboard`. **This is routing behaviour, so it needs your OK.**
  2. The submit button uses `Button` `loading` while the request runs. Errors use `StatusMessage` `role="alert"`.
  3. The card icon is a neutral CarSage mark, not a house.
  4. Inputs use `Field`, and the 390 px layout has no horizontal scroll.
- **Fix:** shortlist 1, 3 and 6.
- **Bundle:** +0 (shared components only).
- **Could break:** `AuthPage.test.jsx` (29 queries), `App.test.jsx` (route test for `/login`).
- **Model:** Sonnet 5.5
- **Estimate:** 3 h

### S3. Reset password
- **Summary:** Remove the dead end on an expired link. [Audit §3]
- **Acceptance criteria:**
  1. The expired or invalid state shows an `EmptyState` with a primary `Button` "Back to Log In" that links to `/login` (the existing forgot-password flow lives there).
  2. The success state uses `StatusMessage` `role="status"`.
  3. Copy stays the same apart from the button label.
- **Fix:** shortlist 1, 5 and 6.
- **Bundle:** +0.
- **Could break:** `ResetPasswordPage.test.jsx`.
- **Model:** Haiku 5.5
- **Estimate:** 1 h

### S4. Dashboard
- **Summary:** Give the default car a hero and make the page lead with one clear action. [Audit §4]
- **Acceptance criteria:**
  1. The default car renders as a larger hero `Card` (name, plate, 3 to 4 key specs, photo if any). Other cars render as compact cards below it.
  2. One primary action per page ("Plan a trip" or "Add your first car" when there are no cars). "Add Another Car" becomes secondary.
  3. Spec values are formatted for display only: drivetrain uppercased ("RWD"), and transmission "a" or "m" shown as "Automatic" or "Manual". Stored values are unchanged, and a unit test covers the formatter.
  4. "All cars, this month" and "Maintenance" empty states use `EmptyState` with one button each.
  5. Numbers (60% and the cost totals) render as plain text in the same type scale as other stats, with no count-up animation.
- **Fix:** shortlist 2, 4 and 5.
- **Bundle:** +0 (shared).
- **Could break:** `DashboardPage.test.jsx` (23 queries, 3 by selector).
- **Model:** Sonnet 5.5
- **Estimate:** 5 h

### S5. Car Onboarding
- **Summary:** Shorten the perceived form and make it brand-neutral. [Audit §5]
- **Acceptance criteria:**
  1. At ≥ 860 px the fields lay out in two columns. At 390 px they stay in one column with grouped sections (Basics, Performance, Identification, Photo) as `Card`s.
  2. The page always uses the CarSage default theme (from F2).
  3. The photo picker label shows a focus ring when its hidden input is focused (from F6).
  4. The primary "Add Car" `Button` shows `loading` while saving. The existing save logic is untouched.
  5. Drivetrain stays a text field. **Turning it into a select is flagged, not done.**
- **Fix:** shortlist 1, 2 and 3, plain CSS grid.
- **Bundle:** +0.
- **Could break:** `CarOnboardingPage.test.jsx` (51 queries).
- **Model:** Sonnet 5.5
- **Estimate:** 4 h

### S6. Car Profile
- **Summary:** Fix the definition-list semantics and tighten the spec layout. [Audit §6]
- **Acceptance criteria:**
  1. Axe reports 0 `definition-list` and `dlitem` violations: each `dt`/`dd` pair is wrapped in a single `div` directly inside the `dl`.
  2. Specs use line `Icon`s and a two-column grid at ≥ 860 px. Empty values read "Not set".
  3. The page order is H1 (car name) first, then the car switcher.
  4. "Delete Car" moves into a separate, labelled "Danger zone" card with a `danger` `Button`. The existing confirm flow is unchanged.
- **Fix:** shortlist 1, 2 and 7.
- **Bundle:** +0 (icons shared).
- **Could break:** `CarProfilePage.test.jsx` (48 queries).
- **Model:** Sonnet 5.5
- **Estimate:** 4 h

### S7. Trip Planner
- **Summary:** Use the empty right column for an estimate placeholder, and give the route inputs one rail. [Audit §7]
- **Acceptance criteria:**
  1. At ≥ 860 px the layout is two columns: the form, and a results `Card`. Before a trip is planned, the results card shows an `EmptyState` ("Your fuel cost and travel time will appear here").
  2. While planning, the results card shows a `Skeleton`, and the Plan Trip `Button` is in `loading`.
  3. The origin and destination markers share one vertical rail in brand colours, not cyan and black.
  4. Result numbers are static text with no animation.
- **Fix:** shortlist 1, 2, 4 and 5.
- **Bundle:** +0.
- **Could break:** `TripPlannerPage.test.jsx` (77 queries, 13 by selector), so this is the highest test risk.
- **Model:** Sonnet 5.5
- **Estimate:** 5 h

### S8. AI Advisor
- **Summary:** Make the safety recommendation the most visible element and dock the composer. [Audit §8]
- **Acceptance criteria:**
  1. The recommendation shows as a labelled banner at the top of each reply: an icon plus "See a mechanic" or "Safe to check yourself" in at least 16 px. Badge colours pass 4.5:1 on every theme.
  2. The conversation scrolls inside a panel, and the composer stays docked at the bottom of the viewport at 390 px and 1280 px. On narrow screens the docked area stays above the keyboard.
  3. The three photo notes are grouped under one "About photo scanning" block with the **unchanged** wording. "Scan a photo" uses a secondary `Button`, so it no longer looks disabled.
  4. The typing indicator respects reduced motion (from F6).
  5. **Optional, needs your OK:** 3 to 4 starter chips that only fill the input without sending.
- **Fix:** shortlist 1, 2, 6 and 7, plain CSS.
- **Bundle:** +0.
- **Could break:** `AIAdvisorPage.test.jsx` (54 queries), `advisorPhoto.test.js` (only if text nodes move).
- **Model:** Opus 5.5, because it touches safety advice presentation where hierarchy matters.
- **Estimate:** 6 h

### S9. Fuel Log
- **Summary:** Shorten the phone form and make the history table usable at 390 px. [Audit §9]
- **Acceptance criteria:**
  1. At ≤ 520 px, fill-ups render as stacked rows (date, litres, cost, LBP) instead of a 962 px table. At ≥ 520 px the table stays. Both views have the same data and order.
  2. The two scan cards share one privacy notice block with the **unchanged** wording, shown once.
  3. The duplicate headings are merged into one "Fill-ups for {car}" with the chart and table under it.
  4. The table wrapper is focusable (from F6), and the axe run is clean.
- **Fix:** plain CSS (`@container` or media query), shortlist 2 and 6.
- **Bundle:** +0 (Recharts already in this chunk after F3).
- **Could break:** `FuelLogPage.test.jsx` (66 queries, table-based), `fuelLog.test.js` (logic, should not change).
- **Model:** Sonnet 5.5
- **Estimate:** 5 h

### S10. Maintenance
- **Summary:** Fix the stray odometer note and use the full column. [Audit §10]
- **Acceptance criteria:**
  1. The "No odometer reading yet" note sits under the car selector, aligned with it.
  2. At ≥ 860 px, "Add an item" and the item list sit side by side. At 390 px they stack.
  3. "+ Custom item" is a solid secondary chip, not dashed.
  4. Due-soon and overdue badges pass 4.5:1 on every theme.
- **Fix:** plain CSS, shortlist 2.
- **Bundle:** +0.
- **Could break:** `MaintenancePage.test.jsx` (49 queries).
- **Model:** Haiku 5.5
- **Estimate:** 2 h

### S11. Expenses
- **Summary:** Bring the form and chart in line with Fuel Log. [Audit §11]
- **Acceptance criteria:**
  1. The legend text is graphite, with colour only in the swatches (from F2).
  2. "Add a photo" is a secondary `Button` with the same look as the Fuel Log scan buttons.
  3. The month empty state uses `EmptyState` with an "Add an expense" action that focuses the form.
  4. Amounts use the existing currency helper with no change.
- **Fix:** shortlist 1 and 5.
- **Bundle:** +0.
- **Could break:** `ExpensesPage.test.jsx` (31 queries, 6 by selector), `RecordPhotos.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 3 h

### S12. Privacy and Terms
- **Summary:** Make the long text easier to read **without changing a word**. [Audit §12]
- **Acceptance criteria:**
  1. The text column is centred, ≤ 70 characters wide, on a plain cream background with no watermark behind it.
  2. A table of contents is generated from the existing H2s, with anchors for each.
  3. `LegalPages.test.jsx` still passes. A test asserts that the rendered text is byte-identical to before (snapshot of `innerText`).
- **Fix:** plain CSS plus a TOC built from the headings.
- **Bundle:** +0.1 kB.
- **Could break:** `LegalPages.test.jsx` (17 queries, 6 by selector).
- **Model:** Haiku 5.5
- **Estimate:** 2 h

### S13. 404
- **Summary:** Give lost users a way back. [Audit §13]
- **Acceptance criteria:**
  1. The page shows an `EmptyState` with an icon, "Page not found", and a primary `Button`: "Go to Dashboard" when signed in, "Back to Home" when signed out.
  2. The title is "Page not found · CarSage" (from F7).
  3. A focusable control appears within the first 3 Tab stops after the header.
- **Fix:** shortlist 1 and 5.
- **Bundle:** +0.
- **Could break:** `App.test.jsx` (not-found route), `NotFoundPage` tests if any are added.
- **Model:** Haiku 5.5
- **Estimate:** 1 h

---

## Suggested order and total

1. F3 (split first, so later bundle reports are meaningful)
2. F1
3. F2
4. F6
5. F7
6. F4
7. F5
8. Then the screens by severity: S8, S9, S6, S3, S13, S2, S4, S7, S11, S5, S10, S1, S12

**Total estimate:** 26 h foundations + 45 h screens = **71 h**.
