# CarSage UI Tickets

These tickets are ready to copy into Jira (project CAR). The findings behind them are in `docs/UI_AUDIT.md`, and the IDs in brackets (X1, §4 and so on) point there. This version applies the decisions of 2026-10-21 and is ordered by value and risk.

**Rules for every ticket:**
- Presentation only, except T4 (an approved behaviour fix) and T5 (an approved routing change).
- **Never touch:** logic, data fetching, camera or photo code, usage limits, Privacy and Terms wording, the database or `.env`.
- One ticket per commit.
- Run the full frontend suite at default settings before each commit, and never push on a red run.
- Show the result at 1280 px and 390 px before committing.
- Keep WCAG AA, keyboard focus and `prefers-reduced-motion`.

**Bundle rules:**
- Initial JS never grows. Today it is 1,053.32 kB min / 304.70 kB gzip in one chunk.
- After T1, the Landing entry chunk budget is ≤ 480 kB min / ≤ 150 kB gzip, then locked at the measured value plus 2%.
- Route chunks are ≤ 60 kB gzip, not counting the shared recharts chunk.

**Libraries:**
- No Aceternity or Componentry component is planned. A ticket may add one only after it proves a need that plain CSS can't meet, and states the bundle cost and licence.
- No `lucide-react`. Icons are copied SVGs in one file.
- `motion` is not used.

## Decisions applied (2026-10-21)

| Topic | Decision | Where |
|---|---|---|
| Icons | No `lucide-react`. Copy the needed SVGs into `src/components/icons.jsx`. | T10 |
| Libraries | `@componentry` line reverted. Bento layouts are plain CSS Grid. | all |
| Fonts | Self-hosted Space Grotesk and Manrope. WOFF2, latin subset, `font-display: swap`, only the main weights preloaded, no Google Fonts request. | T2 |
| Theme | Separate behaviour-fix ticket against CAR-55: "theme follows the car currently shown". | T4 |
| Text gold | Darker gold for text only; `#C9A24B` stays for fills and icons. | T3 |
| Auth redirect | Signed-in users leave `/login` and `/signup`, but **not** `/reset-password`. | T5 |
| Sign Up consent line | Left out. | n/a |
| Landing preview | Yes, static, labelled "Example". | T13 |
| Advisor starter chips | Last, optional. | T21 |

### Fonts: licence and size
- **Licence:**
  - Space Grotesk (Florian Karsten) and Manrope (Mikhail Sharanda) are both under the **SIL Open Font License 1.1**.
  - OFL allows bundling and self-hosting in a web app.
  - Requirement: ship the `OFL.txt` licence text next to the font files, and do not sell the fonts on their own.
- **Recommended: variable latin files.** Two files cover every weight from 300 to 700:

| File | Size |
|---|---|
| `space-grotesk-latin-wght-normal.woff2` | 21.8 kB |
| `manrope-latin-wght-normal.woff2` | 24.3 kB |
| **Total (both preloaded)** | **46.1 kB** |

- **Alternative: static latin files.** Manrope 400 / 600 / 700 and Space Grotesk 600 / 700 are 13.8 + 13.8 + 13.9 + 13.0 + 12.5 = **67.0 kB in 5 files**. Only Manrope 400 and Space Grotesk 700 (27.7 kB) would be preloaded.
- **Source:** sizes measured from the Fontsource 5.3.0 packages. Fontsource is only the download source: the files are copied into the repo, with no npm dependency and no request to `fonts.googleapis.com` or `fonts.gstatic.com`.
- **Why self-hosting matters:** a Google Fonts request would add a third party the Privacy page doesn't list, and that wording must not change.

### Text tokens: contrast-checked values
`--color-accent` stays the fill colour. The new `--color-accent-text` is used only for text. Each value below is ≥ 4.5:1 (the target was 4.6 for rounding margin) on the theme's page background, on white cards, on the input fill `#f1ede4` and on cream `#f5f1e8`.

| Theme | Fill (unchanged) | Fill contrast as text (bg / white / input / cream) | **Text token** | Text token contrast |
|---|---|---|---|---|
| default (gold) | `#c9a24b` | 2.13 / 2.40 / 2.05 / 2.13 | **`#826627`** | 4.80 / 5.41 / 4.63 / 4.80 |
| toyota | `#c8102e` | 5.30 / 5.88 / 5.04 / 5.22 | `#c8102e` (no change) | same |
| honda | `#e4002b` | 4.31 / 4.85 / 4.15 / 4.30 | **`#d50028`** | 4.84 / 5.44 / 4.66 / 4.83 |
| mercedes-benz | `#00a0dc` | 2.63 / 2.97 / 2.55 / 2.64 | **`#00729c`** | 4.78 / 5.40 / 4.62 / 4.79 |
| ferrari | `#ffd900` | 1.22 / 1.38 / 1.18 / 1.23 | **`#7a6800`** | 4.86 / 5.52 / 4.72 / 4.89 |
| bmw | `#6ab2e7` | 2.06 / 2.30 / 1.97 / 2.04 | **`#1b6da9`** | 4.95 / 5.52 / 4.72 / 4.89 |
| audi | `#bb0a30` | 5.86 / 6.56 / 5.62 / 5.82 | `#bb0a30` (no change) | same |
| volkswagen | `#00b1eb` | 2.16 / 2.47 / 2.12 / 2.19 | **`#007297`** | 4.76 / 5.45 / 4.66 / 4.83 |
| tesla | `#e82127` | 4.08 / 4.49 / 3.84 / 3.98 | **`#d2161b`** | 4.93 / 5.43 / 4.64 / 4.81 |

- **How the values were chosen:** each is the same hue and saturation as the fill, darkened in HSL until the minimum across the four surfaces reaches 4.6:1.
- **Dark surfaces:** on primary-coloured backgrounds (Advisor reply bubbles, header), accent text is replaced by white or cream text, not by this token.

---

## Release batches

| Batch | Tickets | Hours | Ships on its own? |
|---|---|---|---|
| **1 (proposed first)** | T1 to T8 | **24.5 h** | Yes. Each ticket is independent and touches no camera, photo or limits code. |
| 2 | T9 to T16 | 37 h | Yes, after T10 (shared components) |
| 3 (photo-adjacent markup, each needs your OK) | T17 to T20 | 9 h | Yes, one at a time |
| Last (optional) | T21 | 2 h | Yes |
| **Total** | 21 tickets | **72.5 h** | |

---

## Batch 1: high value, low coupling (24.5 h)

### T1. Route-level code splitting
- **Why first:** largest win for slow phone connections, zero visual change, and later bundle reports become meaningful.
- **Acceptance criteria:**
  1. Every page in `App.jsx` except Landing and Auth loads with `React.lazy` inside one `Suspense`. The fallback is a page-shaped skeleton (plain CSS, reusing `.skeleton-bar`), never a blank screen.
  2. The build emits one chunk per lazy route. `recharts` appears only in chunks imported by Fuel Log and Expenses.
  3. The Landing entry chunk is ≤ 480 kB min / ≤ 150 kB gzip. A `frontend/scripts/check-bundle.mjs` exits non-zero if the entry chunk exceeds the recorded budget.
  4. `App.test.jsx` still classifies every route correctly. It parses `App.jsx` source for `<ProtectedRoute>` (lines 133-143), so lazy imports must keep that pattern readable. Route render tests use `findBy*`.
  5. The commit message records entry-chunk size before and after, and Landing time-to-interactive on Chrome's "Slow 4G" profile.
- **Fix:** plain React `lazy` / `Suspense`. No library.
- **Bundle:** entry chunk drops by at least 545 kB min / 134 kB gzip (recharts alone, measured).
- **Could break:** `App.test.jsx`, `currencyToggle.integration.test.jsx`.
- **Model:** Opus 5.5, an app-wide structural change with test fallout.
- **Estimate:** 3 h

### T2. Self-hosted brand fonts and type tokens [X1]
- **Acceptance criteria:**
  1. Headings compute to Space Grotesk and body text to Manrope on all 13 screens (checked with `getComputedStyle` in a Playwright run).
  2. `public/fonts/` holds the two variable latin WOFF2 files (46.1 kB total) plus `OFL.txt`. `@font-face` uses `font-display: swap` and `unicode-range` for latin.
  3. `index.html` preloads exactly those two files (`<link rel="preload" as="font" type="font/woff2" crossorigin>`).
  4. The network log on a cold load shows **no** request to any Google domain.
  5. `--font-heading` and `--font-body` tokens are added to `:root` and mapped in `src/tailwind.css` `@theme`, and `--font-family-base` points to the body font with the current system stack as fallback.
- **Fix:** plain CSS plus 2 copied font files. No npm dependency.
- **Bundle:** JS +0. Fonts 46.1 kB, cached after the first visit.
- **Could break:** `index.html.test.js` (it checks `index.html` content), `noEmDash.test.js` (scans `index.html`). Wider glyphs may wrap long headings at 390 px, so check every screen.
- **Model:** Sonnet 5.5, well specified.
- **Estimate:** 3 h

### T3. Text-only accent tokens and chart legend contrast [X3]
- **Acceptance criteria:**
  1. `:root` and every entry in `carBrandThemes.js` define `--color-accent-text` with the values in the table above. `--color-accent` is unchanged and still used for fills and icons.
  2. A unit test loops over `DEFAULT_THEME` and every brand theme and asserts `--color-accent-text` is ≥ 4.5:1 against the theme background, `#ffffff`, `#f1ede4` and `#f5f1e8`.
  3. Every rule that uses `var(--color-accent)` as a text `color` switches to `--color-accent-text`: `.landing-section-header__eyebrow` and `.advisor-fix-feedback__change`. The Advisor reply link sits on a dark bubble, so it uses white or cream instead.
  4. The Recharts legends on Expenses and Fuel Log render label text in `--color-text`, with the series colour only in the swatch (Legend `formatter`).
- **Fix:** plain CSS, one Recharts prop.
- **Bundle:** +0.
- **Could break:**
  - `carBrandThemes.test.js:35` requires every palette to define exactly `DEFAULT_THEME`'s keys. Adding `--color-accent-text` to `DEFAULT_THEME` *and* every brand keeps it green.
  - `ActiveCarContext` already removes all `DEFAULT_THEME` keys on unmount, so the new key is cleaned up for free.
  - `ExpensesPage.test.jsx`, `FuelLogPage.test.jsx`.
- **Model:** Haiku 5.5, mechanical once the values are fixed.
- **Estimate:** 2 h

### T4. Behaviour fix (CAR-55): theme follows the car currently shown [X2]
- **Type:** behaviour fix against CAR-55's criterion "theme follows the car currently shown". It changes `ActiveCarContext` and the initial car selection on five pages, but no data writes and no camera, photo or limits code.
- **Root cause (read from the code):**
  1. **Car shown and theme disagree.** Trip Planner, AI Advisor, Fuel Log, Maintenance and Expenses pre-select `loadedCars[0]` on load (`FuelLogPage.jsx:227`, `TripPlannerPage.jsx:207`, `AIAdvisorPage.jsx:178`, `ExpensesPage.jsx:151`, `MaintenancePage.jsx:267`). They call `setActiveCarId` only when the dropdown changes. The theme meanwhile uses the stored last-reported car (`ActiveCarContext.jsx:97-99`). Car Profile opens the profile's `default_car_id` and reports it on view (`CarProfilePage.jsx:286`). So viewing the Mercedes profile themes every other page graphite while those pages show the Honda. This is "last car reported", not "default car".
  2. **Green-to-graphite flash.** `activeCarId` starts as `null`, and the car list (with makes) is fetched after first paint. The first frame always paints the default green, then switches.
  3. **Relation to the 401 after login: likely the same weak spot, not yet reproduced.**
     - The only theme lookup is the Supabase `cars` select at `ActiveCarContext.jsx:87-91`. Its `error` is discarded (`const { data } = await ...`).
     - If that request gets a 401 (for example, it fires in the window right after sign-in before the new session is used, or with an expired token), `cars` becomes `[]` and the theme silently stays green.
     - The theme then switches later when another auth event creates a new `user` object and re-runs the effect (the effect depends on `user` identity, so every `SIGNED_IN` or `TOKEN_REFRESHED` event refetches).
     - My audit run started from an established session and did not record HTTP status codes, so the 401 itself was not observed.
- **Acceptance criteria:**
  1. **Reproduce first:** log in from a clean profile with the network log open, and record whether the `cars?select=id,make` request returns 401 and when. Put the finding in the commit message.
  2. **Pre-select the active car:** each of the five pages initialises its selection from `activeCarId` when that car is in its list, and falls back to `loadedCars[0]` only otherwise. The theme and the dropdown always show the same car.
  3. **Car Profile stays consistent:** Car Profile keeps reporting the car it shows. `/cars/mine` with no id opens the active car when one exists, else the default car.
  4. **No flash:** the provider stores `{ carId, make }` per user (as today, plus the make). On reload it applies that make's theme in a `useLayoutEffect` before first paint, then reconciles once the fetch returns. A first paint on a themed page shows the final theme.
  5. **The query error is handled:** on error the provider keeps the last stored theme (no fallback to green) and retries once when the session changes. The effect depends on `user?.id`, not the `user` object, so token refreshes don't refetch.
  6. **Unthemed routes:** `UNTHEMED_PATHS` adds `/reset-password` (a recovery session must not theme the reset page) and `/cars/new` (a new car has no brand yet).
  7. **Tests per page:** each of Trip Planner, AI Advisor, Fuel Log, Maintenance, Expenses and Car Profile gets a test proving that "with active car B stored, the page pre-selects B and the provider theme is B's". `ActiveCarContext.test.jsx` covers the no-flash path (theme set before first paint), the 401/error path (stored theme kept), and `user?.id` stability.
- **Fix:** React only (`ActiveCarContext.jsx`, five pages' initial-selection lines). No library.
- **Bundle:** +0.
- **Could break:** `ActiveCarContext.test.jsx`, `providerWiring.test.js`, and the five page tests that assert the first car is pre-selected.
- **Model:** Opus 5.5, cross-page state with a race condition and per-page tests.
- **Estimate:** 6 h

### T5. Redirect signed-in users away from /login and /signup (not /reset-password)
- **Acceptance criteria:**
  1. A signed-in user who opens `/login` or `/signup` is redirected (`replace`) to `/dashboard`.
  2. `/reset-password` is **not** redirected. A Supabase recovery link creates a session, and the user must still reach the form.
  3. While auth status is `"loading"`, nothing redirects. The auth card renders its normal skeleton, so signed-out users never see a flicker.
  4. **Tests:**
     - `/login` and `/signup` redirect when signed in.
     - Both render the form when signed out.
     - **`/reset-password` renders the reset form with a signed-in (recovery) session and does not redirect.**
     - No redirect while loading.
  5. `App.test.jsx`'s public-route classification (it parses `App.jsx` for `<ProtectedRoute>`, lines 133-143) still lists `/login`, `/signup` and `/reset-password` as public.
- **Fix:** a small `RedirectIfSignedIn` wrapper around the two routes. No library.
- **Bundle:** +0.1 kB.
- **Could break:** `App.test.jsx`, `AuthPage.test.jsx`, `ResetPasswordPage.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 1.5 h

### T6. Accessibility fixes that don't touch photo code [X5, §6, §9]
- **Acceptance criteria:**
  1. `cold-start-spin` and `advisor-typing-bounce` stop under `prefers-reduced-motion: reduce`. A Playwright check finds no running CSS animations on Dashboard or Advisor with reduce on.
  2. Car Profile: each `dt`/`dd` pair sits in one `div` directly inside the `dl`, and axe reports 0 `definition-list` / `dlitem` violations.
  3. Fuel Log: `.fuel-log-table-wrap` gets `tabindex="0"`, `role="region"` and `aria-label="Fill-up history"`, so axe `scrollable-region-focusable` is clear and the region shows a focus ring.
  4. The "Forgot password?" and footer links reach a 24 px minimum target height.
- **Fix:** plain CSS plus markup attributes. Fuel Log's table only; its scan cards are not touched.
- **Bundle:** +0.
- **Could break:** `CarProfilePage.test.jsx` (`dt`/`dd` queries), `FuelLogPage.test.jsx` (table queries), `AuthPage.test.jsx`.
- **Model:** Haiku 5.5
- **Estimate:** 2 h

### T7. Reset password dead end and 404 actions [§3, §13]
- **Acceptance criteria:**
  1. The expired or invalid reset link state shows a primary "Back to Log In" button linking to `/login`. The rest of the copy is unchanged.
  2. 404 shows "Go to Dashboard" when signed in and "Back to Home" when signed out, as a primary button.
  3. Both pages reach their button within 3 Tab stops after the header.
  4. Both use plain CSS cards for now. They move to the shared components in T10 later, and no visual change is expected then.
- **Fix:** plain CSS and markup.
- **Bundle:** +0.
- **Could break:** `ResetPasswordPage.test.jsx`, `App.test.jsx` (not-found route).
- **Model:** Haiku 5.5
- **Estimate:** 2 h

### T8. Mobile header and My Car menu [X4, X7]
- **Acceptance criteria:**
  1. At ≤ 860 px the header is one row ≤ 64 px tall (logo, "Menu" button), logged in and out.
  2. "Menu" is a real `<button>` with `aria-expanded` and `aria-controls`. Focus moves into the panel on open, and Escape closes it and returns focus to the button.
  3. The existing My Car submenu keeps its keyboard behaviour (arrow keys, Home, End, Escape) inside the panel. The currency switch and Log Out are inside the panel.
  4. Panel links are ≥ 44 px tall. The logo link's accessible name is "CarSage home".
  5. Panel open and close is a 150 ms transform, instant under reduced motion.
- **Fix:** plain CSS plus a small state hook in `SiteNav.jsx`. Aceternity `resizable-navbar` stays rejected (its toggle is an SVG with `onClick`, not a button).
- **Bundle:** ~0.5 kB est.
- **Could break:** `SiteNav.test.jsx` (31 queries, 4 by selector), `currencyToggle.integration.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 5 h

---

## Batch 2: shared components and screens (37 h)

### T9. Per-route page titles [X8]
- **Acceptance criteria:**
  1. All 13 screens have distinct titles ("Fuel Log · CarSage").
  2. The title updates on client-side navigation.
  3. There are no em dashes (`noEmDash` rule).
- **Fix:** a 10-line `useDocumentTitle` hook.
- **Bundle:** +0.1 kB.
- **Could break:** none expected.
- **Model:** Haiku 5.5
- **Estimate:** 1 h

### T10. Shared components and `icons.jsx` [X6, X9, X11]
- **Summary:** in-house `.jsx` components styled with tokens: `Button` (primary, secondary, ghost, danger; `loading` with `aria-busy`, and `success` announced in a polite live region), `Card`, `Field`, `Skeleton`, `EmptyState`, `StatusMessage`. Plus `src/components/icons.jsx` with copied SVGs.
- **Icon set:** car, route, chat, fuel, wrench, receipt, lock, camera, calendar, gauge, chevron-down, check, alert, info, menu, close, arrow-right, map-pin, plus. That's about 19 paths, each `aria-hidden` by default, with `currentColor` strokes.
- **Icon licence:** copy from Lucide (ISC) or Tabler (MIT). Both allow copying, provided the licence notice stays in the file header. **Pick one set so the stroke style matches.**
- **Acceptance criteria:**
  1. Each component has a `.test.jsx` covering its states.
  2. Focus rings are visible (≥ 3:1) on every theme.
  3. Spinner and shimmer are static under reduced motion.
  4. `icons.jsx` carries the source licence notice and adds no npm dependency.
  5. No screen is migrated in this ticket.
- **Bundle:** ~2.3 kB components + ~2.5 kB icons (gzip, estimate). Only in the route chunks that use them.
- **Could break:** nothing existing (new files).
- **Model:** Fable 5.1, because every later screen ticket inherits these APIs and visuals.
- **Estimate:** 7 h

### T11. Dashboard [§4]
- **Acceptance criteria:**
  1. The active car (from T4) renders as a hero card. Other cars are compact cards in a CSS Grid.
  2. One primary action ("Plan a trip", or "Add your first car" when there are none).
  3. Drivetrain and transmission are formatted for display only ("RWD", "Automatic"), with a unit test. Stored values are unchanged.
  4. The month and maintenance empty states use `EmptyState`.
  5. Numbers are plain text with no animation.
- **Fix:** T10 components, CSS Grid.
- **Bundle:** +0.
- **Could break:** `DashboardPage.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 5 h

### T12. Car Profile layout [§6]
- **Acceptance criteria:**
  1. H1 (car name) comes first, then the switcher.
  2. Specs use `icons.jsx` and a 2-column grid at ≥ 860 px.
  3. Empty values read "Not set".
  4. "Delete Car" sits in a separate "Danger zone" card with a danger `Button`. The confirm flow is unchanged.
- **Not touched:** the photo upload and remove code.
- **Bundle:** +0.
- **Could break:** `CarProfilePage.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 4 h

### T13. Landing, including a static "Example" preview [§1]
- **Acceptance criteria:**
  1. Emoji are replaced with `icons.jsx`. Feature and step cards use a plain CSS Grid bento layout.
  2. The visible headline is the H1, and the `.sr-only` H1 is removed.
  3. The wordmark "CarSage" is text beside the logo in the header.
  4. A static preview card sits under the CTAs with a visible **"Example"** label: car name, monthly fuel, next service, all hard-coded. No live data, no telemetry wording. It is `aria-label="Example of the CarSage dashboard"`.
  5. Cards lift ≤ 2 px on hover and focus, with no movement under reduced motion.
- **Bundle:** Landing is in the entry chunk, so ≤ +1.5 kB gzip, inside the T1 budget.
- **Could break:** `LandingPage.test.jsx`, `Logo.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 5 h

### T14. Trip Planner layout [§7]
- **Acceptance criteria:**
  1. Two columns at ≥ 860 px: the form, and a results card. Before planning, the results card shows `EmptyState`.
  2. While planning, the results card shows `Skeleton` and the button is in `loading`.
  3. Origin and destination markers share one rail in brand colours.
  4. Results are static text.
- **Bundle:** +0.
- **Could break:** `TripPlannerPage.test.jsx` (77 queries, 13 by selector), the highest test risk.
- **Model:** Sonnet 5.5
- **Estimate:** 5 h

### T15. Maintenance, Privacy and Terms, and Car Onboarding layout [§10, §12, §5]
- **Acceptance criteria:**
  1. Maintenance: the odometer note sits under the car selector. "Add an item" and the list are side by side at ≥ 860 px. "+ Custom item" is a solid chip.
  2. Legal: the text column is centred, ≤ 70 characters wide, with no watermark behind it, and a TOC built from the existing H2s. A test asserts the rendered `innerText` is unchanged.
  3. Onboarding: two columns at ≥ 860 px, grouped cards at 390 px. The default theme comes from T4, and the button shows `loading`. **The photo picker is not touched.**
- **Bundle:** +0.1 kB.
- **Could break:** `MaintenancePage.test.jsx`, `LegalPages.test.jsx`, `CarOnboardingPage.test.jsx`.
- **Model:** Haiku 5.5 for Maintenance and Legal, Sonnet 5.5 for Onboarding. Three commits, one per screen.
- **Estimate:** 5 h (Maintenance 1.5 h, Legal 1.5 h, Onboarding 2 h)

### T16. AI Advisor layout, non-photo parts [§8]
- **Acceptance criteria:**
  1. The recommendation is a banner at the top of each reply: icon plus "See a mechanic" or "Safe to check yourself", ≥ 16 px, ≥ 4.5:1 on every theme.
  2. The conversation scrolls in a panel, and the composer stays docked at the bottom at 390 px and 1280 px.
  3. The "Change" link reaches 24 px target height and uses white or cream on the dark bubble.
- **Not touched:** `PhotoScan.jsx` and the photo notes.
- **Bundle:** +0.
- **Could break:** `AIAdvisorPage.test.jsx`.
- **Model:** Opus 5.5, because the safety-advice hierarchy needs care.
- **Estimate:** 5 h *(was 6 h. The photo-notes part moved to T18.)*

---

## Batch 3: photo-adjacent markup (9 h, each needs your explicit OK)

These change only layout and CSS around the camera and photo components. No camera, photo, upload or limits logic changes, but the markup sits inside those files, so each needs approval first.

### T17. Fuel Log: one privacy notice for both scan cards, and stacked rows on phones [§9]
- **Acceptance criteria:**
  1. The Gemini notice appears once above both scan cards, with **unchanged** wording.
  2. At ≤ 520 px, fill-ups render as stacked rows instead of the 962 px table, with the same data and order.
  3. The duplicate headings are merged.
- **Could break:** `FuelLogPage.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 3 h

### T18. AI Advisor photo notes grouped [§8]
- **Acceptance criteria:**
  1. The three notes sit under one "About photo scanning" block with **unchanged** wording.
  2. "Scan a photo" uses the secondary `Button` style, so it no longer looks disabled.
- **Could break:** `AIAdvisorPage.test.jsx`, `advisorPhoto.test.js`.
- **Model:** Sonnet 5.5
- **Estimate:** 2 h

### T19. Focus ring for hidden file inputs [§5, §9, §11]
- **Acceptance criteria:**
  1. In `index.css` only, labels whose visually hidden file input has focus show the focus ring (`label:has(input:focus-visible)`). This covers RecordPhotos, PhotoScan, OdometerScanButton, PendingPhotos, Car Profile and Onboarding.
  2. A Tab walk logs no `NO-RING`. No JSX in those components changes.
- **Could break:** none expected (CSS only).
- **Model:** Haiku 5.5
- **Estimate:** 1 h

### T20. Expenses "Add a photo" as a secondary button, and empty state [§11]
- **Acceptance criteria:**
  1. "Add a photo" looks like a secondary button, consistent with Fuel Log.
  2. The month empty state uses `EmptyState` with an action that focuses the form.
  3. Upload behaviour is unchanged.
- **Could break:** `ExpensesPage.test.jsx`, `RecordPhotos.test.jsx`.
- **Model:** Sonnet 5.5
- **Estimate:** 3 h

---

## Last, optional

### T21. Advisor starter chips
- **Acceptance criteria:**
  1. 3 or 4 chips appear only in an empty conversation.
  2. Clicking a chip fills the input and moves focus to it, **without sending**.
  3. Chips are real buttons, ≥ 44 px tall on touch.
- **Bundle:** +0.2 kB.
- **Could break:** `AIAdvisorPage.test.jsx`.
- **Model:** Haiku 5.5
- **Estimate:** 2 h
