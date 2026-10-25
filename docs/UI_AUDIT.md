# CarSage UI Audit

Branch `ui/aceternity` at `ab76417` (sprint-4 plus the Tailwind v4 wiring). Audited 2026-10-21.

## How this was checked

- **Screens:** all 13, at 1280 px and 390 px. Logged-out screens used a clean browser. Logged-in screens used the demo account with a saved session, stored outside the repo.
- **Data source:** local dev server (the shared production database).
- **View-only:** pages were only loaded and walked with the Tab key. Nothing was clicked, saved, deleted, scanned or sent.
- **Screenshots:** full page plus first paint, kept in the session scratchpad and not committed.
- **Per-screen checks:**
  - axe-core 4.10 (WCAG 2.0/2.1 A and AA)
  - horizontal overflow
  - touch targets under 24 px
  - a 14-step Tab walk recording whether focus is visible
  - console errors
  - a reload under `prefers-reduced-motion: reduce`
- **Contrast:** computed from the real CSS tokens. axe marked 10 to 16 text nodes per page as "incomplete" for contrast because of the watermark background image, so its zero contrast count proves nothing.
- **Reference:** each screen was compared with its Stitch `screen.png` for visual style only. Stitch shows many features that `CLAUDE.md` cuts (sidebar, telemetry, OBD-II, document vault, booking, Apple sign-in, audio diagnosis). None of those is proposed here.

Severity: **P1** = accessibility failure, broken or dead-end state, or something that misleads the user. **P2** = brand or consistency gap that is clearly off-reference. **P3** = polish.

## Performance baseline

| Asset | Size (min) | Gzip |
|---|---|---|
| JS, one chunk `index-*.js` | 1,053.32 kB | 304.70 kB |
| CSS | 56.09 kB | 9.06 kB |
| Mercedes-Benz logo (PNG, only image that is not SVG) | 249.48 kB | n/a |

- **No route-level code splitting:** there is no `React.lazy` anywhere, so every visitor downloads every screen.
- **Dependency weight:** measured in isolation with React external, at the versions in `package.json`:

| Dependency | Size (min) | Gzip | Where it is needed |
|---|---|---|---|
| recharts (the chart parts in use) | 545 kB | 134 kB | Fuel Log and Expenses only |
| @supabase/supabase-js | 261 kB | 60 kB | every page |
| react-router-dom | 47 kB | 15 kB | every page |

- **Proposed budget:**
  - Initial JS must never grow from today.
  - After route splitting (ticket F3), the target for the Landing entry chunk is ≤ 480 kB min / ≤ 150 kB gzip. The budget is then locked at the measured value plus 2%.
  - Each route chunk is ≤ 60 kB gzip, not counting the shared recharts chunk.
  - All UI library code added across the app is ≤ 15 kB gzip, and it is never in the entry chunk.
  - CSS is ≤ 64 kB min.
  - Brand fonts total ≤ 2 woff2 files and ≤ 80 kB.

## Cross-cutting findings (ranked)

| # | Sev | Finding | Evidence |
|---|---|---|---|
| X1 | P1 | **Brand fonts never load.** Every element renders in `system-ui` (Segoe UI on Windows). Space Grotesk and Manrope are not referenced anywhere. | `index.css:30` `--font-family-base: system-ui, ...`; computed font on every screen was `system-ui`. |
| X2 | P1 | **The site theme does not follow the car on screen.** The theme uses the last car *reported* to `ActiveCarContext` (saved in localStorage, else the oldest car). Pages pre-select the oldest car (`loadedCars[0]`) and report only when the dropdown changes. Car Profile opens the profile's `default_car_id` and reports it on view. So after viewing the Mercedes profile, every page turns graphite `#1b1b1b` with a cyan accent while Fuel Log, Maintenance and Expenses show the 2018 Honda CR-V. The theme also flips from green to graphite after load, because the car list is fetched after first paint. *(Corrected 2026-10-21: the first version said "default car".)* | Dashboard 390 first-paint vs loaded screenshots; `ActiveCarContext.jsx:86-99`; `FuelLogPage.jsx:227`; `CarProfilePage.jsx:286`. |
| X3 | P1 | **Accent used as text fails AA on several brand themes.** Recharts legend text takes the bar colour. Some ratios are measured on rendered colours, the others are computed from the token values. | "Other costs" in default gold on white is 2.40:1. Mercedes cyan is 2.97:1 (rendered). BMW `#6ab2e7` is 2.30:1, VW `#00b1eb` is 2.47:1, Ferrari yellow is 1.38:1. Needs 4.5:1. |
| X4 | P1 | **The mobile header uses 165 to 210 px** (25% of an 844 px screen) and wraps into 3 or 4 rows. There is no menu toggle. | All 390 px screenshots: logo row, links row, a wrapped "AI Advisor" row, then the USD/LBP and Log Out row. |
| X5 | P1 | **Reduced motion is only partly respected.** `cold-start-spin` (`index.css:316`) and `advisor-typing-bounce` (`index.css:1943`) keep animating. The only `prefers-reduced-motion` block covers `.spec-loading__spinner` and `.skeleton-bar`. | `index.css:3276`. |
| X6 | P2 | **Emoji icons** (🚙 🧭 💬 ⛽ 🔒 📷 🛠 and others) on Landing, Dashboard, Car Profile, Fuel Log and Expenses. They render differently per OS and clash with the line icons in Stitch. | Landing feature cards, Dashboard Quick Access, Car Profile spec rows, `FuelLogPage.jsx:652`. |
| X7 | P2 | **Small touch targets.** Header links are 20 px tall, footer links 17 px, "Forgot password?" 17 px, the Advisor "Change" link 17 px. WCAG 2.2 asks for 24 px, and 44 px is the comfortable size on phones. | Target scan on every screen. |
| X8 | P2 | **Every route shares one `<title>`** ("CarSage: The Mindful Driver's Co-Pilot"), so browser tabs and history are indistinguishable. | `title` was identical on all 13 screens. |
| X9 | P2 | **Empty states are plain sentences.** They have no icon and no button, so the next action is an inline link inside a paragraph. | Dashboard "All cars, this month" and "Maintenance"; Expenses list. |
| X10 | P2 | **The background watermark** (gear and wrench, `background-texture-icon.svg`, 47 kB) sits behind long text and forms. It lowers effective contrast and makes axe unable to verify contrast. | Privacy, Terms, Reset, Trip Planner. |
| X11 | P3 | **Success feedback is inconsistent:** some forms show inline text and some just reset. There is no shared "saved" pattern. | Code review of page handlers; not triggered, because the audit was view-only. |
| X12 | P3 | **Mercedes logo** is a 249 kB PNG while every other brand mark is an SVG. | Build output. |

## Per-screen findings

### 1. Landing (`/`), ref `carsage_modern_marketing_landing_page`
- **P2:** Feature cards use emoji in beige squares, while Stitch uses single-colour line icons in tinted squares (X6).
- **P2:** The 48 px logo in the header holds a "CarSage" wordmark too small to read. Stitch shows the wordmark as text beside the mark.
- **P2:** The hero has no product preview. Stitch has a dashboard summary card under the CTAs. An in-scope version is possible (car name, monthly fuel, next service), but it must be static illustration, not live data.
- **P3:** "Thoughtful tools" cards have no hover or focus lift. Stitch cards lift slightly.
- **P3:** At 390 px, `.landing-hero__glow` extends to 435 px. It is clipped, so there's no scroll, but it is wasted paint.
- **Accessibility:**
  - Focus ring is visible on every link.
  - There is one H1 ("CarSage"). It is visually hidden while the visible headline is a `p`/`h2`, so screen readers hear "CarSage" as the page heading. Keep it, but consider making the visible headline the H1.
- **States:** none needed (static page).

### 2. Sign Up / Log In (`/login`, `/signup`), ref `carsage_sign_up_authentication`
- **Close to reference.** The card, segmented Sign Up / Log In control, Google button and filled inputs match.
- **P1:** A logged-in user who opens `/login` still sees the login form. The header says "Log Out" at the same time. Stitch implies a redirect.
- **P2:** "Forgot password?" is a 17 px target (X7).
- **P2:** The card icon is a house. In Stitch it signals "garage". This is minor, but the house reads as "go home" and nothing happens on click.
- **P3, needs your decision:** Sign Up has no "By signing up you agree to Terms and Privacy" line under the button, which Stitch has. A consent sentence is arguably legal wording, so it is not included in any ticket unless you approve it.
- **States:** inline error and status regions exist (`role="alert"` / `role="status"`). The submit has no loading state on the button itself.

### 3. Reset password (`/reset-password`), no Stitch ref (use the auth card style)
- **P1:** The expired or invalid link state is a dead end. It says "Request a new one from the Log In page" but offers no button or link to do it.
- **P3:** The house icon is reused (same as Auth).

### 4. Dashboard (`/dashboard`), ref `carsage_dashboard_vehicle_hub`
- **P1:** The green-to-graphite theme flash on load (X2).
- **P2:** There is no primary-car hero. Stitch leads with one large card for the primary car (name, key stats, photo, next service). Here, four identical cards stack with equal weight, so the default car is not distinguished.
- **P2:** Raw spec values are shown as stored ("rwd", transmission "a"). Display formatting (uppercase drivetrain, "Automatic" for "a") is presentation only.
- **P2:** There is no clear primary action. "+ Add Another Car" is a ghost button on the right, and the "Plan a trip" style actions are buried in Quick Access at the bottom.
- **P2:** Empty states are plain text (X9).
- **P3:** "DIY Success 60%" is the largest type on the page. Per the brief, numbers are stated plainly and never decorated or animated.
- **States:**
  - Loading skeleton exists and is good.
  - No error state was observed (view-only).
- **Mobile:** the header is 210 px (X4). Spec grids drop to 2 columns, which works.

### 5. Car Onboarding (`/cars/new`), ref `carsage_add_your_car`
- **P2:** This is a 12-field single-column form at every width. Stitch uses two columns at desktop and a short "core" block first.
- **P2:** The page is themed by the default car (graphite button) while adding a *new* car. Onboarding should use the base CarSage theme.
- **P2:** The Drivetrain input is free text ("e.g. fwd, rwd, awd"). A select would be clearer, but it changes the stored value format, so it is out of this presentation-only scope and only flagged.
- **P3:** The "CORE SPECIFICATIONS" eyebrow floats above "Basic Info" with no visible grouping.
- **Out of scope in Stitch, not proposed:** "Scan Registration Card" (the hotfix branch removes it), "Designate as Primary Vehicle" telemetry copy, "Save & Exit".
- **Accessibility:** the photo file input is visually hidden (1×1). Keyboard focus lands on it with no visible ring on its label.

### 6. Car Profile (`/cars/mine`, `/cars/:id`), ref `carsage_car_profile`
- **P1 (axe, serious):** `<dl>` contains `div > div` wrappers, so 24 `dt`/`dd` items have no valid `dl` parent. Screen readers lose the label and value pairing.
- **P2:** 12 spec rows in one long column with emoji icons. Stitch pairs related values in fewer rows with line icons.
- **P2:** Empty values show "-". They should read "Not set" with an "Add" affordance.
- **P2:** The car `<select>` sits above the H1, so the page starts with a form control instead of a title.
- **P2:** "Delete Car" is a centred red link under the card with no separation. It should be a clearly separated "danger zone".
- **P3:** The Edit button colour follows the theme (graphite). The primary button should stay consistent across themes.
- **Observation for you:** `/cars/mine` opens the default car (Mercedes C230) while other pages pre-select the Honda CR-V. Both may be intended, but the two meanings of "my car" are visible side by side.

### 7. Trip Planner (`/trip-planner`), ref `carsage_trip_planner`
- **P2:** At 1280 px the form takes the left 480 px and the right side is empty. Stitch puts the result panel beside the form. A visible "Your estimate will appear here" placeholder would fill that area as the empty state.
- **P2:** The origin marker is cyan (accent) and the destination marker is a black square. Stitch uses a connected start-to-destination rail.
- **P3:** The "Advanced options" disclosure uses a tiny ▸ glyph.
- **States:** the Plan Trip button has no loading treatment beyond the text change. Results were not triggered (view-only).
- **Out of scope in Stitch, not proposed:** weather, "Invert Origin", "Reset", route names, telemetry.

### 8. AI Advisor (`/advisor`), ref `carsage_ai_advisor`
- **P1:** The recommendation badges ("DIY FIXABLE", "SEE A MECHANIC") are 12 px uppercase chips, the smallest text in each reply. Safety guidance should be the most prominent element, not the least. Make them larger, add an icon, and keep the text plain.
- **P1:** The message composer sits below the whole conversation. At 390 px the page is 4,095 px tall, so a returning user scrolls past every old reply to type. Stitch keeps the composer docked.
- **P2:** The conversation is not inside a panel. Replies are full-black blocks because of the theme (X2), so the page reads as heavy and dark.
- **P2:** "Scan a photo" is a beige ghost button that looks disabled. Below it, three 11 px notes repeat privacy text. The copy itself must not change, but it can be grouped under one disclosure-style block.
- **P2:** The "Change" link is 17 px tall (X7).
- **P3:** There are no quick-start prompts for an empty conversation. Stitch shows starter chips. Presentational only, and they fill the input without sending, so they are in scope if wanted.
- **Motion:** the typing indicator (`advisor-typing-bounce`) ignores reduced motion (X5).
- **Out of scope in Stitch, not proposed:** audio clip upload, TSB claims, service diary logging, timestamps with read receipts.

### 9. Fuel Log (`/fuel-log`), no direct Stitch ref (use dashboard card style)
- **P1 (axe, serious):** `.fuel-log-table-wrap` scrolls horizontally but cannot be focused, so keyboard users cannot scroll it.
- **P1:** At 390 px the table is 962 px wide inside its wrapper. The LBP column is cut off with no visual cue that more columns exist.
- **P2:** Two identical scan cards each repeat the 4-line Gemini privacy notice, so the form is about 1,100 px tall on a phone. The wording stays the same, but the notice can appear once for both scans.
- **P2:** The two headings "Fill-Up History for 2018 Honda CR-V" and "Fill-ups for 2018 Honda CR-V" are near-duplicates.
- **P3:** Chart bars use theme primary (black on the Mercedes theme).
- **Accessibility:** the hidden file inputs receive focus with no visible ring (Tab walk logged `NO-RING`).

### 10. Maintenance (`/maintenance`), no direct ref
- **P2:** At 1280 px the "No odometer reading yet for this car." note floats alone at the far right of the header row, detached from the car it describes.
- **P2:** Content is limited to 480 px while the rest of the 1,096 px column is empty.
- **P3:** Suggestion chips (Oil change and the others) are well sized at 34 px. "+ Custom item" is dashed, which reads as a drop zone.
- **States:** the empty state ("Nothing tracked yet") is good and points to the chips.

### 11. Expenses (`/expenses`), no direct ref
- **P1:** The "Other costs" legend fails contrast (X3).
- **P2:** "Add a photo" is styled as a link inside a form. It should look like a secondary button, consistent with Fuel Log scanning.
- **P2:** The "October 2026" empty state is text only (X9).
- **Accessibility:** the hidden photo input receives focus with no visible ring.

### 12. Privacy and Terms (`/privacy`, `/terms`)
- **Wording is not touched.**
- **P2:** Long text sits over the watermark (X10). The text column is left-aligned in a wide container.
- **P3:** There is no "Last updated" emphasis or on-page table of contents for the 8 sections. A TOC is a presentational addition built from the existing headings.

### 13. 404 (`*`)
- **P1:** Logged-in users get only "Back to Landing". There is no route back to the Dashboard and no primary button.
- **P3:** The page has no illustration and no context. One line icon plus two buttons (Dashboard / Home) would cover it.

## What the libraries can and cannot do here

- **Aceternity UI (free registry):**
  - **License:** the `/licence` page grants use in unlimited end products and forbids redistributing source "as a stock item" or on marketplaces. It does not separate free components from Pro, and it does not mention attribution or student use. **Unclear: confirm with Aceternity that this licence covers the free registry items.**
  - **Pro blocks:** these return "You are not authorized" from the registry and are excluded: `empty-state-*`, `frequently-asked-questions-accordion`, `login-signup-minimal`, `bento-grid-with-skeletons`, `expandable-card-on-click`, `chat-conversation`, `simple-login-with-grid-lines`.
  - **Language:** every item is TSX. With `"tsx": false` the shadcn CLI emits JSX, which still needs a read-through.
- **Componentry:**
  - **License:** MIT (GitHub `harshjdhv/componentry`).
  - **Fit:** all 57 items are decorative WebGL, shader, scroll or text effects. None fits a calm utility app, and several decorate numbers (`split-flap-display`), which the brief rules out. **None recommended.**
- **Common gaps in the Aceternity sources read with `view`:**
  - No item checks `prefers-reduced-motion`.
  - Colours are hard-coded (`bg-green-500`, `#3b82f6`, `neutral-*`).
  - Five items import `motion/react` without declaring it as a dependency: `stateful-button`, `loader`, `resizable-navbar`, `sticky-banner`, `tooltip-card`.
  - **Accessibility gaps:**
    - `animated-modal`: no `role="dialog"`, no focus trap, no Escape, and an unlabelled close button.
    - `tooltip-card`: mouse and touch only.
    - `tabs`: not ARIA tabs, and its declared Radix dependency is unused.
    - `resizable-navbar` mobile toggle: an `onClick` on an SVG, not a button.
    - `sticky-banner`: `console.log` on every scroll event and an unlabelled close button.
- **`motion` 14.5.0 cost, measured in isolation:** 202 kB min / 58 kB gzip for `motion` + `AnimatePresence` + `useAnimate`, and 125 kB / 37 kB gzip with `LazyMotion` + `m`. That is more than the whole UI-library budget, so no recommended item uses it. CSS transitions cover loading, saved and expanded states at 0 kB.
- **Shortlist and tickets:** see `docs/UI_TICKETS.md`.
