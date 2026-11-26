# CarSage Improvement Plan

Written 2026-11-16 on branch `dev` at `998c256`. Planning only: no source file, database row or branch was changed to produce it. It follows three earlier documents and does not repeat them: `docs/UI_AUDIT.md`, `docs/UI_TICKETS.md` and `docs/DESIGN_PASS_2.md`.

Every item below carries a prompt you can paste into a fresh session. Each prompt re-checks its own finding first, because the code will have moved by the time you use it.

## Decisions I need from you

Each one has my recommendation and what it costs. Nothing that depends on a decision should start before you answer it.

1. **CAR-63 email reminders: build or drop?** It is in CLAUDE.md's Sprint 4 scope and nothing exists.
   - **Recommendation: drop it from scope, in writing** (one line changed in CLAUDE.md, by you). The live project has 3 users and 1 maintenance item, the Dashboard already shows what is due, and the feature is the single most expensive thing on this list.
   - **Cost of dropping:** nothing to build. A user who never opens the app gets no nudge.
   - **Cost of building (PLAN-31):** 16 to 24 hours; an email provider account; very likely a domain of your own to send from (free tiers only send to your own address until a domain is verified, and `netlify.app` cannot be verified), roughly 10 to 15 USD a year; a scheduler (a daily GitHub Actions job is the cheapest); a new table and a new column on the live database; a second copy of the due-date rules in Python; and a change to the Privacy wording, which needs your say-so.
2. **Remove Tailwind to free the CSS budget (PLAN-01)?**
   - **Recommendation: yes.** It is the only way found to get real CSS room without raising the budget: 6.00 kB minified and 1.22 kB gzip back, from code nothing uses.
   - **Cost:** 2 to 3 hours. It ends the option of installing shadcn components with the CLI. CLAUDE.md already forbids UI libraries, so nothing planned is lost.
   - **REPLACED: Tailwind is kept, with automatic source scanning turned off (merged on dev). PLAN-01 must not be run. PLAN-04 is only needed if more CSS room is required.**
3. **If you refuse 2: raise the CSS budget, or run the slow merge pass (PLAN-04)?**
   - **Recommendation: neither, take 2.** A raise is the easy answer and I am not assuming you will give it. PLAN-04 costs 4 to 6 hours for about 0.2 to 0.4 kB gzip and carries the highest regression risk in this plan.
4. **Let users delete a fill-up (PLAN-05)?** It needs a new DELETE policy on the live `fuel_logs` table and reverses the earlier "fill-ups are never deleted" rule that `verify_rls.py` asserts.
   - **Recommendation: yes, delete only, no edit.** A wrong fill-up currently corrupts cost totals and real km/L for good, and the live data already holds one (13.69 L saved as 20 LBP).
   - **Cost:** 4 to 6 hours and one small migration that you run.
5. **Saved trips: show them, or stop saving them (PLAN-06)?** Every estimate stores the start and destination addresses. The app never shows them and cannot delete them.
   - **Recommendation: show the five most recent with a delete button.** The data is already there and the policies already allow it.
   - **Cost:** 5 to 7 hours. The alternative (stop saving) is about 2 hours and leaves the 23 existing rows for you to clear.
6. **Daily caps for Trip Planner and the spec lookup (PLAN-10): which numbers?** Trip Planner calls a Google API that is billed per call and has no cap today.
   - **Recommendation: 40 estimates and 40 spec lookups per user per day**, no global cap. A real user plans a handful of trips a day.
   - **Cost:** 3 to 5 hours and two new rows in the live `api_limits` table that you insert.
7. **Run `verify_rls.py` against the live project (PLAN-15)?** It has never run. It creates two throwaway users and deletes them.
   - **Recommendation: yes, once, after PLAN-05's policy is in**, at a quiet time, with you watching.
   - **Cost:** about an hour. Risk: leftovers if it dies half way; the prompt checks for them.
8. **Three dashboard settings only you can change (PLAN-16):** Supabase leaked-password protection (currently off; may need a paid plan), the Google browser key's referrer and API restrictions, and a Google Cloud spending alert or quota cap.
   - **Recommendation: do all three.** Cost: 30 minutes of clicking. I could not see any of these from here.
9. **Add CI (PLAN-29)?**
   - **Recommendation: yes, after PLAN-02.** One workflow file, no secrets, about 1 minute per run.
   - **Cost:** 2 to 3 hours, plus you add two repository variables (the public Supabase URL and anon key).
10. **Three small visible or wording changes that are yours to approve:**
    - a thin border on secondary buttons if the contrast test shows they need it (PLAN-21);
    - new wording for the footer, the search description and the README (PLAN-27; proposals are in the prompt);
    - photo-adjacent markup in the Fuel Log scan cards (PLAN-24, as `docs/UI_TICKETS.md` T17 already says).
    - **Recommendation: yes to all three.**
11. **A dedicated test account for one real end-to-end test (PLAN-30)?**
    - **Recommendation: optional, do it last.** It is the only item that writes to production through the app on purpose.
    - **Cost:** 4 to 6 hours, and you create and keep the account.
12. **Branch clean-up.** Every local branch is fully merged into `dev`. `sprint-4` is 17 commits behind `dev` and 0 ahead. A stale worktree for `hotfix/remove-registration-scan` points into a deleted temp folder.
    - **Recommendation: retire `sprint-4` and the merged work branches, and prune the worktree.** Deleting `sprint-1`, `sprint-2` and `sprint-3` also removes the last branches that still track `CLAUDE.md` (see "Process and repo housekeeping").
    - **Cost:** 10 minutes, by you. Nothing in this plan does it for you.
13. **Trim `docs/FILE_INDEX.md`?** It is 251 kB for 306 lines, about 820 characters a line: it has turned into a change log, and no session can read it whole.
    - **Recommendation: yes, one line of at most 200 characters per file; the history is in git.** Cost: 2 hours of mechanical work. Not written up as an item; ask if you want a prompt for it.

## Summary: the five things that would most improve the app

**Progress:**

- PLAN-01: replaced. Tailwind is kept, with automatic source scanning turned off (merged on dev). Do not remove Tailwind.
- PLAN-02: done (merged on dev).
- PLAN-03: done (merged on dev).

1. **Get CSS room back without raising the budget (PLAN-01).** The stylesheet is 72.75 kB against a 73 kB budget, so almost no visual change can ship. Tailwind is still wired in from the abandoned component-library experiment and writes about 30 utility classes into the stylesheet that nothing uses. Removing it frees 6.00 kB minified and 1.22 kB gzip. Everything visual in this plan waits on this one item. The hand-written CSS itself has no dead classes (381 checked, 0 dead), so there is no second easy win.
   - **REPLACED: Tailwind is kept, with automatic source scanning turned off (merged on dev). PLAN-01 must not be run. PLAN-04 is only needed if more CSS room is required.**
2. **Give users control of what they have stored (PLAN-05, PLAN-06).** A mistyped fill-up can never be removed and quietly corrupts the cost totals, the real fuel economy and the trip estimates built on it. Trips are worse in a different way: every estimate saves the user's start and destination addresses, and no screen shows or deletes them. These are the two places where the app keeps data the user cannot manage.
3. **Cap the one endpoint that costs money (PLAN-10) and make its failures readable (PLAN-11).** The AI and camera endpoints have daily limits enforced in the database. The Trip Planner estimate, which calls a billed Google API on every press, has none. Its errors also all look the same and are never logged, which is the likely reason one 400 was seen in QA and never reproduced.
4. **Prove the security that the code claims (PLAN-15, PLAN-14, PLAN-16, PLAN-29, PLAN-02).** The code review found no injection, no leaked secret, no raw error text and no unauthenticated route. But the proof is missing: the live row-level-security test has never run, all 1869 frontend tests fake the database, the site sends no security headers, three dashboard settings are unconfirmed, nothing runs the tests automatically, and the bundle check passes on a build that cannot run.
5. **Make the advisor's verdict impossible to miss, then close the keyboard gaps (PLAN-23, PLAN-18, PLAN-19, PLAN-20).** "See a mechanic" is the reason the advisor exists, and it is still a 12 px chip, the smallest text in each reply. Alongside it: no skip link, one page title for all 13 screens, and no visible focus on the photo pickers. axe finds 0 violations on the logged-out screens, so these are the gaps that automated checks miss.

One thing is not on this list on purpose: CAR-63. It is the largest piece of unbuilt scope, and my recommendation is to remove it from scope rather than build it (Decision 1).

**Suggested order:** Batch 1, then Batch 2 and Batch 3 in any order, then Batch 4, then Batches 5 and 6 as time allows, with Batch 7 alongside. Total for everything except CAR-63 and the fallback PLAN-04: roughly 75 to 110 hours. Batches 1 to 4 alone, which carry all the risk reduction: roughly 30 to 45 hours.

## Status of the earlier tickets and proposals

Evidence is a commit on `main`, a file, or what was measured on 2026-11-16. "Not planned" means it is still open and I chose not to plan it; the reason is in "Deliberately not doing".

### `docs/UI_TICKETS.md`

| Ticket | Status | Evidence | In this plan |
|---|---|---|---|
| T1 Route splitting (CAR-67) | DONE | `4e20184`, `051fc99`; one chunk per screen in the build | |
| T2 Brand fonts (CAR-68) | DONE | `2ba8b5c`; two WOFF2 files, 47.1 kB | |
| T3 Accent text tokens (CAR-69) | DONE | `0d73d28`; `themeContrast.test.js` | |
| T4 Theme follows the car (CAR-70) | DONE | `530e820`, `5ae45fb` | |
| T5 Signed-in redirect (CAR-71) | DONE | `5ff92ef`; `RedirectIfSignedIn.jsx` | |
| T6 Accessibility fixes (CAR-72) | DONE | `eaa5b01`; axe 0 violations on logged-out routes | |
| T7 Reset dead end and 404 (CAR-73) | DONE | `94a5916`; seen in screenshots | |
| T8 Mobile header (CAR-74) | DONE | `7e41e7d`, `c206925` | |
| T9 Per-route titles | STILL OPEN | every route returned the same title | PLAN-19 |
| T10 Shared components and icons | PARTLY DONE | icons: `87132d8` (CAR-76). Components: only `StatusBadge.jsx` exists; no `Button`, `Card`, `Field`, `EmptyState` | Not planned |
| T11 Dashboard | OBSOLETE | replaced by D4 and D5 (`b45284c`, `5d37dab`) | |
| T12 Car Profile layout | STILL OPEN | no "Not set", no danger area in `CarProfilePage.jsx` | PLAN-25 |
| T13 Landing | OBSOLETE | replaced by D6 (`bae39ab`, `e898865`) | |
| T14 Trip Planner layout | STILL OPEN | no results placeholder in `TripPlannerPage.jsx` | PLAN-26 |
| T15 Maintenance, legal, onboarding layout | STILL OPEN | no table of contents in `LegalPages.jsx`; the onboarding theme part was done by CAR-70 | Not planned |
| T16 AI Advisor layout | PARTLY DONE | composer is sticky (`.advisor-input-row`), verdict colours and icons by `b561cd3`; the verdict is still a 12 px chip (`.advisor-badge`) | PLAN-23 |
| T17 Fuel Log notice and phone rows | STILL OPEN | notice still rendered twice; table still overflows | PLAN-24 |
| T18 Advisor photo notes grouped | STILL OPEN | no grouping block in `PhotoScan.jsx` | Not planned |
| T19 Focus ring on hidden file inputs | STILL OPEN | no `:has(input:focus-visible)` rule in `index.css` | PLAN-20 |
| T20 Expenses photo button and empty state | STILL OPEN | no `EmptyState`; the label wording is fixed by PLAN-09 | Not planned |
| T21 Advisor starter chips | OBSOLETE | example chips already exist (`advisor-example-chip` in `AIAdvisorPage.jsx`, since `2847449`). Not checked: whether a chip sends or only fills | |

### `docs/DESIGN_PASS_2.md`

| Ticket | Status | Evidence | In this plan |
|---|---|---|---|
| D1 Motion (CAR-75) | DONE | `75c0660`; `motionCss.test.js` | |
| D2 Icons (CAR-76) | DONE | `87132d8`; `icons.jsx`, `iconsMore.jsx`, `noGlyphIcons.test.js` | |
| D3 Header v2 (CAR-77) | DONE, two parts left out | `5cc3547`. The header wordmark and the My Car divider were not built (its own note says so); the header logo text is still too small to read in today's screenshots | Not planned |
| D4 Dashboard data (CAR-78) | DONE | `b45284c`, `d35120d`; `carSnapshot.js` | |
| D5 Dashboard UI (CAR-79) | DONE | `5d37dab` and follow-ups `2508d08`, `37a34e2`, `fc29095` | |
| D6 Landing (CAR-80) | DONE | `bae39ab`; Landing layout shift at 390 px measured 0.014 | |
| D7 Status colours (CAR-81) | DONE | `b561cd3`; `statusColours.test.js` | |
| D8 Favicon and assets (CAR-82) | DONE | `6cad447`; `assetWeight.test.js` | |
| D9 Hand-drawn underline | OBSOLETE | dropped by decision 3 of 2026-10-22 | |
| D10 Category icons (CAR-83) | DONE for Expenses | `4e1514c`. Maintenance preset icons not checked | |
| Section 5 budget: CSS 72 / 13 enforced | DONE, then raised | `check-bundle.mjs`; min raised to 73 after CAR-80. Today 72.75 / 12.39 | PLAN-01 |
| Section 5 budget: entry and initial JS | DONE | today entry 460.90 / 131.22 of 470 / 134; initial 509.90 / 148.57 of 516 / 150 | PLAN-02 |

### `docs/UI_AUDIT.md` (findings that never became a ticket, and the budget proposals)

| Finding | Status | Evidence | In this plan |
|---|---|---|---|
| X1 to X6 | DONE | T2, T4, T3, T8, T6, D2 above | |
| X7 Small touch targets | PARTLY DONE | footer links and "Forgot password?" are still 18 px tall, but axe's WCAG 2.2 target-size rule passes them on spacing | Not planned |
| X8 One title for all routes | STILL OPEN | same as T9 | PLAN-19 |
| X9 Plain empty states | PARTLY DONE | Dashboard tiles have real empty states (`5d37dab`); other screens unchanged | Not planned |
| X10 Watermark behind text | PARTLY DONE | toned down in `8d5e1a7`; axe still cannot verify contrast on 7 of 8 logged-out routes ("incomplete") | Not planned |
| X11 Inconsistent "saved" feedback | STILL OPEN | no shared pattern | Not planned |
| X12 Mercedes logo 249 kB PNG | STILL OPEN | 249.48 kB in today's build | PLAN-03 |
| Sign Up consent line | OBSOLETE | decided "left out" on 2026-10-21 | |
| Drivetrain as a select | STILL OPEN | still free text in `CarOnboardingPage.jsx` | Not planned |
| Budget: route chunk at most 60 kB gzip | DONE | largest route chunk is Expenses at 8.76 kB gzip; the shared chart chunk is 103 kB gzip and loads only on Fuel Log and Expenses | |
| Budget: UI library code at most 15 kB gzip | DONE | none used | PLAN-01 removes the last trace |
| Budget: fonts at most 2 files, 80 kB | DONE | 2 files, 47.1 kB | |

### The known open items you listed

| Item | Status | Evidence | In this plan |
|---|---|---|---|
| CAR-63 email reminders | STILL OPEN | nothing built | Decision 1, PLAN-31 |
| Advisor can suggest an irrelevant video | STILL OPEN | first YouTube result is taken unchecked | PLAN-12 |
| "Waking up the server" on slow scans | STILL OPEN | 6 s threshold applies to 25 s vision calls | PLAN-13 |
| No skip-to-content link | STILL OPEN | first Tab stop is the logo on every route | PLAN-18 |
| One Trip Planner 400 never reproduced | STILL OPEN, likely cause found | every maps failure is a 400 and none is logged | PLAN-11 |
| Receipts label singular | STILL OPEN | `RecordPhotos.jsx` | PLAN-09 |
| Outline-button contrast across themes | STILL OPEN, untested | no test covers `.btn-secondary` | PLAN-21 |
| VIN pasted with a leading space | STILL OPEN | `maxLength` cuts the paste before the trim | PLAN-08 |
| Duplicate fill-up (two identical 30 Sep rows) | OBSOLETE as a bug | the two rows belong to two different users and cars, created 26 hours apart. No same-user duplicate exists in any table. The missing guard is real but separate | PLAN-07 |
| Fill-ups and saved trips have no delete | STILL OPEN | no DELETE policy on `fuel_logs`; trips are never read by the frontend at all | PLAN-05, PLAN-06 |
| `check:bundle` false headroom with no `.env` | STILL OPEN, measured | 236.7 kB min / 60.9 kB gzip of false room | PLAN-02 |
| `verify_rls.py` never run | STILL OPEN | | Decision 7, PLAN-15 |
| `sprint-4` lags `dev` | STILL OPEN | 17 behind, 0 ahead | Decision 12 |
| `CLAUDE.md` tracked on `main`, ignored on `dev` | OBSOLETE as stated | `main` stopped tracking it in `ede1439` (2026-10-19). It is still tracked on `sprint-1`, `sprint-2` and `sprint-3` only | Decision 12 |
| Logout POST shows ERR_ABORTED | STILL OPEN, not reproduced | | PLAN-17 |

## Batch 1: budget and build honesty (do first)

Nothing visual can ship until the stylesheet has room. PLAN-01 gets that room by deleting CSS nobody uses, with no budget raise. PLAN-02 and PLAN-03 make the build numbers trustworthy.

### PLAN-01 · Repo health / CSS budget · Remove the unused Tailwind layer to free 6.00 kB of CSS

> **REPLACED: Tailwind is kept, with automatic source scanning turned off (merged on dev). PLAN-01 must not be run. PLAN-04 is only needed if more CSS room is required.**

- **problem:** Tailwind was wired in for shadcn and Aceternity components that were never added (Aceternity is now banned by CLAUDE.md). Tailwind still scans the source and writes about 30 utility classes into the stylesheet because ordinary words in the code look like class names (flex, hidden, container, table, filter, ring). Nothing uses them. They cost 6.00 kB minified and 1.22 kB gzip, which is 24 times the headroom left.
- **evidence:** Build of 2026-11-16: CSS 72,751 B (12,391 gzip); everything from `@layer properties` to the end is Tailwind output: 6,003 B (1,223 gzip). Without it: 66,748 B / 11,168 gzip. Only two emitted names are used as a `className` in JSX (`sr-only`, `hidden`) and both are also defined in `frontend/src/index.css`. `frontend/src/lib/utils.js` (`cn`) has no importer. `frontend/src/tailwind.css` is imported by `frontend/src/main.jsx`; the plugin is in `frontend/vite.config.js`; `frontend/components.json` is the shadcn config. Dead-class scan of `index.css`: 381 classes, 0 dead (14 are built at run time from a modifier), so the hand-written CSS has no cheap deletions.
- **user impact:** Nobody sees a change. Every later visual item becomes possible: headroom goes from 0.25 kB min / 0.61 kB gzip to about 6.25 / 1.83 without raising the budget. First-time visitors download 1.2 kB less.
- **effort:** S, 2 to 3 hours
- **risk:** A Tailwind utility that IS in use somewhere would lose its style. `sr-only` and `hidden` must keep working from `index.css` alone (compare computed styles before and after). `fonts.test.js` or `providerWiring.test.js` may read `tailwind.css` or `main.jsx`. Removing the `@` alias could break an import if anything uses it.
- **budget cost:** CSS about -6.0 kB min / -1.2 kB gzip. JS none (`cn` is tree-shaken today).
- **depends on:** nothing
- **decision needed:** yes (it ends the shadcn CLI route for good; see Decision 2)
- **status:** REPLACED: Tailwind is kept, with automatic source scanning turned off (merged on dev). PLAN-01 must not be run. PLAN-04 is only needed if more CSS room is required.
- **suggested model:** Sonnet (mechanical, but verify carefully)
- **skills:** ponytail:ponytail-audit, code-review
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

DO NOT RUN THIS PROMPT. REPLACED: Tailwind is kept, with automatic source scanning turned off (merged on dev). PLAN-01 must not be run. PLAN-04 is only needed if more CSS room is required. If you were given this prompt, change nothing, say this, and stop.

TASK (PLAN-01): Remove the unused Tailwind layer to free 6.00 kB of CSS
SKILLS: use ponytail:ponytail-audit, code-review. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c chore/remove-unused-tailwind`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Build and measure the CSS file. Confirm a Tailwind block still exists at the end of it (`@layer properties`, `@layer theme`, `@layer utilities`) and note its size in bytes and gzip.
- List every class Tailwind emits. For each one, search `frontend/src` (non-test `.jsx` and `.js`) for a real use as a class name. Expect only `sr-only` and `hidden`, and confirm both have their own rule in `frontend/src/index.css`.
- Confirm nothing imports `frontend/src/lib/utils.js`, and nothing imports through the `@/` alias, and there is no `frontend/src/components/ui/` folder.
- If any Tailwind utility is really in use, stop and tell me which and where.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Before changing anything, take screenshots of Landing, Log In, and the 404 page at 390 px and 1280 px from a production build on a spare port, and record the computed `position`, `width`, `height`, `clip-path` and `display` of one `.sr-only` element and one `.hidden` element.
- Remove the Tailwind import from `frontend/src/main.jsx`, delete `frontend/src/tailwind.css`, remove the `tailwindcss()` plugin and its import from `frontend/vite.config.js`, delete `frontend/src/lib/utils.js` and `frontend/components.json`, and uninstall `tailwindcss`, `@tailwindcss/vite`, `clsx` and `tailwind-merge` with npm so `package-lock.json` stays consistent. Remove the `@` alias only if nothing uses it.
- If `tailwind.css` mapped the brand fonts for Tailwind (`--font-sans`, `--font-display`), those mappings go with it; the page fonts come from `index.css` and `fonts.css` and must not change.
- Update or delete any test that only checked the Tailwind wiring. Do not weaken any other test.
- Do NOT lower the CSS budget in `frontend/scripts/check-bundle.mjs`: the freed room is the point.
- Retake the screenshots and computed styles and compare.

DONE WHEN
- The built CSS has no `@layer` block and is about 6 kB smaller; `check:bundle` passes with the budgets unchanged.
- Screenshots before and after are pixel-identical, and the `.sr-only` and `.hidden` computed styles are unchanged.
- `package.json` no longer lists the four packages, and `npm ci` then `npm run build` works from a clean `node_modules`.

STANDING RULES
- No push, no merge, no pull request. One focused commit on chore/remove-unused-tailwind, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- CSS size before and after in kB (min and gzip), and the new headroom against 73 / 13.
- The list of removed files and packages.
- Screenshot comparison result.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-02 · Process / build · Make the bundle check fail when Supabase is missing from the build

- **problem:** `frontend/src/lib/supabaseClient.js` throws at start-up when the two Supabase variables are missing. The bundler can see that at build time, so with no `.env` it drops the whole Supabase library. The bundle check then measures a build that could never run and reports it as comfortably inside budget. Any CI job without the variables would always pass.
- **evidence:** Measured 2026-11-16 with both variables empty: entry 224.17 kB min / 70.28 kB gzip, against 460.90 / 131.22 with them set. That is 236.7 kB min and 60.9 kB gzip of false headroom. `frontend/scripts/check-bundle.mjs` printed `check-bundle OK` for both.
- **user impact:** You, the day CI is added or you build on a fresh clone: a real budget break would go unnoticed.
- **effort:** S, 1 hour
- **risk:** A marker string that changes with a Supabase upgrade would make the check fail for no reason; pick a stable one and say so in a comment.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** ponytail:ponytail-audit, code-review
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-02): Make the bundle check fail when Supabase is missing from the build
SKILLS: use ponytail:ponytail-audit, code-review. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c chore/bundle-check-honest`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Build once normally and once with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set to empty strings in the shell (process variables override the `.env` file), each into its own folder outside the repository, and run `node scripts/check-bundle.mjs <folder>` on both.
- Confirm the empty build is far smaller and still prints `check-bundle OK`.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- In `frontend/scripts/check-bundle.mjs`, add a check in the same style as the existing Recharts marker: the initial JS must contain a string that only the Supabase client brings (find a stable one in the real build, for example its auth storage key prefix or a GoTrue path). If it is absent, fail with a message that says the build was made without the Supabase variables and its sizes mean nothing.
- Add a short section to the script's header comment explaining why.
- Do not change any budget number.

DONE WHEN
- The normal build passes; the empty-variable build fails with the new message and exit code 1.
- The script's existing output lines are unchanged for a normal build.

STANDING RULES
- No push, no merge, no pull request. One focused commit on chore/bundle-check-honest, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The marker you chose and why it is stable.
- Output of the check for both builds.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-03 · Repo health / dead weight · Shrink the 249 kB Mercedes logo and stop shipping a test file to production

- **problem:** Two leftovers. The Mercedes-Benz badge is a 249 kB PNG shown at badge size, while every other brand mark is a small SVG. And `frontend/public/seoFiles.test.js` sits in the folder Vite copies to the site as-is, so the live site serves a test file.
- **evidence:** Build output: `assets/Mercedes-Benz-Logo-*.png` 249.48 kB, imported by `frontend/src/theme/BrandBadge.jsx`. `docs/UI_AUDIT.md` finding X12 raised it and no ticket picked it up. `frontend/vite.config.js` carries a comment that a local build copies `public/` including a test file into `dist/`; `seoFiles.test.js` is in the scratch build output.
- **user impact:** A Mercedes owner on a phone downloads 249 kB for one small badge on every screen that shows it. The test file is harmless but should not be public.
- **effort:** S, 1 to 2 hours
- **risk:** The badge must look the same at the sizes `BrandBadge` uses. `assetWeight.test.js` guards asset files and may need its list updated. The SEO test must still find `robots.txt` and `sitemap.xml` after it moves.
- **budget cost:** none (images and a test file are outside the JS and CSS budgets)
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** ponytail:ponytail-audit, code-review
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-03): Shrink the 249 kB Mercedes logo and stop shipping a test file to production
SKILLS: use ponytail:ponytail-audit, code-review. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c chore/asset-weight`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Confirm the PNG is still in `frontend/src/assets/` and still imported by `BrandBadge.jsx`, and note its size and pixel dimensions.
- Build into a folder outside the repository and confirm `seoFiles.test.js` is in the output root.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Check whether the `simple-icons` package already used by `BrandBadge.jsx` has a Mercedes mark. If it does, use it the way the other brands do and delete the PNG. If it does not, re-export the PNG at twice the largest size it is ever shown (no new dependency: use a canvas in a throwaway script outside the repository) and aim for under 15 kB.
- Move `frontend/public/seoFiles.test.js` out of `public/` (for example next to `frontend/index.html.test.js`) and fix its paths. Remove the now-unneeded note in `vite.config.js` only if the exclude it explains is no longer needed.
- Two commits are fine here if you prefer (one per fix); say which you chose.

DONE WHEN
- The badge looks the same on the Dashboard hero and the Car Profile at 390 px and 1280 px (screenshots before and after, taken with me logged in).
- The build output no longer contains `seoFiles.test.js`, and the SEO test still runs and passes.

STANDING RULES
- No push, no merge, no pull request. One focused commit on chore/asset-weight, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Old and new size of the Mercedes asset.
- Where the SEO test now lives.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-04 · CSS budget (fallback) · Trim-and-merge pass on index.css, only if PLAN-01 is refused or more room is needed

- **problem:** If Tailwind stays, the only other lever is merging repeated declarations in the 4,234-line `index.css`. It is slow work for a small gain, which is why it is the fallback and not the plan.
- **evidence:** Declaration counts on 2026-11-16: `color: var(--color-text-muted)` 59 times, `border-radius: var(--radius-lg)` 41, `background-color: var(--color-surface)` 32, `box-shadow: 0 2px 8px rgba(43, 43, 43, 0.04)` 18, `font-size: 0.875rem` 42. 18 distinct hex colours used 52 times outside tokens. Gzip already folds repeats, so the honest estimate is 1.5 to 2.5 kB minified but only 0.2 to 0.4 kB gzip. CAR-80 recovered 0.65 kB minified this way.
- **user impact:** Nobody sees a change. Buys roughly one small visual item's worth of room.
- **effort:** M, 4 to 6 hours
- **risk:** High for the gain: merging selectors changes rule order, and order decides which rule wins. Every screen needs a before and after screenshot at both widths.
- **budget cost:** CSS about -1.5 to -2.5 kB min / -0.2 to -0.4 kB gzip (estimate)
- **depends on:** nothing (skip it if PLAN-01 ships)
- **dependency update:** Tailwind is kept, with automatic source scanning turned off (merged on dev). PLAN-01 must not be run. PLAN-04 is only needed if more CSS room is required.
- **decision needed:** yes (only run it if you refuse PLAN-01)
- **suggested model:** Opus (cascade order is subtle)
- **skills:** ponytail:ponytail-audit, code-review
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-04): Trim-and-merge pass on index.css, only if PLAN-01 is refused or more room is needed
SKILLS: use ponytail:ponytail-audit, code-review. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c chore/css-merge-pass`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Check whether PLAN-01 has shipped (no `@layer` block in the built CSS). If it has and headroom is above 3 kB minified, stop and tell me this item is not needed.
- Re-count the repeated declarations in `frontend/src/index.css` and list the ten that would save the most bytes.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Merge only rule groups that share the exact same declarations and sit in the same cascade layer and media context. Replace literal colours and the repeated shadow with existing tokens where a token with that exact value already exists; add at most three new tokens.
- Work in small steps, building and comparing screenshots of all screens at 390 px and 1280 px after each step. Ask me to log in for the logged-in screens.
- Stop when the next merge would save under 100 bytes minified.

DONE WHEN
- Screenshots of every screen are pixel-identical before and after.
- The CSS is at least 1.5 kB smaller minified, with the gzip change reported honestly even if small.

STANDING RULES
- No push, no merge, no pull request. One focused commit on chore/css-merge-pass, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Bytes saved per merge step.
- Any rule you chose not to merge because order mattered.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch 2: your data, your control

Users can add records they can never remove, and one kind of record they can never even see. These items fix that, plus three small input defects from QA.

### PLAN-05 · Data / Fuel Log · Let a user delete their own fill-up

- **problem:** A fill-up saved with a mistake stays forever. There is no delete button, and the database would refuse a delete anyway: `fuel_logs` has policies for reading and inserting only. A wrong fill-up then feeds wrong numbers into the cost-per-month total, the real km/L, and the Trip Planner estimate that uses it.
- **evidence:** `pg_policies` on 2026-11-16: `fuel_logs` has INSERT and SELECT only (every other user table that has a list also has DELETE). `frontend/src/pages/FuelLogPage.jsx` has no delete call (the only `.delete()` calls in the frontend are cars, expenses, maintenance and photos). Live data already holds an entry that cannot be right: 13.69 L for 20 LBP on 2026-10-23 (clearly 20 USD saved as LBP). `backend/scripts/verify_rls.py` section 10 asserts fill-ups allow "no edit/delete", so the script must change with the policy.
- **user impact:** Anyone who mistypes a fill-up or picks the wrong currency: their monthly cost, real fuel economy and trip estimates are wrong from then on, with no way to fix it.
- **effort:** M, 4 to 6 hours
- **risk:** A delete is permanent, so it needs a confirm step. Deleting an odometer reading changes the real km/L and the maintenance due dates that use the latest reading; both must recompute from what is left. The policy must only ever allow a user's own rows.
- **budget cost:** CSS about +0.2 kB min (reuse the Expenses delete button styles). JS about +0.4 kB min in the Fuel Log chunk only.
- **depends on:** nothing (PLAN-15 should run after this, because the policies change)
- **decision needed:** yes (a migration on the live database, and it reverses the earlier no-delete rule; see Decision 4)
- **suggested model:** Opus (database policy and money totals)
- **skills:** mattpocock-skills:tdd, supabase:supabase
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-05): Let a user delete their own fill-up
SKILLS: use mattpocock-skills:tdd, supabase:supabase. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c feat/fuel-log-delete`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Read the live policies for `public.fuel_logs` (SELECT from `pg_policies`). Confirm there is still no DELETE policy.
- Confirm `frontend/src/pages/FuelLogPage.jsx` still has no delete control, and read how `frontend/src/pages/ExpensesPage.jsx` does its delete with a confirm step: copy that pattern, do not invent a new one.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Write the migration file: a DELETE policy on `public.fuel_logs` for the `authenticated` role with `USING ((select auth.uid()) = user_id)`, plus the matching table grant if deletes are not granted. No UPDATE policy: editing stays out (delete and re-add is enough). Include the undo SQL as a comment. Show me and STOP until I say it has been run.
- After I confirm, add a delete control to each row of the fill-up history in `FuelLogPage.jsx`, with the same confirm pattern, wording style and accessible names as the Expenses delete (for example "Delete the fill-up of 23 Oct"). On success remove the row from the list held in state so the chart, the per-liter figures and the real km/L recompute; on failure show a plain message and keep the row.
- Update `backend/scripts/verify_rls.py` section 10: the owner can delete their own fill-up, another user cannot, an anonymous visitor cannot, and nobody can edit one. Do not run the script (it writes to the live project); I decide that in PLAN-15.
- Tests in `FuelLogPage.test.jsx`: delete confirmed, delete cancelled, delete refused by the server, and deleting the only odometer reading.

DONE WHEN
- A user can delete their own fill-up after confirming, and the totals on screen update without a reload.
- The history table still passes axe at 390 px and 1280 px and the new button is reachable by keyboard with a visible focus ring.
- The migration file is in `docs/db_migrations/` and matches what I ran.

STANDING RULES
- No push, no merge, no pull request. One focused commit on feat/fuel-log-delete, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. This item needs a database change. Write the SQL as a new dated file in docs/db_migrations/, show me the full SQL and how to undo it, and STOP. Do not apply it yourself. Go on only after I tell you it has been run. Everything else on Supabase stays read-only (SELECT, schema inspection, get_advisors).
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The exact SQL, and my confirmation that it was run before you built the UI.
- Screenshots of the confirm step at 390 px and 1280 px (ask me to log in).
- What changed in `verify_rls.py`.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-06 · Data / Trip Planner / privacy · Show recent trips with a delete button (trips are saved today but never shown)

- **problem:** Every time someone presses Plan Trip, the backend saves a row with the start address, the destination and the cost. The app never shows those rows anywhere and offers no way to remove them. So the app keeps a growing history of where a user planned to go, which the user cannot see or clear without deleting the whole car.
- **evidence:** `backend/app/routers/trip_planner.py` (`post_estimate`) inserts into `trips` on every call. No file under `frontend/src` reads the `trips` table (search for `from("trips")` finds nothing). Live count on 2026-11-16: 23 trips for 3 users. The database already has SELECT and DELETE policies on `trips` for the owner, so no migration is needed. The Privacy page already says trips are stored.
- **user impact:** Every Trip Planner user. Today they lose each estimate when they leave the page, while their addresses pile up unseen. With the list they can reopen a recent route and remove ones they do not want kept.
- **effort:** M, 5 to 7 hours
- **risk:** The list must only ever show the signed-in user's rows (rely on RLS, and still filter by the selected car). Deleting is permanent: use a confirm step. Trip Planner has the largest test file in the frontend (`TripPlannerPage.test.jsx`), so layout changes can break selectors.
- **budget cost:** CSS about +0.4 kB min (reuse the Expenses list and delete styles). JS about +1 kB min in the Trip Planner chunk only.
- **depends on:** PLAN-01 (needs CSS room)
- **decision needed:** yes (show and delete, or stop saving trips at all; see Decision 5)
- **suggested model:** Opus (touches stored personal data)
- **skills:** mattpocock-skills:tdd, supabase:supabase
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-06): Show recent trips with a delete button (trips are saved today but never shown)
SKILLS: use mattpocock-skills:tdd, supabase:supabase. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c feat/trip-planner-recent-trips`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Confirm `post_estimate` in `backend/app/routers/trip_planner.py` still inserts a `trips` row, and that nothing in `frontend/src` reads `trips`.
- Read the live policies on `public.trips` and confirm the owner can SELECT and DELETE.
- Ask me which option I chose in Decision 5. If I chose "stop saving", do that instead: remove the insert, keep the response shape (use a generated id or drop the field after checking the frontend does not need it), update the backend tests, and leave the table alone.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- On `frontend/src/pages/TripPlannerPage.jsx`, under the form, add a "Recent trips" section for the selected car: the five newest rows (origin, destination, distance, cost through the existing `Price` component, date), read straight from Supabase like the other pages do.
- Each row has a delete button with a confirm step, copied from the Expenses pattern. Add a plain empty state ("No trips planned yet for this car.").
- Choosing a row fills the origin and destination fields and moves focus to the Plan Trip button. It does not re-run the estimate on its own, because each run calls a paid Google API.
- After a successful estimate, add the new trip to the top of the list from the response, without a second request.
- Tests: list shown, empty state, delete confirmed and refused, choosing a row fills the form, and a failed list read shows a plain error while the form still works.

DONE WHEN
- A user sees their last five trips for the selected car and can delete any of them.
- No request to the backend is made by opening the list or choosing a row.
- axe is clean on Trip Planner at both widths; layout shift on the page stays under 0.1.

STANDING RULES
- No push, no merge, no pull request. One focused commit on feat/trip-planner-recent-trips, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Which Decision 5 option you built.
- Screenshots at 390 px and 1280 px with and without trips (ask me to log in).
- CSS and JS cost in kB.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-07 · Data integrity / forms · Stop a double tap from saving the same record twice

- **problem:** The save buttons are disabled through React state, which only takes effect on the next paint. Two taps or an Enter plus a click inside the same moment can both get through and insert two rows. Note the reported duplicate is NOT one of these: see evidence.
- **evidence:** `save()` in `frontend/src/pages/FuelLogPage.jsx` sets `saving` and awaits the insert with no synchronous guard; the same shape is in `ExpensesPage.jsx`, `MaintenancePage.jsx`, `CarOnboardingPage.jsx` and `TripPlannerPage.jsx`. The "two identical 30 Sep rows": the live table has two rows for 2026-09-30 with the same 6.33 L and 10 USD, but they belong to two different users and two different cars and were created 26 hours apart (2026-09-30 11:01 and 2026-10-01 13:24). That is the same fill-up typed into two accounts, not a double submit. No same-user duplicate exists in `fuel_logs`, `car_expenses`, `trips` or `maintenance_records`.
- **user impact:** Rare, but when it happens the user gets a doubled cost (and, once PLAN-05 ships, at least they can delete it). On Trip Planner a double tap also pays for two Google calls.
- **effort:** S, 2 hours
- **risk:** A guard that is not released on every exit path would lock the form. Release it in a `finally`.
- **budget cost:** JS under 0.2 kB min across route chunks. CSS none.
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** mattpocock-skills:tdd
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-07): Stop a double tap from saving the same record twice
SKILLS: use mattpocock-skills:tdd. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/double-submit-guard`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Read the submit handlers in the five pages named above and confirm each still relies only on a state flag.
- Re-run the duplicate check read-only: group `fuel_logs` by user, car, date, liters and cost and look for a count above one.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- In each of the five handlers add a `useRef` flag checked and set synchronously at the top and cleared in `finally`. Do not add a shared hook or helper for five two-line guards.
- Keep the existing `disabled` state so the button still looks busy.
- One test per page: two submits fired in the same tick produce exactly one insert (or one `apiFetch` call on Trip Planner).

DONE WHEN
- Each new test fails without the guard and passes with it.
- No change to what the user sees.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/double-submit-guard, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The result of the duplicate query.
- The five handlers changed.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-08 · Forms / QA defect · A VIN pasted with a space loses its last character

- **problem:** The VIN input stops at 17 characters. The browser applies that limit to pasted text before the app sees it, so a VIN copied with a leading space arrives as a space plus 16 characters. The app then trims the space and reports an invalid VIN, and the user cannot see why.
- **evidence:** `frontend/src/pages/CarOnboardingPage.jsx` and `frontend/src/pages/CarProfilePage.jsx` render the VIN input with `maxLength={VIN_LENGTH}` (17, from `frontend/src/lib/limits.js`) and only trim at save time. Deferred QA finding.
- **user impact:** Anyone pasting a VIN from a document, an email or a registration scan. They see a format error on a VIN that is correct.
- **effort:** S, 1 hour
- **risk:** Stripping must not move the caret oddly while typing; only whitespace is removed.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** mattpocock-skills:tdd
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-08): A VIN pasted with a space loses its last character
SKILLS: use mattpocock-skills:tdd. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/vin-paste-whitespace`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- In a test, paste ` 1HGCM82633A004352` (leading space, 17 real characters) into the VIN field of both forms and confirm the stored value is 16 characters with the last one missing.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- In both forms, handle paste on the VIN input: take the clipboard text, remove all whitespace, cut to 17 characters and set that as the value. Also strip whitespace in the change handler for the VIN field so typed spaces never count. Keep `maxLength`.
- If both pages can share one small function, put it in `frontend/src/lib/limits.js` next to `getVinError`; otherwise keep it inline.
- Tests: leading space, trailing space, spaces in the middle, a 20-character paste, lower case.

DONE WHEN
- Pasting a VIN with spaces anywhere yields the full 17 characters in both forms.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/vin-paste-whitespace, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The paste cases tested.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-09 · Copy / QA defect · Say "Receipts" when an expense can hold three

- **problem:** An expense can hold up to three receipt photos since 2026-10-24, but the label and the table heading still say "Receipt", and the button says "Attach a receipt" even when two are already there.
- **evidence:** `frontend/src/components/RecordPhotos.jsx` sets `noun = isReceipt ? "Receipt" : "Photos"`; the Expenses table heading in `frontend/src/pages/ExpensesPage.jsx` is "Receipt". Deferred QA finding.
- **user impact:** Expenses users: the screen reads as if only one receipt is allowed, so some will not try to add a second.
- **effort:** S, under 1 hour
- **risk:** Tests match these strings; update them, do not loosen them.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** mattpocock-skills:tdd, design:ux-copy
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-09): Say "Receipts" when an expense can hold three
SKILLS: use mattpocock-skills:tdd, design:ux-copy. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/receipts-plural`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Open `RecordPhotos.jsx` and confirm the noun is still singular for receipts, and that the receipt limit is still three.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Use "Receipts" for the noun and the table heading. Button: "Attach a receipt" with none, "Attach another receipt" with one or two, hidden at three (as today). Empty state stays "No receipt attached."
- Keep the existing per-photo accessible names ("Receipt 2 for ...").

DONE WHEN
- With 0, 1, 2 and 3 receipts the label, heading and button read correctly, covered by tests.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/receipts-plural, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The final strings.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch 3: backend cost and correctness

The AI and camera endpoints have daily caps. The one endpoint that costs real money per call does not. This batch closes that and makes maps failures diagnosable.

### PLAN-10 · Backend / money · Daily caps on Trip Planner estimates and the car spec lookup

- **problem:** Every Trip Planner estimate calls Google's Directions API with live traffic, which is billed per call beyond the free monthly credit. Any signed-in user, or a script using their token, can call it in a loop with no limit. The car spec lookup has the same gap: it calls an LLM for the tank size outside the advisor's daily cap.
- **evidence:** `backend/app/routers/trip_planner.py` (`post_estimate`, `post_directions`) and `backend/app/routers/car_specs.py` never call `enforce_usage`. `backend/app/routers/ai_advisor.py` and `fuel_camera.py` do. `api_limits` on the live project holds rows for the existing features only. `post_directions` looks unused by the frontend (the pages call `/trip-planner/estimate` and `/trip-planner/fuel-prices` only).
- **user impact:** You, as the person whose Google Cloud bill and API quota it is. A normal user never reaches a sensible cap.
- **effort:** M, 3 to 5 hours
- **risk:** A cap set too low blocks real use; a wrong failure policy blocks everyone when the counter table hiccups. Trip Planner should fail CLOSED like the camera (it costs money); the spec lookup should fail OPEN and simply return no suggestions (it must never block onboarding).
- **budget cost:** none (backend only; the frontend already shows the backend's 429 message)
- **depends on:** nothing
- **decision needed:** yes (the numbers, and two new rows in a live table; see Decision 6)
- **suggested model:** Opus (money and limits)
- **skills:** mattpocock-skills:tdd, engineering:testing-strategy
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-10): Daily caps on Trip Planner estimates and the car spec lookup
SKILLS: use mattpocock-skills:tdd, engineering:testing-strategy. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c feat/usage-caps-trip-and-specs`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Confirm the two routers still do not call `enforce_usage`, and read `backend/app/services/usage_limiter.py` to see how features are named and limited.
- Read `public.api_limits` (SELECT) and list the features it has.
- Search `frontend/src` for `/trip-planner/directions`. If nothing calls it, plan to delete that endpoint and its tests instead of capping it.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Write a data migration file that adds two `api_limits` rows: `trip_estimate` and `spec_lookup`, each with the per-user daily number I chose in Decision 6 and no global cap. Show me the SQL with its undo and STOP until I say it has been run.
- In `post_estimate`, call `enforce_usage(user_id, "trip_estimate")` after the car is confirmed to belong to the caller and before Google is called. Limit hit: 429 with the limiter's own message. Counter failure: 503 with a plain message (fail closed).
- In the spec lookup endpoint, record usage for `spec_lookup`; on a limit hit or a counter failure, return the normal empty suggestions (fail open, never an error).
- Delete `post_directions`, its request and response models and its tests if nothing uses it.
- Tests: under the cap, at the cap, counter unreachable, for both endpoints.

DONE WHEN
- A user past the cap gets a plain "today's limit" message on Trip Planner and no Google call is made (assert the maps client was not called).
- Car Onboarding still works with the counter table unreachable.

STANDING RULES
- No push, no merge, no pull request. One focused commit on feat/usage-caps-trip-and-specs, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. This item needs a database change. Write the SQL as a new dated file in docs/db_migrations/, show me the full SQL and how to undo it, and STOP. Do not apply it yourself. Go on only after I tell you it has been run. Everything else on Supabase stays read-only (SELECT, schema inspection, get_advisors).
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The SQL and my confirmation it was run.
- The chosen numbers and failure policies.
- Whether `/trip-planner/directions` was removed.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-11 · Backend / error handling · Tell a bad address apart from a maps outage, and log which it was

- **problem:** Every Google Maps failure comes back as HTTP 400 with a route message: a timeout, a quota block, a denied key and a real "no such address" all look the same, and none is logged. That is the most likely source of the Trip Planner 400 that QA saw once and could not reproduce, and today it could not be diagnosed if it happened again.
- **evidence:** `backend/app/services/google_maps.py` raises one `GoogleMapsError` for transport errors, non-OK statuses and no-route statuses, and logs nothing. `backend/app/routers/trip_planner.py` maps every `GoogleMapsError` to 400. Also in `get_route_summary`: reading `duration_in_traffic` happens outside the `try`, so an odd response shape would become a 500.
- **user impact:** A user on a bad day sees "Could not calculate a route for the given addresses" for addresses that are fine, and retyping does not help. You cannot tell from the logs what happened.
- **effort:** S, 2 hours
- **risk:** The frontend shows the backend's `detail` text; the wording for a real bad address must stay as it is. Do not log the request URL (it carries the API key).
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Opus (error handling logic)
- **skills:** mattpocock-skills:tdd, mattpocock-skills:diagnosing-bugs
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-11): Tell a bad address apart from a maps outage, and log which it was
SKILLS: use mattpocock-skills:tdd, mattpocock-skills:diagnosing-bugs. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/maps-error-status`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Read `get_route_summary` and confirm one exception type still covers all failures and nothing is logged.
- Confirm `post_estimate` still returns 400 for every `GoogleMapsError`.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Give `GoogleMapsError` a flag (or add one subclass) that says whether the fault is the user's addresses or the service. `NOT_FOUND` and `ZERO_RESULTS` are the user's; transport errors, HTTP errors and every other status are the service's.
- Log the Google status string and the HTTP status at warning level for service faults. Never log the URL, the key or the addresses.
- Router: user fault stays 400 with today's wording; service fault becomes 503 with "The maps service is not answering right now. Please try again in a minute."
- Move the `duration_in_traffic` read inside the guarded block.
- Tests for each status family and for a response with no `duration_in_traffic`.

DONE WHEN
- A simulated `OVER_QUERY_LIMIT` gives 503 and one log line with the status; a simulated `ZERO_RESULTS` still gives 400 with the old message.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/maps-error-status, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The status-to-response table you implemented.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-12 · Backend / AI Advisor · Only attach a DIY video that is plausibly about the problem

- **problem:** For a DIY answer the backend searches YouTube with the car and the first 100 characters of what the user typed, then attaches whatever comes first. Nothing checks that the video is about cars or about this problem, so an unrelated video can appear under safety advice.
- **evidence:** `backend/app/services/youtube_client.py`: `search_diy_video` asks for one result (`maxResults: 1`), with no category filter and no check on the title. 13 saved advisor replies carry a video. Deferred QA finding.
- **user impact:** A user following a DIY answer may be sent to a video that has nothing to do with their problem, under a heading that looks like a recommendation.
- **effort:** S to M, 2 to 3 hours
- **risk:** Filtering too hard means fewer videos; that is the safer side. Quota: a search costs 100 units whatever `maxResults` is, so asking for five costs nothing more.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Opus (matching logic, safety-adjacent)
- **skills:** mattpocock-skills:tdd, engineering:testing-strategy
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-12): Only attach a DIY video that is plausibly about the problem
SKILLS: use mattpocock-skills:tdd, engineering:testing-strategy. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/advisor-video-relevance`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Read `search_diy_video` and confirm it still takes the first result unchecked.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Ask YouTube for five results restricted to the Autos and Vehicles category (`videoCategoryId` 2), keeping safe search.
- Accept the first result whose title shares at least one meaningful word with the description (ignore short and common words, compare case-insensitively) or names the car's make or model. If none qualifies, return no video.
- Keep the function's contract: it never raises and returns `None` freely.
- Tests: a matching title, no matching title, a title matching only the make, an empty result list, a non-English description.

DONE WHEN
- With a result list whose first title is unrelated and whose third matches, the third is returned; with none matching, no video is attached.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/advisor-video-relevance, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The matching rule in one sentence, and three real examples of query, titles and the pick (use made-up data, do not call the live API).
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-13 · Frontend / feedback · Do not say "waking up the server" during a normal photo scan

- **problem:** The banner appears whenever any backend call takes over six seconds. A photo scan waits on an AI vision call that can take up to 25 seconds while the server is fully awake, so the banner gives a wrong reason for the wait.
- **evidence:** `frontend/src/lib/coldStart.js`: `COLD_START_THRESHOLD_MS = 6000`, applied to every `apiFetch` call in `frontend/src/lib/apiClient.js`. `frontend/src/lib/scanPhoto.js` sends scans through `apiFetch`. The backend's vision timeout is 25 seconds (`_call_gemini_vision` in `backend/app/services/llm_client.py`). Each scan button already shows its own "reading" state. Deferred QA finding.
- **user impact:** Anyone scanning a pump, an odometer or a warning light on a slow connection is told the server is asleep when it is not.
- **effort:** S, 1 hour
- **risk:** A real cold start during a scan would then show no banner; the scan button's own busy state still covers it.
- **budget cost:** JS under 0.1 kB min. CSS none.
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** mattpocock-skills:tdd, engineering:testing-strategy
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-13): Do not say "waking up the server" during a normal photo scan
SKILLS: use mattpocock-skills:tdd, engineering:testing-strategy. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/cold-start-banner-scans`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Confirm `scanPhoto` still calls `apiFetch` and `apiFetch` still tracks every request for the banner.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Add one option to `apiFetch` that skips cold-start tracking, and pass it from `scanPhoto`. Nothing else changes.
- Tests: a slow scan does not raise the banner; a slow ordinary call still does.

DONE WHEN
- The two tests pass and `ColdStartBanner.test.jsx` is unchanged and green.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/cold-start-banner-scans, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The option name.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch 4: security proof

The code review found no injection, no leaked secret, no raw error text and no route without a token check. What is missing is proof on the live system and a few settings outside the code.

### PLAN-14 · Security / hosting · Add security headers to the Netlify site

- **problem:** The site sends no security headers. Another site could load CarSage in a hidden frame, and there is no Content Security Policy to limit where scripts and data may go if something ever slips through.
- **evidence:** `frontend/public/_headers` holds only the cache rule for `/assets/*`. `headers.test.js` covers that file.
- **user impact:** No visible change. It closes clickjacking and narrows the damage of any future script injection.
- **effort:** S to M, 2 to 3 hours
- **risk:** A wrong Content Security Policy silently breaks sign-in, Google sign-in, address suggestions, the route map or the YouTube thumbnails. Ship it as `Content-Security-Policy-Report-Only` first.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Opus (security)
- **skills:** security-review
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-14): Add security headers to the Netlify site
SKILLS: use security-review. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c feat/security-headers`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Read `frontend/public/_headers` and confirm it still sets only `Cache-Control`.
- List every outside origin the frontend talks to by searching `frontend/src` for `https://` (expect Supabase, the API base URL, `places.googleapis.com`, `maps.googleapis.com`, YouTube thumbnail and link hosts, Google sign-in).
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- For all paths add: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, and a `Permissions-Policy` that turns off what the app does not use (keep the camera allowed for this origin: photo scans use file inputs that can open the camera).
- Add a `Content-Security-Policy-Report-Only` header: `default-src 'self'`, with `connect-src`, `img-src`, `font-src`, `style-src`, `script-src` and `frame-ancestors 'none'` listing exactly the origins found. The API origin differs per environment, so document in a comment which line to edit.
- Extend `headers.test.js` to pin the new lines.
- Serve a production build on a spare port with the same headers applied and walk Landing and Log In with the browser console open; ask me to log in and walk Trip Planner, AI Advisor and Fuel Log. List every report-only violation.

DONE WHEN
- The headers are in `_headers`, the test pins them, and the walk shows no violation that would break a feature once the policy is enforced.

STANDING RULES
- No push, no merge, no pull request. One focused commit on feat/security-headers, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The full header block.
- Any violation seen and what it would have blocked.
- What I must do later to switch from report-only to enforcing.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-15 · Security / RLS · Run the live RLS re-test once and record the result

- **problem:** `backend/scripts/verify_rls.py` is the only thing that proves one user cannot read or change another user's rows through the real API. It has never been run. All 1869 frontend tests replace Supabase with a fake, so row-level security has no automated proof at all.
- **evidence:** Known open item. The script's header says it creates two throwaway users on the live project, seeds rows, checks 14 groups of rules and deletes everything. Read-only review on 2026-11-16: all 16 public tables have RLS on; every user table's policies compare `auth.uid()` to the owner; the five tables with RLS and no policy are the service-only ones, as intended.
- **user impact:** Every user: this is the check that their cars, costs, chats and photos are private.
- **effort:** S, 1 hour plus your time watching it
- **risk:** It writes to production: two users, a few rows, a few files, all deleted at the end. If it dies half way it can leave test users behind; the report must list anything left over so you can remove it in the Supabase dashboard.
- **budget cost:** none
- **depends on:** PLAN-05 if you approve it (run after the policy change, so one run covers both)
- **decision needed:** yes (it creates and deletes data on the live project; see Decision 7)
- **suggested model:** Opus (security)
- **skills:** security-review, supabase:supabase
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-15): Run the live RLS re-test once and record the result
SKILLS: use security-review, supabase:supabase. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c chore/verify-rls-run`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Read the whole of `backend/scripts/verify_rls.py`. Confirm every row and user it creates is deleted in a `finally` path, and list anything that is not.
- Compare its checks with the live policies (SELECT from `pg_policies`) and tell me about any table or rule it does not cover.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Do not run the script until I say "run it" in this session. First give me the read-through findings above.
- This is the one item where Supabase is not read-only, and only through this script, only after my go-ahead.
- When I say so, run it from `backend/` with the project's virtual environment. Do not print any key.
- Afterwards check read-only that no user whose email matches the script's throwaway pattern is left, and that `storage_cleanup_queue` is empty.
- Save the pass and fail summary (no keys, no ids) as a short dated section at the end of `docs/IMPROVEMENT_PLAN.md`. That is the only file change, plus FILE_INDEX.

DONE WHEN
- The script exits 0, or every failure is explained to me in plain words with the table and rule involved.
- No throwaway user or row is left on the live project.

STANDING RULES
- No push, no merge, no pull request. One focused commit on chore/verify-rls-run, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Coverage gaps found before the run.
- The summary line for each of the script's sections.
- Anything left behind.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-16 · Security / settings outside the code · Dashboard settings checklist: passwords, Google key limits, spending cap

- **problem:** Three protections live in dashboards, not in the code, and nothing shows they are set: Supabase's leaked-password check is off, and nobody has confirmed that the browser Google key is locked to this site or that Google Cloud has a spending cap.
- **evidence:** Supabase security advisor, 2026-11-16: `auth_leaked_password_protection` WARN (https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). `frontend/.env.example` says the browser key `VITE_GOOGLE_MAPS_API_KEY` must be restricted by HTTP referrer; that key is visible in the page source and in every route map image URL.
- **user impact:** You: an unrestricted browser key can be copied and used on someone else's site at your cost. Users: a password known from a breach is accepted today.
- **effort:** S, 30 minutes of your time
- **risk:** A referrer restriction that leaves out an address you use (for example a Netlify preview address) breaks address suggestions and the route map there.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** yes (only you can change these; leaked-password protection may need a paid Supabase plan)
- **suggested model:** Sonnet (it is a guided checklist; I do the clicks)
- **skills:** security-review, supabase:supabase
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-16): Dashboard settings checklist: passwords, Google key limits, spending cap
SKILLS: use security-review, supabase:supabase. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c docs/security-settings-checklist`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Run the Supabase security advisor (read-only) and tell me whether the leaked-password warning is still listed.
- Search the code for where the browser Maps key is used and list which Google APIs it needs (expect Places API (New) and Maps Static API only).
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Walk me through, one step at a time and waiting for my answer each time: (1) turning on leaked-password protection in Supabase Auth settings, or noting that my plan does not offer it; (2) checking the browser key's HTTP referrer list and its API restriction list in Google Cloud; (3) checking that the backend key is a different key, restricted to the Directions API; (4) setting a budget alert or quota cap for the Maps APIs.
- You change nothing yourself. Record my answers as a dated checklist section at the end of `docs/IMPROVEMENT_PLAN.md`.

DONE WHEN
- Each of the four points is recorded as done, not available, or declined with my reason.

STANDING RULES
- No push, no merge, no pull request. One focused commit on docs/security-settings-checklist, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The four answers.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-17 · Auth / investigation · Find out why the logout request shows ERR_ABORTED, and whether the session is really ended

- **problem:** On Log Out the browser's network log shows the logout request as aborted. If the request never reaches Supabase, the device is signed out locally but the refresh token stays valid on the server until it expires.
- **evidence:** Known open item. `handleLogOut` in `frontend/src/components/SiteNav.jsx` awaits `signOut()` from `frontend/src/auth/AuthContext.jsx` (a plain `supabase.auth.signOut()`), then navigates to `/login`. Not reproduced in this planning session (see "What could not be verified").
- **user impact:** Someone logging out on a shared computer expects the session to be dead everywhere. If the server never hears about it, a copied token would still work for a while.
- **effort:** S, 1 to 2 hours
- **risk:** Low. Do not change sign-out scope without telling me: the default ends this session everywhere, `local` would end it only in this browser.
- **budget cost:** none expected
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Opus (auth)
- **skills:** security-review, mattpocock-skills:diagnosing-bugs
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-17): Find out why the logout request shows ERR_ABORTED, and whether the session is really ended
SKILLS: use security-review, mattpocock-skills:diagnosing-bugs. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/logout-request-aborted`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Serve a production build on a spare port, ask me to log in, then record the network log while I press Log Out. Note the status of the `/auth/v1/logout` request and what triggered any abort (a navigation, a second auth event, a component unmount).
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- If the request completes with 204 and the abort is only a duplicate or a cancelled follow-up, change nothing and report that.
- If the real request is aborted, find what cancels it (most likely something reacting to the signed-out state before the call returns) and make the logout call finish first. Add a test that the navigation happens only after `signOut` resolves.
- Either way, prove the outcome: `backend/scripts/verify_backend_auth.py` already checks "a token reused after sign-out"; read it and tell me whether running it would settle this (do not run it without my OK, it creates a throwaway user).

DONE WHEN
- I have a clear answer: the server session is ended on logout, with the evidence.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/logout-request-aborted, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The network log for the logout click.
- Root cause, or why no change was needed.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch 5: accessibility quick wins

The logged-out screens are in good shape: axe (WCAG 2.0, 2.1 and 2.2 A and AA) found 0 violations on all eight routes at both widths on 2026-11-16, with no horizontal overflow. These are the gaps that automated checks do not catch. The old audits already cover the rest: see `docs/UI_AUDIT.md` ("Cross-cutting findings") and `docs/UI_TICKETS.md` (T6, T19).

### PLAN-18 · Accessibility / keyboard · Add a skip-to-content link

- **problem:** A keyboard or screen-reader user must step through the logo and every header link on every page before reaching the content. Signed in, that is seven or more stops each time.
- **evidence:** Tab walk on 2026-11-16: first stops on every route are "CarSage home", then the header links (C:\Users\user\AppData\Local\Temp\claude\61893868b36ee469\f539b938-2d6c-46ba-8fef-a25336178ddd\scratchpad\shots\report-out.json). No "skip" text exists anywhere in `frontend/src`. `frontend/src/App.jsx` renders `<main className="app-main">` with no id.
- **user impact:** Keyboard and screen-reader users, on every page load.
- **effort:** S, 1 hour
- **risk:** The link must not shift the layout when it appears (position it over the header) and must not sit under the sticky header.
- **budget cost:** CSS about +0.15 kB min. JS under 0.1 kB min in the entry chunk.
- **depends on:** PLAN-01 (needs CSS room)
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** design:accessibility-review, browser-automation
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-18): Add a skip-to-content link
SKILLS: use design:accessibility-review, browser-automation. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c feat/skip-link`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Search `frontend/src` for a skip link and confirm there is none.
- Confirm the header is still the first focusable region in `App.jsx`.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Add `<a class="skip-link" href="#main">Skip to content</a>` as the first element inside the app shell in `App.jsx`, and give `<main>` `id="main"` and `tabIndex={-1}` so focus really moves.
- CSS: hidden off-screen until focused, then fixed at the top left above the header, with the standard focus ring and at least 4.5:1 contrast on every car theme. No transition is needed.
- Tests: it is the first Tab stop, and activating it moves focus to `main`. Check Landing layout shift at 390 px is unchanged.

DONE WHEN
- First Tab on any route lands on the skip link and Enter moves focus into the content.

STANDING RULES
- No push, no merge, no pull request. One focused commit on feat/skip-link, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- CSS cost in bytes.
- A screenshot of the focused link at 390 px.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-19 · Accessibility / navigation · Give every screen its own page title (UI_TICKETS T9)

- **problem:** Every route has the same browser title, so tabs, history and screen-reader page announcements cannot tell Fuel Log from Expenses.
- **evidence:** All 16 logged-out checks on 2026-11-16 returned the title "CarSage: The Mindful Driver's Co-Pilot" (C:\Users\user\AppData\Local\Temp\claude\61893868b36ee469\f539b938-2d6c-46ba-8fef-a25336178ddd\scratchpad\shots\report-out.json). Acceptance criteria already written in `docs/UI_TICKETS.md`, section "T9. Per-route page titles"; never built.
- **user impact:** Screen-reader users on every navigation; anyone with two CarSage tabs open.
- **effort:** S, 1 hour
- **risk:** `frontend/index.html.test.js` and the SEO tests pin the default title in `index.html`; leave that default alone.
- **budget cost:** JS about +0.2 kB min in the entry chunk. CSS none.
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** design:accessibility-review, browser-automation
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-19): Give every screen its own page title (UI_TICKETS T9)
SKILLS: use design:accessibility-review, browser-automation. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c feat/route-titles`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Search `frontend/src` for `document.title`; confirm nothing sets it.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Follow `docs/UI_TICKETS.md` T9 exactly. Set the title in one place from the current route (a small map of path to name inside `App.jsx` is enough; do not add a hook file per page). Format "Fuel Log · CarSage"; Landing keeps the default.
- One test that walks the routes and checks each title, including the 404 page.

DONE WHEN
- All 13 screens have distinct titles that update on in-app navigation.

STANDING RULES
- No push, no merge, no pull request. One focused commit on feat/route-titles, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The path-to-title table.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-20 · Accessibility / keyboard · Show a focus ring on the photo pickers (UI_TICKETS T19)

- **problem:** The photo and scan buttons are labels wrapped around a hidden file input. Keyboard focus lands on the hidden input, so nothing on screen shows where focus is.
- **evidence:** `docs/UI_AUDIT.md` (Car Onboarding, Fuel Log, Expenses: "hidden file inputs receive focus with no visible ring"). Ticket written in `docs/UI_TICKETS.md`, section "T19"; never built: no `:has(input:focus-visible)` rule exists in `frontend/src/index.css`.
- **user impact:** Keyboard users on Car Onboarding, Car Profile, Fuel Log, Maintenance, Expenses and AI Advisor lose track of focus at each photo control.
- **effort:** S, 1 hour
- **risk:** CSS only, no JSX change in photo components (that boundary needs your OK and this item does not cross it).
- **budget cost:** CSS about +0.1 kB min. JS none.
- **depends on:** PLAN-01 (needs CSS room)
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** design:accessibility-review, browser-automation
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-20): Show a focus ring on the photo pickers (UI_TICKETS T19)
SKILLS: use design:accessibility-review, browser-automation. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/file-input-focus-ring`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Ask me to log in, Tab through Fuel Log and Expenses on a spare port, and log each stop that has no visible outline or shadow.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Follow `docs/UI_TICKETS.md` T19: one rule in `index.css` giving the wrapping label the standard focus ring when its hidden input has `:focus-visible`. Add the selector to `accessibilityCss.test.js` so it cannot be removed unnoticed.

DONE WHEN
- The Tab walk logs no stop without a ring on the six screens.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/file-input-focus-ring, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Tab-walk log before and after.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-21 · Accessibility / contrast · Test outline and secondary buttons on every car theme, then fix what fails

- **problem:** The contrast tests cover accent text, text on accent fills, status badges and icon tiles on all nine themes. Outline and secondary buttons were never included, so nobody knows whether they pass on each theme.
- **evidence:** Known open item. `frontend/src/theme/themeContrast.test.js` has no case for `.btn-secondary`, `.btn-secondary--sm` or `.dashboard-action--outline`. `.btn-secondary` is `--color-text` on `--color-input-bg` with no border, which `docs/UI_TICKETS.md` (T3 implementation note) already measured as a 1.17:1 edge against the page: the button's shape is nearly invisible, only its text shows.
- **user impact:** Low-vision users may not see that "See how it works", "Request a new link" or the Dashboard's secondary actions are buttons at all.
- **effort:** S to M, 2 to 3 hours
- **risk:** A visible border on every secondary button is a small visual change on every screen: show me before and after.
- **budget cost:** CSS about +0.1 to 0.2 kB min. JS none.
- **depends on:** PLAN-01 (needs CSS room)
- **decision needed:** yes (a border on secondary buttons is a visible design change)
- **suggested model:** Opus (contrast maths across nine themes)
- **skills:** design:accessibility-review, browser-automation
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-21): Test outline and secondary buttons on every car theme, then fix what fails
SKILLS: use design:accessibility-review, browser-automation. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/outline-button-contrast`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Add the failing test first: for each theme in `frontend/src/theme/carBrandThemes.js` plus the default, compute text-on-fill contrast (needs 4.5:1) and button-edge-against-page contrast (needs 3:1) for the three button classes. Show me the table before fixing anything.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Fix only what the table shows failing. Prefer one token-based 1 px border in a colour that reaches 3:1 on every theme over per-theme overrides.
- Keep the test in the suite.
- Screenshots of Landing, the reset page and the Dashboard (ask me to log in) before and after, at both widths.

DONE WHEN
- The new test passes on all themes for all three classes.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/outline-button-contrast, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The contrast table before and after.
- Before and after screenshots.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-22 · Performance / layout shift · Check and fix the layout jump on the reset page and on a signed-out redirect

- **problem:** Two logged-out paths showed a large layout shift in a single measurement: opening the reset-password page without a valid link, and opening a protected page while signed out (which redirects to Log In). Both likely paint a placeholder first and then swap in a card of a different height, pushing the footer.
- **evidence:** Single run each on a production build, 2026-11-16: `/reset-password` 0.24 at 1280 px and 0.40 at 390 px; `/dashboard` signed out, landing on `/login`, 2.62 at 390 px and 0 at 1280 px. Landing was 0.014 at 390 px, well inside the 0.1 rule. One run is not proof: the 2.62 figure in particular may be a measuring artefact (C:\Users\user\AppData\Local\Temp\claude\61893868b36ee469\f539b938-2d6c-46ba-8fef-a25336178ddd\scratchpad\shots\report-out.json).
- **user impact:** Someone opening an expired reset link, or a bookmarked Dashboard link after their session ended, sees the page jump as it settles.
- **effort:** S to M, 2 to 4 hours
- **risk:** `ProtectedRoute` and `RouteLoading` were tuned in CAR-74 for the signed-in Dashboard; do not regress that (re-measure it).
- **budget cost:** CSS about +0.1 kB min. JS none.
- **depends on:** PLAN-01 (needs CSS room)
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** design:accessibility-review, browser-automation
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-22): Check and fix the layout jump on the reset page and on a signed-out redirect
SKILLS: use design:accessibility-review, browser-automation. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c fix/logged-out-layout-shift`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Measure layout shift five times each, on a production build on a spare port, for: `/reset-password` with no token, and `/dashboard`, `/fuel-log` signed out, at 390 px and 1280 px. Report the median. If every median is under 0.1, change nothing and stop.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Find which element moves (use the layout-shift entries' sources). Reserve the final card height in the checking state of `ResetPasswordPage.jsx`, and make the signed-out redirect in `ProtectedRoute.jsx` not paint a full-height skeleton that is then replaced by a shorter page.
- Re-measure the signed-in Dashboard at 390 px (ask me to log in) to confirm it is still near 0.

DONE WHEN
- Median layout shift under 0.1 on all measured paths, and Landing at 390 px unchanged.

STANDING RULES
- No push, no merge, no pull request. One focused commit on fix/logged-out-layout-shift, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The five-run table before and after.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch 6: screens (still-open UI tickets, re-scoped)

These are the still-open tickets from `docs/UI_TICKETS.md` that are worth doing. Their acceptance criteria are already written there and are not repeated here. Each one needs CSS room from PLAN-01. Screenshots for the logged-in screens could not be taken in this session (see "What could not be verified"), so each prompt starts by taking them.

### PLAN-23 · UI / AI Advisor · Make the advisor's verdict the most visible thing in each reply (UI_TICKETS T16, part 1)

- **problem:** "See a mechanic" or "DIY fixable" is the safety answer the whole screen exists for, and it is still the smallest text in each reply: a 12 px upper-case chip above the paragraph.
- **evidence:** `.advisor-badge` in `frontend/src/index.css`: `font-size: 0.75rem`, `text-transform: uppercase`. CAR-81 gave the chips fixed colours and icons but left their size to T16 (`docs/DESIGN_PASS_2.md`, D7 implementation note). The other half of T16 is already done: `.advisor-input-row` is `position: sticky`, and example chips exist (`advisor-example-chip`), so T21 is covered too.
- **user impact:** Every advisor user, on every reply. A reader skimming a long reply can miss that the answer was "see a mechanic".
- **effort:** M, 3 to 4 hours
- **risk:** `AIAdvisorPage.test.jsx` matches the badge text. `AIAdvisorPage.jsx` holds photo markup: do not touch `PhotoScan` or the photo notes.
- **budget cost:** CSS about +0.4 kB min. JS none.
- **depends on:** PLAN-01
- **decision needed:** no (the ticket was approved on 2026-10-21; wording of the two verdict labels stays as it is unless I say otherwise)
- **suggested model:** Opus (safety-advice hierarchy)
- **skills:** design:design-critique, browser-automation, impeccable
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-23): Make the advisor's verdict the most visible thing in each reply (UI_TICKETS T16, part 1)
SKILLS: use design:design-critique, browser-automation, impeccable. If one is not installed, say so in the report and carry on.
Use Impeccable's critique and polish only; do not sign in, do not run live mode.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c ui/advisor-verdict-banner`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Ask me to log in on a spare port and screenshot `/advisor` with at least one DIY and one mechanic reply at 390 px and 1280 px. Confirm the verdict chip is still 12 px upper case.
- Read `docs/UI_TICKETS.md`, section "T16", and `docs/DESIGN_PASS_2.md`, D7 note, for the criteria and the fixed colour pairs.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Build T16 acceptance criterion 1 only: the verdict becomes a full-width banner at the top of each AI reply, icon plus words, at least 16 px, sentence case, using the CAR-81 colour pairs, at least 4.5:1 on every theme.
- Criterion 3 (the "Change" link's target height and colour) is in scope. Criterion 2 is already built; verify it and leave it.
- Add the banner to `themeContrast.test.js` or `statusColours.test.js`.

DONE WHEN
- The verdict is the first and largest element of each reply at both widths; axe is clean; tests green.

STANDING RULES
- No push, no merge, no pull request. One focused commit on ui/advisor-verdict-banner, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Before and after screenshots at both widths.
- CSS cost.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-24 · UI / Fuel Log · Fuel Log on a phone: readable history and one privacy notice (UI_TICKETS T17)

- **problem:** On a phone the fill-up history is a 962 px table inside a 390 px screen with no sign that more columns exist, and the same four-line privacy notice appears under both scan cards, making the form very tall.
- **evidence:** `docs/UI_AUDIT.md`, "9. Fuel Log". Ticket in `docs/UI_TICKETS.md`, section "T17"; not built: `GEMINI_PRIVACY_NOTICE` is still rendered by `FuelLogPage.jsx` and by `OdometerScanButton.jsx`, the page still has both "Fill-Up History for ..." and a caption "Fill-ups for ...", and there is no stacked-row layout for `.fuel-log-table`.
- **user impact:** Every Fuel Log user on a phone, which is where a fill-up is logged.
- **effort:** M, 3 to 4 hours
- **risk:** Photo-adjacent markup: T17 needs your explicit OK before the scan cards are touched. The notice wording must not change by one character.
- **budget cost:** CSS about +0.5 kB min. JS none.
- **depends on:** PLAN-01; do PLAN-05 first if approved (it adds a delete button to the same rows)
- **decision needed:** yes (photo-adjacent markup, as T17 says)
- **suggested model:** Sonnet
- **skills:** design:design-critique, browser-automation, impeccable
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-24): Fuel Log on a phone: readable history and one privacy notice (UI_TICKETS T17)
SKILLS: use design:design-critique, browser-automation, impeccable. If one is not installed, say so in the report and carry on.
Use Impeccable's critique and polish only; do not sign in, do not run live mode.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c ui/fuel-log-mobile`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Ask me to log in and screenshot `/fuel-log` at 390 px. Confirm the table still overflows its wrapper and the notice still appears twice.
- Read `docs/UI_TICKETS.md`, section "T17".
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Build T17 as written. Add a test that the notice text appears exactly once on the page and equals `GEMINI_PRIVACY_NOTICE` character for character.

DONE WHEN
- T17's three criteria hold at 390 px; the table is unchanged at 1280 px.

STANDING RULES
- No push, no merge, no pull request. One focused commit on ui/fuel-log-mobile, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Before and after screenshots at 390 px.
- Page height before and after.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-25 · UI / Car Profile · Car Profile: title first, "Not set" for blanks, delete in its own danger area (UI_TICKETS T12)

- **problem:** The page opens with a dropdown instead of a title, shows a bare dash for empty specs, and puts "Delete Car" as a red link right under the card with nothing separating it from normal actions.
- **evidence:** `docs/UI_AUDIT.md`, "6. Car Profile". Ticket in `docs/UI_TICKETS.md`, section "T12"; not built: neither "Not set" nor a danger area exists in `frontend/src/pages/CarProfilePage.jsx`.
- **user impact:** Every car owner; the delete link is one slip away from the Edit button on a phone.
- **effort:** M, 3 to 4 hours
- **risk:** `CarProfilePage.test.jsx` queries the spec rows. Do not touch the photo upload and remove code.
- **budget cost:** CSS about +0.4 kB min. JS none.
- **depends on:** PLAN-01
- **decision needed:** no (approved 2026-10-21)
- **suggested model:** Sonnet
- **skills:** design:design-critique, browser-automation, impeccable
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-25): Car Profile: title first, "Not set" for blanks, delete in its own danger area (UI_TICKETS T12)
SKILLS: use design:design-critique, browser-automation, impeccable. If one is not installed, say so in the report and carry on.
Use Impeccable's critique and polish only; do not sign in, do not run live mode.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c ui/car-profile-layout`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Ask me to log in and screenshot `/cars/mine` at both widths; confirm the three points above still hold.
- Read `docs/UI_TICKETS.md`, section "T12".
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Build T12 as written, using existing card and button classes; do not create new shared components for it.

DONE WHEN
- T12's four criteria hold; the delete confirm flow is unchanged; axe is clean.

STANDING RULES
- No push, no merge, no pull request. One focused commit on ui/car-profile-layout, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Before and after screenshots.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-26 · UI / Trip Planner · Trip Planner on desktop: results beside the form (UI_TICKETS T14)

- **problem:** On a wide screen the form uses the left 480 px and the rest is empty until a result appears below the fold.
- **evidence:** `docs/UI_AUDIT.md`, "7. Trip Planner". Ticket in `docs/UI_TICKETS.md`, section "T14"; not built (no results placeholder text exists in `TripPlannerPage.jsx`).
- **user impact:** Desktop users of a core feature: they must scroll to see the answer they asked for.
- **effort:** M, 4 to 5 hours
- **risk:** The highest test risk in the frontend: `TripPlannerPage.test.jsx` has many selector-based queries. If PLAN-06 ships first, the recent-trips list must find a place in the new layout.
- **budget cost:** CSS about +0.5 kB min. JS none.
- **depends on:** PLAN-01; coordinate with PLAN-06
- **decision needed:** no (approved 2026-10-21)
- **suggested model:** Sonnet
- **skills:** design:design-critique, browser-automation, impeccable
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-26): Trip Planner on desktop: results beside the form (UI_TICKETS T14)
SKILLS: use design:design-critique, browser-automation, impeccable. If one is not installed, say so in the report and carry on.
Use Impeccable's critique and polish only; do not sign in, do not run live mode.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c ui/trip-planner-two-columns`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Ask me to log in and screenshot `/trip-planner` at 1280 px before and after planning one trip I choose. Confirm the single-column layout.
- Read `docs/UI_TICKETS.md`, section "T14".
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Build T14 as written. Use plain existing classes for the empty and loading states (the shared `EmptyState` and `Skeleton` components T14 mentions were never built; do not build them for this).

DONE WHEN
- T14's four criteria hold at 1280 px; 390 px is unchanged.

STANDING RULES
- No push, no merge, no pull request. One focused commit on ui/trip-planner-two-columns, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Before and after screenshots at 1280 px.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-27 · Copy · Bring the footer, the search description and the README up to date with what the app does

- **problem:** Three places still describe the app as trips plus AI advice only, from before Fuel Log, Maintenance and Expenses existed. Landing also mixes two capitalisation styles in one row of headings.
- **evidence:** `frontend/src/components/SiteFooter.jsx`: "Your everyday car companion: trip planning and AI-powered advice, all in one place." `frontend/index.html` description and Open Graph description: "Plan trips with real-world fuel cost estimates, and get clear DIY-or-mechanic guidance". `README.md` "Main features" lists five features and its "Supporting screens" line omits Maintenance and Expenses. Landing trust row: "Transparent Estimates", "Privacy First" in title case next to "Plain answers" in sentence case (C:\Users\user\AppData\Local\Temp\claude\61893868b36ee469\f539b938-2d6c-46ba-8fef-a25336178ddd\scratchpad\shots\out-_-1280.png).
- **user impact:** New visitors and anyone seeing a shared link: the preview undersells the app. Graders and future readers of the README.
- **effort:** S, 1 to 2 hours
- **risk:** `index.html.test.js`, `seoFiles.test.js`, `noEmDash.test.js` and `backend/tests/test_readme.py` pin some of this text.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** yes (wording is yours to approve)
- **suggested model:** Sonnet
- **skills:** design:ux-copy, impeccable, browser-automation
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-27): Bring the footer, the search description and the README up to date with what the app does
SKILLS: use design:ux-copy, impeccable, browser-automation. If one is not installed, say so in the report and carry on.
Use Impeccable's critique and polish only; do not sign in, do not run live mode.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c copy/footer-meta-readme`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Read the three files and confirm the old wording is still there.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Show me the proposed wording first and wait for my OK before editing. Starting proposals: footer "Your everyday car companion: trips, fuel, service and costs in one place."; description "Everything about your car in one place. Plan trips by real fuel cost, log fill-ups, track service and spending, and get a clear DIY-or-mechanic answer for any car problem."; trust row in sentence case ("Transparent estimates", "Plain answers", "Privacy first").
- README: add Maintenance and Expenses rows to "Main features" in the same voice as the others.
- Do not touch Privacy or Terms. No em dashes.

DONE WHEN
- The three places describe the current feature set in wording I approved, and the pinned tests are updated to match.

STANDING RULES
- No push, no merge, no pull request. One focused commit on copy/footer-meta-readme, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- Final wording, old next to new.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch 7: tests and CI

The suites are large and green (1869 frontend, 806 backend, 2026-11-16) and well aimed: auth, redirects, limits, money formatting, image validation, error text and secrets all have tests. The thin spots are specific: two untested photo components, no proof against the real database (PLAN-15), nothing that runs the suites automatically, and no test that drives the real app end to end.

### PLAN-28 · Tests / photo upload · Test the two photo scan components that have none

- **problem:** `PhotoScan.jsx` (the advisor's photo scan) and `OdometerScanButton.jsx` have no test file and no test that renders them. They hold the file checks, the busy state, the error messages and the privacy notice for a feature that sends a user's photo to an outside AI service.
- **evidence:** A search of every test file for those two component names finds nothing (2026-11-16). Their helpers are tested (`scanPhoto.test.js`, `photoReencode.test.js`, `advisorPhoto.test.js`, `fuelCamera.test.js`), and `RecordPhotos.test.jsx` covers the storage path.
- **user impact:** A regression here would show as a scan that silently does nothing, or as a photo sent without the notice on screen.
- **effort:** S to M, 2 to 3 hours
- **risk:** Tests only; do not change the components. If a test exposes a bug, report it instead of fixing it here.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** no
- **suggested model:** Sonnet
- **skills:** engineering:testing-strategy, mattpocock-skills:tdd
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-28): Test the two photo scan components that have none
SKILLS: use engineering:testing-strategy, mattpocock-skills:tdd. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c test/photo-scan-components`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Search the test files for `PhotoScan` and `OdometerScanButton` and confirm neither is rendered by any test.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Add `PhotoScan.test.jsx` and `OdometerScanButton.test.jsx` with the scan call faked: a readable result fills or reports as designed; an unreadable result shows its message; a wrong file type and an oversized file are refused before any request; a backend 429 shows the limit message; the button is busy during the call and usable after; the privacy notice text is on screen and equals `GEMINI_PRIVACY_NOTICE`.

DONE WHEN
- Both files exist, each covering the six cases, and the suite count rises by at least twelve.

STANDING RULES
- No push, no merge, no pull request. One focused commit on test/photo-scan-components, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The new test count.
- Any real defect the tests exposed.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-29 · Process / CI · Run tests, lint and the bundle check on every push

- **problem:** Nothing runs the suites automatically. "Never commit on a red run" depends on remembering to run four commands by hand.
- **evidence:** No `.github` folder on any branch. The suites take about 40 seconds (frontend) and 5 seconds (backend) locally.
- **user impact:** You: a broken build is caught within a minute of pushing instead of at the next manual run.
- **effort:** M, 2 to 3 hours
- **risk:** The frontend build needs the two Supabase variables to be meaningful (see PLAN-02). They are public values by design (the anon key ships to every browser), but they still must be stored as repository variables by you, not typed by an agent.
- **budget cost:** none
- **depends on:** PLAN-02 (without it the bundle check passes on an empty build)
- **decision needed:** yes (see Decision 9; it adds a workflow file and needs two repository variables you set)
- **suggested model:** Sonnet
- **skills:** engineering:testing-strategy, mattpocock-skills:tdd
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-29): Run tests, lint and the bundle check on every push
SKILLS: use engineering:testing-strategy, mattpocock-skills:tdd. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c chore/ci-workflow`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Confirm there is still no workflow file, and that PLAN-02's marker check is in `frontend/scripts/check-bundle.mjs`. If it is not, stop and tell me.
- Check how the backend tests get their settings (`backend/conftest.py`) so the job needs no real secret.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Add one workflow file with two jobs. Frontend: `npm ci`, `npm run lint`, `npm test`, `npm run build`, `npm run check:bundle`, `npm run check:fonts`, reading the two `VITE_SUPABASE_*` values from repository variables. Backend: install `requirements.txt` on Python 3.13 and run `pytest -q` with the dummy settings the tests already use.
- Trigger on push and pull request for every branch. No deploy step, no secrets, no caching tricks beyond the package caches.
- You cannot push, so you cannot see it run: give me the exact steps to add the two variables and what a green run should look like.

DONE WHEN
- The workflow file is committed on the branch and each command in it passes when run locally in the same order.

STANDING RULES
- No push, no merge, no pull request. One focused commit on chore/ci-workflow, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The workflow file.
- The two variable names I must create and where.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### PLAN-30 · Tests / end to end · One real end-to-end journey with a dedicated test account (optional)

- **problem:** Every frontend test fakes Supabase and the backend. Nothing checks that the real pieces work together: sign in, see the car, add an expense, delete it, sign out.
- **evidence:** Playwright is already a dev dependency and is used only for ad-hoc screenshots. No end-to-end test file exists in the repository.
- **user impact:** It would catch what unit tests cannot: a policy change that blocks a real write, a renamed column, a broken redirect after sign-in.
- **effort:** M, 4 to 6 hours
- **risk:** It writes to the live database through the app. It must use its own account, label everything "QA test" and delete what it creates through the app. It must never run in CI against production without your say-so.
- **budget cost:** none
- **depends on:** nothing
- **decision needed:** yes (it needs a dedicated test account that you create, and it writes to production; see Decision 11)
- **suggested model:** Opus (touches live data)
- **skills:** engineering:testing-strategy, mattpocock-skills:tdd
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-30): One real end-to-end journey with a dedicated test account (optional)
SKILLS: use engineering:testing-strategy, mattpocock-skills:tdd. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c test/e2e-smoke`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Confirm no end-to-end test exists. Ask me whether I created the test account and where its credentials live outside the repository; if not, stop.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- One Playwright script under `frontend/e2e/`, run by hand with `node`, against a production build on a spare port. Credentials come from environment variables I set; never write them to a file.
- Journey: sign in, Dashboard shows the test car, add an expense labelled "QA test", see it in the list and in the month total, delete it through the app, confirm it is gone, sign out, confirm a protected page redirects to Log In.
- If any step fails after the expense is created, the script still tries to delete it and tells me if it could not.
- Exclude the folder from the Vitest run.

DONE WHEN
- The script passes twice in a row and leaves no "QA test" row behind (checked read-only).

STANDING RULES
- No push, no merge, no pull request. One focused commit on test/e2e-smoke, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. SELECT, schema inspection and get_advisors only. No migrations, inserts, updates or deletes.
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The run output.
- The read-only check that nothing was left.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch 8: CAR-63 email reminders (only if you decide to build it)

This is Decision 1. The recommendation is not to build it. The item is here so that, if you decide otherwise, the work is already scoped.

### PLAN-31 · Feature / CAR-63 · Daily email for maintenance that is due soon or overdue

- **problem:** CLAUDE.md lists email reminders in Sprint 4 scope, and none of it exists. Maintenance items show their status in the app, but only if the user opens it.
- **evidence:** No scheduler, no email library and no reminder table anywhere: `backend/requirements.txt` has no mail package, the live database has no `pg_cron` or `pg_net` extension and no reminder table, and the due-date rules live only in the browser (`frontend/src/lib/maintenance.js`). The host's free tier has no cron (noted in `backend/app/main.py`). The live project has 3 users and 1 maintenance item.
- **user impact:** A user who set up reminders and does not open the app would learn that the oil change is overdue.
- **effort:** L, 16 to 24 hours, plus accounts and setup on your side
- **risk:** Email to real people: wrong or repeated mail, mail to someone who never agreed, and deliverability. The due-date rules would exist twice (browser and backend) and must not drift. It adds an outside email provider that the Privacy page does not list, so the Privacy wording would have to change, which needs your say-so.
- **budget cost:** CSS about +0.3 kB min and JS about +0.8 kB min for an opt-in switch. Backend: one new dependency or plain HTTPS calls to the provider.
- **depends on:** PLAN-01 (for the opt-in switch styles); your answers to Decision 1
- **decision needed:** yes (see Decision 1)
- **suggested model:** Opus (database, scheduled job, personal data)
- **skills:** mattpocock-skills:tdd, supabase:supabase, security-review
- **PROMPT:**

````text
You are working on CarSage (React and Vite frontend, FastAPI backend, Supabase). This prompt is complete on its own: assume you remember nothing from any earlier session.

TASK (PLAN-31): Daily email for maintenance that is due soon or overdue
SKILLS: use mattpocock-skills:tdd, supabase:supabase, security-review. If one is not installed, say so in the report and carry on.

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are docs/IMPROVEMENT_PLAN.md and docs/FILE_INDEX.md, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Create the work branch from dev: `git switch -c feat/car-63-email-reminders`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16). Before changing anything, check that the finding still holds:
- Confirm none of it exists yet: no mail code under `backend/app`, no reminder table, no opt-in column on `profiles`.
- Ask me for my Decision 1 answers: which email provider, which sender address, which scheduler, and whether I have approved a Privacy wording change. If any is missing, stop.
If the finding no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Write a design note in your reply first, not as a file, and wait for my OK: the opt-in (off by default, a switch on the Maintenance page), the unsubscribe link, at most one email per user per day, never the same item twice within seven days, and what happens when the host is asleep.
- Migration (show me and STOP): an opt-in boolean on `profiles` defaulting to false, and a small send-log table (user, item, date sent) that only the service role can touch.
- Backend: one endpoint that a scheduler calls, protected by a shared secret from the environment (not a user token). It finds opted-in users with due-soon or overdue items using a Python port of the rules in `frontend/src/lib/maintenance.js`, with a parity test over shared fixture cases in the style of `odometer.parity.test.js`. The email call sits in one module, like the LLM client.
- The email is plain text: which car, which item, how overdue, a link to the Maintenance page, an unsubscribe link. No tracking.
- Scheduler: the option I chose (a daily GitHub Actions job calling the endpoint is the smallest; it needs PLAN-29's setup).
- Privacy page: change wording only with the exact text I approved.

DONE WHEN
- A dry-run mode lists who would be emailed about what without sending.
- Parity tests show the backend and browser agree on due status for every fixture case.
- No email is sent to anyone who has not opted in (a test).

STANDING RULES
- No push, no merge, no pull request. One focused commit on feat/car-63-email-reminders, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start, and stop every process you start.
- Styling is plain CSS only. No animation library, no UI library, no new icon library, no outside fonts or images. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- Bundle budget: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after. Budgets: entry 470 kB min / 134 kB gzip, initial 516 / 150, CSS 73 / 13. Measured on 2026-11-16: entry 460.90 / 131.22, initial 509.90 / 148.57, CSS 66.83 / 11.22 kB (measured later, with Tailwind kept and its source scanning off). Report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database. This item needs a database change. Write the SQL as a new dated file in docs/db_migrations/, show me the full SQL and how to undo it, and STOP. Do not apply it yourself. Go on only after I tell you it has been run. Everything else on Supabase stays read-only (SELECT, schema inspection, get_advisors).
- Never type or print credentials or the contents of any .env file. If a logged-in view is needed, open a browser window on a spare port and ask me to log in. Create no data; if you must, label it "QA test" and delete it through the app.
- Every new file starts with a header comment saying what it is for. Every new or changed function and component has a docstring (what it does, parameters, return value).
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests cover the normal case, invalid input and one edge case. Run the full suites: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline: 1875 frontend tests passing (2026-11-26) and 806 backend tests passing (2026-11-16). Never commit on a red run.
- Commit message: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list (document vault, booking, live maps, OBD, voice, exports, fleets, native app). Do not change Privacy or Terms wording. Landing layout shift at 390 px stays under 0.1.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files and components in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.

REPORT
- What you verified first, and whether the finding still held.
- What changed, file by file.
- Test, lint and bundle numbers, before and after.
- The design note and my approval.
- The SQL and my confirmation it was run.
- Dry-run output against live data, with emails masked.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Process and repo housekeeping

**Branches.** `dev` and `main` hold the same code (`main` is one merge commit ahead; nothing on `dev` is missing from `main`). Every local branch is merged into `dev`: `fix/qa-defects`, `hotfix/remove-registration-scan`, `integration/ship-sprint-4`, `sprint-1` to `sprint-4`, `ui/dashboard-fixes`, `ui/landing-features`, `ui/polish`. `sprint-4` is 17 commits behind `dev` and 0 ahead, so it can be fast-forwarded or retired with no loss. `git worktree list` shows a second worktree for `hotfix/remove-registration-scan` in a temp folder, marked prunable. See Decision 12. Every prompt in this plan branches from `dev` with a named work branch, which is what the last month of commits actually did; CLAUDE.md still describes `sprint-1` to `sprint-3` and says all work goes on the sprint branch.

**CLAUDE.md.** The hazard is narrower than it was. `main`, `dev` and `sprint-4` all ignore the file and do not track it (`ede1439`, 2026-10-19). Only `sprint-1`, `sprint-2` and `sprint-3` still track it, so only a checkout of one of those three, followed by a switch back, removes the working copy. Each prompt still backs the file up first, because it costs nothing. Deleting the three old branches removes the hazard for good. Separately, CLAUDE.md's text is out of date in four places you may want to fix yourself: the deadline (Sep 25), the branch names, the "commit and push" step that the prompts here override, and CAR-63 in scope (Decision 1). `docs/FILE_INDEX.md` also still lists CLAUDE.md as a root file.

**The home folder is a git repository.** `C:\Users\user` is itself a repository (branch `mohamaddib-RestoManager`, in the middle of a merge) and CarSage sits inside it as a separate one. A tool started from the parent folder picks up the wrong repository: the security-review skill did exactly that in this session and reported on an unrelated project. Gate 1 of every prompt guards against it. Fixing it is outside this project.

**CI.** There is none (PLAN-29). The suites are fast enough for it: about 40 seconds for the frontend and 5 for the backend.

**The bundle check gap.** Measured and explained in PLAN-02. Until that ships, the check is only meaningful on a machine with a real `frontend/.env`.

**verify_rls.** PLAN-15 and Decision 7. `backend/scripts/verify_backend_auth.py` is in the same position: it also creates a throwaway user on the live project, and PLAN-17 may want it.

**graphify.** CLAUDE.md and a hook in `.claude/settings.json` require `graphify query` before any search. In this session the command was not on the PATH in either shell (no executable, no Python module), so the hook could not run and every search was done directly. Each prompt says to use it if it exists and to report if it does not. Worth checking why it is missing from the shell that agents get.

**Jira.** None of the PLAN items has a ticket, and the prompts say not to create one. The Atlassian connector refused the site in this session ("isn't explicitly granted by the user"), so ticket statuses for CAR-60 to CAR-83 were not read.

**Lint.** `npm run lint` passes with three warnings, all the same: a ref written during render in `FuelLogPage.jsx` (twice) and `CarOnboardingPage.jsx`. It is a deliberate "latest session" pattern and works today; move the write into an effect the next time either file is opened for another reason.

**Deploys cost credits.** A merge to `main` triggers a Netlify build. Ship batches to `dev` and merge to `main` once per batch, not once per item.

## Deliberately not doing

**Still open from the old tickets, and not worth it now**
- **T10 shared component set** (`Button`, `Card`, `Field`, `EmptyState`, `Skeleton`). Six screens shipped without it. Building a library ahead of a need costs CSS the budget does not have. The screen items above reuse existing classes.
- **T15, T18, T20, X9, X11** (Maintenance and legal layout, grouped advisor photo notes, Expenses button style, empty-state and "saved" patterns). Polish with no defect behind it. Pick one up only if a user trips on it.
- **Header wordmark and My Car divider** (left out of D3), **the gold Landing eyebrow** (left for a decision in CAR-69): visible design changes nobody has asked for since.
- **X7 touch targets, X10 watermark.** Both pass the automated rules today. Removing the watermark is a brand decision, not a fix.
- **Drivetrain as a dropdown.** It changes the stored value format for existing cars; the display is already tidied by `carFormat.js`.

**Found in this review, and left alone on purpose**
- **Rewriting 34 RLS policies to `(select auth.uid())` and adding 4 foreign-key indexes** (Supabase performance advisor). Correct advice for a large table. The largest table here has 36 rows. It would be a 34-policy migration on live security rules for no measurable gain. Revisit past roughly 10,000 rows in any one table. PLAN-05 uses the recommended form for its one new policy.
- **Dropping the 12 "unused" indexes.** They are unused because the tables are tiny.
- **Splitting the large page files** (`FuelLogPage.jsx` 957 lines, `CarProfilePage.jsx` 926, `MaintenancePage.jsx` 858). They are long because each does a lot, not because they are tangled, and each has a large test file. Splitting by line count would only move code around. The one real seam is that six pages each load the car list themselves; leave it until a change has to touch all six.
- **Counting a camera use only after the photo is validated.** Today a corrupt photo costs one of the day's 20 scans. Real but tiny.
- **A timeout on `apiFetch`.** A cold start legitimately takes up to a minute, so any useful timeout would be longer than users wait anyway.
- **Editing a fill-up.** Delete and re-add covers it (PLAN-05) without an UPDATE policy.
- **A coverage tool.** It needs a new dev dependency, and the gaps that matter were found by reading (PLAN-28, PLAN-15, PLAN-30).
- **Speeding up the test run.** 40 seconds is fine.
- **Raising the CSS budget.** See Decisions 2 and 3.

**Tempting, and out of scope under CLAUDE.md**
- **Exporting the fuel log or expenses to a file.** "Exportable reports" is on the out-of-scope list.
- **Keeping insurance or registration papers alongside receipts.** That is the document vault.
- **A live map or turn-by-turn view in Trip Planner.** Interactive maps are out; the static route image stays.
- **A "book this mechanic" step after a mechanic verdict.** Booking is out; the outbound search link (CAR-65) is the limit.
- **Comparing cars or sharing costs between drivers.** Fleet and cost-sharing are out.
- **Voice input for the advisor, push notifications, an installable app.** Voice and native are out.
- **shadcn, Aceternity, taste-skill or any animation or UI library.** CLAUDE.md's design rules win.

**Not in CLAUDE.md either way; ask before anyone builds them**
- Arabic and right-to-left layout. Relevant for Lebanon, large, and a CSS cost the budget cannot carry today.
- Dark mode. Same CSS problem.

## How this was checked

- **Read first:** `docs/UI_AUDIT.md`, `docs/UI_TICKETS.md`, `docs/DESIGN_PASS_2.md`, CLAUDE.md, and `git log --oneline main -60`.
- **Code read in full:** the backend entry point, auth, validation, config, usage limiter, LLM client, the advisor, trip planner, car spec and camera routers, the maps and YouTube clients, image validation and storage clean-up. On the frontend: the API client, cold-start tracker, Supabase client, the bundle check, the Fuel Log save path, and targeted searches of every page.
- **Not read:** `vehicle_lookup.py`, `fuel_prices.py`, `nhtsa_safety.py`, `tank_capacity_lookup.py`, `photo_findings.py`, `real_efficiency.py`, most of each page component, and the test files themselves (only their names and what they import).
- **Measured:** a production build in a scratch folder (bundle and CSS sizes, with and without the Supabase variables); a dead-class and repeated-declaration scan of `index.css`; the Tailwind share of the built CSS.
- **Run:** `npm test` (1869 passed), `npm run lint` (0 errors, 3 warnings), `pytest` (806 passed).
- **Live database, read-only:** security and performance advisors, RLS status and every policy on `public` and `storage`, CHECK constraints on four tables, extensions, row counts, and duplicate searches. Nothing was written.
- **Screens:** the production build served on port 4317; eight logged-out routes at 390 px and 1280 px, each with a full-page screenshot, axe-core 4.14 (WCAG 2.0, 2.1, 2.2 A and AA), a layout-shift reading, an overflow check and a six-step Tab walk. Port 5173 was not touched.
- **Screenshots and the raw report:** `C:\Users\user\AppData\Local\Temp\claude\61893868b36ee469\f539b938-2d6c-46ba-8fef-a25336178ddd\scratchpad\shots` (`out-<route>-<width>.png` and `report-out.json`). The scratch folder is temporary and may be cleared by a reboot.

**Assumed load:** a handful of users (3 today), one small backend process on a free host that sleeps when idle.

**Verdict:** healthy. No must-fix bug or security hole was found in what was read. Fix the uncapped paid endpoint (PLAN-10) and the unmanageable stored data (PLAN-05, PLAN-06) first.

## Skills and connectors

| Asked for | Result |
|---|---|
| `/ponytail lite` | Loaded |
| `/ponytail-audit` | Loaded and followed |
| `engineering:tech-debt` | Loaded and followed |
| `mattpocock-skills:improve-codebase-architecture` | Not installed in this session (the installed mattpocock skills do not include it). Architecture was judged directly; see "Splitting the large page files" above |
| `engineering:testing-strategy` | Loaded and followed |
| `design:design-critique`, `design:accessibility-review`, `design:ux-copy` | Loaded and followed, on logged-out screens only |
| `security-review` | Loaded, but it gathered its diff from the home-folder repository (an unrelated project), so its output was discarded and its method was applied by hand to CarSage |
| Supabase connector | Worked (read-only calls only) |
| Atlassian connector | Refused the site; no Jira data read |
| shadcn connector | Not needed, not tried |
| graphify | Command not found in either shell |
| Playwright and axe-core | Used from the project's own dev dependencies; nothing installed |

## What could not be verified

- **Every logged-in screen.** A browser window was opened for a manual log-in and waited about 15 minutes; nobody logged in. So there are no logged-in screenshots, no axe run on the nine logged-in routes, no Tab walk through the photo pickers, no outline-button contrast readings on the four car themes, and no network log of the logout request. PLAN-17, PLAN-20, PLAN-21 and PLAN-23 to PLAN-26 each begin by collecting that evidence.
- **The two layout-shift readings in PLAN-22** are single runs.
- **Whether an advisor example chip sends or only fills the box** (T21).
- **Google Cloud and Supabase dashboard settings** (PLAN-16), and Jira ticket statuses.
- **The deployed site and backend.** Everything was checked on a local build; the Netlify headers, the Render service and the fuel-price scraper on the host's network were not.
- **The CSS and JS costs in each item** are estimates, except the measured figures in PLAN-01 and PLAN-02.
- **A screen reader.** Only automated rules and keyboard order were checked.
