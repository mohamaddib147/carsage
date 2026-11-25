# CarSage Flutter App Plan

Written 2026-11-16 on branch `dev` at `998c256`. Planning only: no source file, database row or branch was changed, and no Flutter project was created. It follows `docs/IMPROVEMENT_PLAN.md`, `docs/UI_AUDIT.md`, `docs/UI_TICKETS.md` and `docs/DESIGN_PASS_2.md` and does not contradict them.

CLAUDE.md lists "native mobile app" as out of scope and a future phase. This plan is for that future phase. Nothing in it changes or slows the web app, and section 2 says what has to be true before any of it starts.

Every work item carries a prompt you can paste into a fresh session. Each prompt re-checks its own assumptions first, because the web app will have moved by the time you use it.

## 1. Summary (one page)

**Recommended approach.** Build a native Flutter app that sits beside the React web app. Both use the same Supabase project and the same FastAPI backend. The web app stays exactly as it is. Android first, because this machine can build Android today and cannot build iOS at all (see `flutter doctor` in section 11). The app lives in a `mobile/` folder in this repository so it can share test fixtures with the web and the backend.

**Why not the other two.** Rewriting the web in Flutter throws away 1869 passing frontend tests, the bundle-budget work and the Landing page's search visibility, for no user benefit. A wrapped web view is cheap, but it gives none of the three things that justify an app (reminders, logging a fill-up with no signal, a quicker camera) and is the kind of app the stores reject for adding nothing over the website.

**The smaller option, named honestly.** The web app already works at 390 px. If the goal is only "an icon on the phone", an installable web app (a manifest and a service worker, optionally wrapped for the Play Store) is roughly 10 to 20 hours, not 140 to 210. It gives no reliable reminders on iPhone and no real offline logging. Pick it if those two things are not worth the difference. `docs/IMPROVEMENT_PLAN.md` lists "an installable app" as out of scope today, so it is your call either way (Decision 2).

**The MVP (Batches A to D).** An Android app you can demo on a real phone:
- log in and sign up (email and password, plus Google on Android), log out, delete account;
- Dashboard with the car snapshot;
- add a car and view or edit its profile, with a car photo;
- Fuel Log with the pump and odometer camera scans, real km/L, and saving a fill-up with no signal;
- Maintenance with due-soon and overdue status, and phone reminders (local notifications, which deliver what CAR-63 planned as email);
- Privacy and Terms opened from the live website, so the wording exists once.

Expenses, Trip Planner and AI Advisor follow in Batch E. iPhone, push notifications and Arabic are Batch F, each behind its own decision.

**Rough effort.**

| Part | Hours |
|---|---|
| Batch A: web, backend and database work that must exist first | 23 to 35 |
| Batch B: the app's foundation (boots, logs in, shows the Dashboard) | 50 to 74 |
| Batch C: MVP features | 60 to 86 |
| Batch D: Android release to a test track | 8 to 12, plus waiting time you do not control |
| **MVP total** | **about 140 to 210** |
| Batch E: Expenses, Trip Planner, AI Advisor | 36 to 52 |
| **Android with full parity** | **about 175 to 260** |
| Batch F (optional): iPhone 20 to 35, push 20 to 30, Arabic 30 to 50 | 70 to 115 |

These numbers do not include the `docs/IMPROVEMENT_PLAN.md` items that section 2 lists as blockers; they are costed there.

**Top three risks.**
1. **A second client doubles the cost of every future feature, for 3 users.** The live project has 3 accounts. After the app ships, each change to fuel, maintenance or costs is built twice and tested twice by one developer. This is the real price, and it never ends.
2. **An installed app cannot be forced to update, and most of CarSage's data calls go straight from the client to Supabase.** An old app version keeps reading and writing the live tables for as long as someone has it installed. Every future database change must stay compatible with old apps, and row-level security is the only guard. That security has never been re-tested live (`verify_rls.py` has never run).
3. **The stores and the calendar, not the code.** In-app account deletion does not exist today and both stores require it. The scans send photos to Google's free Gemini tier, where human reviewers may read them, and that must be disclosed in the store forms. Google Play makes new personal developer accounts run a closed test with a minimum number of testers for a minimum period before production (check the current rule); with 3 users, finding testers is a real task. iPhone needs a Mac and a paid Apple account that this project does not have.

## 2. Before mobile starts

Do not start Batch B until every line here is true. Batch A items are in this plan; the PLAN items are in `docs/IMPROVEMENT_PLAN.md`.

| # | What must be true | Why mobile needs it | Where |
|---|---|---|---|
| 1 | You have opened the mobile phase in writing: CLAUDE.md no longer lists the native app as out of scope, and its deadline, branch names and "commit and push" step are updated | Every prompt here stops if CLAUDE.md still forbids the work | You, by hand |
| 2 | The capstone submission and mentor review are finished | CLAUDE.md puts scope discipline first; mobile is not in the submission | You |
| 3 | Trip Planner estimates and the spec lookup have daily caps | The estimate calls a billed Google API with no cap. A phone app makes it one more client that can call it all day | PLAN-10 |
| 4 | The live row-level-security test has run once and passed | For a client you cannot recall, RLS is the only guard on every table | PLAN-15 |
| 5 | Fill-up delete is decided (built or refused) | The offline fill-up queue and the Fuel Log screen are designed around that answer | PLAN-05, its Decision 4 |
| 6 | Maps failures are told apart and logged | The app maps backend errors to messages; today every maps failure is the same 400 | PLAN-11 |
| 7 | Dashboard settings are confirmed: leaked-password protection, Google key restrictions, a spending alert | The Supabase security advisor still reports leaked-password protection as off (checked 2026-11-16) | PLAN-16 |
| 8 | Web CI exists | Batch A changes the backend. Without CI nothing proves the web still works after a backend change made for mobile | PLAN-29 |
| 9 | CAR-63 email is decided | If phone reminders replace it, PLAN-31 is never built (Decision 6 here, Decision 1 there) | You |
| 10 | A user can delete their own account, on the web and through the backend | Both stores require in-app deletion. Nothing exists today: no endpoint, no button | MOB-01 |
| 11 | The app can learn the minimum supported version and the exchange rate at start, from the database | You cannot force an update. The check must ship in the very first build, or old builds never get it | MOB-02, MOB-03 |
| 12 | The shared rules exist as JSON test cases that the web tests already read | Otherwise the Dart copies drift from the web silently | MOB-04 |
| 13 | A written rule for database changes: add only, never rename, drop or tighten while an old app version is still supported | See risk 2 | MOB-03 writes it down |
| 14 | You have confirmed in the Netlify and Render dashboards that a commit touching only `mobile/` does not start a web or backend deploy | A deploy to `main` costs Netlify credits. I could not see either dashboard | You, checked in MOB-05 |
| 15 | You have a Google Play developer account (identity checks can take days; check the current fee) and one real Android phone for testing | The camera, notifications and TalkBack cannot be judged on an emulator alone | You |
| 16 | A development Supabase project exists, or you accept that mobile development writes to the live one | A debug build on a phone creates real rows and real storage files | Decision 10 |

Rows 3 to 9 improve the web app whether or not mobile ever happens. If they are not worth doing for the web, that is a signal about mobile too.

## 3. Decisions I need from you

Each has my recommendation and what it costs. Nothing that depends on a decision should start before you answer it.

1. **Start now, or wait?**
   - **Recommendation: wait until section 2 is true.** Then build Batch A, which helps the web on its own, and decide again before Batch B.
   - **Cost of waiting:** nothing. **Cost of starting early:** the store and security blockers surface at the end instead of the start.
2. **Which approach?** A native Flutter app beside the web, Flutter for web and mobile together, or a wrapped web view (ADR-1).
   - **Recommendation: a native Flutter app beside the web.** About 140 to 210 hours to an Android MVP.
   - **Smaller option:** an installable web app, 10 to 20 hours, without reliable reminders or offline logging.
   - **Worth knowing:** you asked for Flutter and its SDK is installed. React Native would reuse the existing JavaScript rules (`frontend/src/lib/*.js`) directly and remove the whole porting item (MOB-09) and its drift risk. I have planned Flutter as asked.
3. **Which platforms?**
   - **Recommendation: Android only until the MVP is in testers' hands.** iPhone later (MOB-22).
   - **Cost of iPhone:** a Mac or a paid cloud Mac build service, an Apple developer membership (check the current fee), and 20 to 35 hours.
4. **Is the MVP scope in section 1 right?** It leaves Expenses, Trip Planner and AI Advisor for Batch E.
   - **Recommendation: yes.** The Fuel Log at the pump and the reminders are the two things a phone does better than the website. The AI Advisor is the largest screen and works well on the mobile website today.
   - **Cost of adding the Advisor to the MVP:** 14 to 20 hours more.
5. **Account deletion on the web and backend (MOB-01).** It deletes the account, every row and every photo, for good.
   - **Recommendation: yes, and do it even if mobile never happens.** It needs one new backend endpoint, one new web button, and a Privacy wording change that only you can approve.
   - **Cost:** 8 to 12 hours.
6. **Reminders: local notifications, push notifications, or email?**
   - **Recommendation: local notifications on the phone, and drop the CAR-63 email for good.** No server job, no email provider, no domain, no device-token table.
   - **Cost:** 8 to 12 hours (MOB-15). **What you give up:** a reminder only exists on a phone that has opened the app since the item last changed, and a distance-based item can only remind after a new odometer reading.
   - **Push (MOB-23) costs 20 to 30 hours**, a Firebase project, a scheduler, a new table on the live database and a third copy of the due-date rules in Python.
7. **Shared rules: port to Dart with shared test cases, or move them into the database?** (ADR-2 and section 6.)
   - **Recommendation: port to Dart, with one set of JSON cases that the web, the backend and the app all test against.** The pattern already exists for real km/L (`backend/tests/fixtures/efficiency_cases.json`).
   - **Cost:** 8 to 12 hours for the cases (MOB-04) and 12 to 18 for the ports (MOB-09). Moving rules into Postgres would mean rewriting working web screens, which this plan may not do.
8. **A small `app_config` table on the live database (MOB-02).** One row the app reads at start: minimum supported version, latest version, the LBP rate, store links.
   - **Recommendation: yes.** Read through Supabase, so it is not slowed by the backend's cold start.
   - **Cost:** 3 to 5 hours and one migration that you run. Anyone can read the row, so nothing secret may ever go in it.
9. **Password reset and email confirmation: stay on the website for the MVP?**
   - **Recommendation: yes.** The reset email keeps opening the existing web page; the user sets a new password there and logs in to the app. It costs nothing and needs no app links. Only Google sign-in needs a link back into the app, and that uses a custom scheme with PKCE.
   - **Cost of doing it "properly" with verified app links later:** 6 to 10 hours and two small files on the website (ADR-4).
   - **Your part either way:** add the app's redirect address to the allow list in the Supabase dashboard.
10. **A separate Supabase project for mobile development?**
    - **Recommendation: yes.** Build it from `docs/db_migrations/` (the README says those files rebuild the database). Check that the free plan still allows a second project.
    - **Cost:** 2 to 3 hours of your time. **Cost of refusing:** every test fill-up and photo from a debug build lands in production.
11. **`mobile/` in this repository, or a separate repository?** (ADR-7)
    - **Recommendation: `mobile/` here.** The shared test cases only work if all three codebases can read one folder.
    - **Cost:** you confirm row 14 of section 2 first.
12. **Arabic and right-to-left.**
    - **Recommendation: not in the MVP, but build ready for it from the first screen:** every string in a translation file, and direction-aware padding and alignment. That adds roughly 10% to each screen and makes Arabic later a translation job instead of a rewrite.
    - **Cost of Arabic itself (MOB-24):** 30 to 50 hours, an Arabic font, backend messages and Advisor replies in Arabic, translated legal pages (your wording), and a native-speaker review. Currency stays USD and LBP in every case.
13. **Dark mode.**
    - **Recommendation: no.** The web has none, and each of the car-brand themes would need a dark twin with its own contrast proof. The app is locked to the light theme.
    - **Cost if you want it later:** 12 to 20 hours.
14. **The backend's cold start.**
    - **Recommendation: keep the free tier for the MVP and warm the server in the background when the app opens** (MOB-08). Most screens read Supabase directly and never wait for it.
    - **Cost of the real fix:** a paid Render instance that does not sleep (check the current price).
15. **Photos and the free Gemini tier.** The scans send photos to a tier where Google may use the content and human reviewers may read it. The web says so beside each scan button.
    - **Recommendation: keep the free tier, show the same sentence, and ask for a one-time "I understand" before the first scan in the app.** Declare it in both stores' data forms.
    - **Cost of removing the issue:** a paid Gemini plan for vision calls (check the current price), which the backend already supports through `GEMINI_VISION_API_KEY`.
16. **Trip Planner on the phone: plain text boxes, or address suggestions?**
    - **Recommendation: plain text boxes and no route image at first.** The backend already accepts free text. No Google key ships in the app.
    - **Cost of suggestions later:** 6 to 10 hours for two small backend endpoints that pass the lookups through, so the key stays on the server.
17. **Car-brand logos in the app.**
    - **Recommendation: brand colours only, no logos.** Colours carry no trademark artwork (the web's own note in `carBrandThemes.js`). Logos in a store listing invite a trademark complaint.
    - **Cost:** none.
18. **Store identity.** The Terms call CarSage a student capstone project. A store listing needs a developer name, a support email and a privacy policy address that stay valid.
    - **Recommendation: publish under your own name with a dedicated support address, and keep the first release on a closed test track.**
    - **Cost:** the account fees (check the current fee for each store) and your wording.

## 4. Architecture decisions (ADRs)

All are **Proposed**, dated 2026-11-16, and the decider is the developer.

**How the pieces fit**

```
                  +--------------------+        +---------------------+
  React web  ---> |                    |        |  FastAPI on Render  |
  (Netlify)       |  Supabase          | <----- |  (service key,      |
                  |  Postgres + RLS    |        |   Gemini, Groq,     |
  Flutter app --> |  Auth, Storage     |        |   Maps, YouTube)    |
  (phone)         |  app_config (new)  |        |  DELETE /account    |
        |         +--------------------+        +---------------------+
        |                                                 ^
        +------ scans, trip estimate, advisor, -----------+
                account deletion (JWT in the header)
```

Both clients hold only the anon key and the user's session. Rows, photos in storage and sign-in go straight to Supabase. Anything that needs a secret goes through FastAPI.

### ADR-1: A native Flutter app beside the web app

- **Context.** The web app is healthy, tested and budgeted. One developer. Three users. The Flutter SDK is installed; there is no Mac.
- **Decision.** A separate Flutter app for phones, sharing Supabase and FastAPI with the web. The web is not touched.
- **Alternatives.**
  - *Flutter for web and mobile together.* One codebase, but it replaces a working site, loses the Landing page's search visibility and its 150 kB budget (a Flutter web build starts well above that), and discards 1869 tests. Rejected.
  - *A wrapped web view.* 20 to 30 hours. No offline, no reliable reminders, a camera that is no better than the browser's, and a real chance of rejection for adding nothing over the site. Rejected.
  - *An installable web app.* The honest cheap option; see Decision 2.
  - *React Native.* Would reuse the JavaScript rules directly. Not what was asked; noted in Decision 2.
- **Consequences.** Two user interfaces to build and keep in step. The business rules exist in up to three languages (ADR-2). In return, the web carries no risk from mobile work.

### ADR-2: Business rules are ported to Dart and pinned by shared test cases

- **Context.** The rules live in `frontend/src/lib/*.js`. One of them, real km/L, already exists a second time in Python, and the two are kept honest by a shared file of cases that both test suites read.
- **Decision.** Extend that pattern. A top-level `shared/fixtures/` folder holds JSON cases per rule. Vitest, pytest and `flutter test` all read the same files. A rule changes by changing its cases first; any copy that disagrees fails its tests.
- **Alternatives.**
  - *Postgres functions or views that both clients call.* One copy, and no cold start. But the web would have to be rewritten to use them, the Fuel Log needs answers while the user types, and the rules would move from tested JavaScript into SQL that nothing here tests. Rejected for now; right for a rule only a server needs.
  - *FastAPI endpoints.* One copy, but every screen would wait on a server that sleeps. Rejected.
- **Consequences.** A rule change costs three edits. Drift is caught by tests, not by users. Values that must change without an app release (the exchange rate) do not belong in code at all; they move to `app_config` (ADR-3).

### ADR-3: Compatibility by rule, not by version prefix

- **Context.** An old app version cannot be forced to update. Most data calls bypass FastAPI. The existing routes have no version prefix and the web uses them.
- **Decision.**
  1. Existing backend routes only ever change by adding optional fields. A breaking change gets a new route, and the old one stays until no supported app uses it.
  2. The database changes by adding only, for as long as an older app version is supported.
  3. A public, read-only `app_config` row holds `min_supported_version` per platform. The app reads it at start through Supabase and shows a blocking "Update CarSage" screen when it is too old. This ships in the first build.
  4. The app sends `X-Client: carsage-android/<version>` to FastAPI, which answers 426 to a version below the minimum.
- **Alternatives.** Prefixing every route with `/v1` would change the web for no gain today. Enforcing the version inside RLS by reading request headers is possible and not worth the complexity.
- **Consequences.** The version gate is a courtesy, not a lock: a modified app can ignore it, and direct Supabase calls are never version-checked. RLS and the database constraints stay the real protection. Dropping a column becomes a slow, deliberate act.

### ADR-4: Supabase Auth with a secure session store, and email links that stay on the web

- **Context.** `supabase_flutter` keeps the session in plain shared preferences by default and lets you supply your own store (its package page, read 2026-11-16). The web offers email and password and Google sign-in. Email links today open the website.
- **Decision.** The session is kept in the phone's keystore through a small custom store. Password reset and email confirmation keep opening the website. Google sign-in opens the system browser and returns through a custom scheme with PKCE. Log out ends only this device's session.
- **Alternatives.** Verified app links (an `assetlinks.json` file on the website) remove the small risk of another app claiming the scheme, at the cost of web files and setup; do it before a public release if Google sign-in stays. Handling reset inside the app is more code for a rare flow.
- **Consequences.** One extra package. A user who resets a password does it in the browser. On iPhone, offering Google sign-in brings a store rule about offering an equivalent sign-in option (check the current guideline).

### ADR-5: Reminders are local notifications

- **Context.** CAR-63 planned a daily email and nothing was built. The host has no scheduler. The due-date rules exist only in the browser.
- **Decision.** The app schedules notifications on the phone from the due dates it computes, and reschedules them whenever maintenance data changes or the app opens.
- **Alternatives.** Push needs Firebase, a token table, a scheduled job and the rules in Python. Email needs a provider and a domain. Both reach a user who never opens the app; local notifications do not.
- **Consequences.** No server work and no new personal data. Distance-based items cannot fire on a date. A change made on the website is not reflected until the app next opens. Some Android phones delay or drop scheduled notifications in the background (the plugin's own warning). If these limits hurt in practice, MOB-23 is the upgrade.

### ADR-6: Online first, with a read cache and one offline action

- **Context.** The data is small (tens of rows per user). The one moment with no signal that matters is at the pump.
- **Decision.** The last successful read of each list is cached on the phone and shown with a "last updated" note when offline. Only a new fill-up can be saved offline: it gets its id on the phone, waits in a small queue and is sent when the network returns. Everything else needs a connection and says so.
- **Alternatives.** A local database with two-way sync solves problems this app does not have and adds the hardest kind of bug.
- **Consequences.** Fill-ups are insert-only, so there is nothing to merge. Sending the same queued fill-up twice is harmless because the id already exists. A scan cannot run offline; the user types the numbers. The cache must be wiped on log out and on account deletion.

### ADR-7: `mobile/` in this repository

- **Context.** Shared test cases need one folder all three codebases can read. Deploys to `main` cost credits.
- **Decision.** `mobile/` and `shared/` at the repository root. Work branches are `mobile/<item>` from `dev`. Releases are tagged `mobile-v<version>`. A CI job runs only when `mobile/` or `shared/` changes.
- **Alternatives.** A separate repository isolates deploys completely but breaks the shared cases (they would have to be copied, which is the drift this plan is trying to prevent).
- **Consequences.** The Netlify and Render settings must ignore `mobile/`-only commits (section 2, row 14). The repository grows; `docs/FILE_INDEX.md` gains a `mobile/` section.

## 5. Feature parity

MVP = Batches A to D. Later = Batch E unless a batch is named. Never = mobile should not have it.

| Web screen or feature | Mobile | When | Notes |
|---|---|---|---|
| Landing page | A single welcome screen with Log In and Sign Up | MVP | No marketing sections, no search files. The store listing does that job |
| Sign Up, Log In (email and password) | Same | MVP | Same error wording rules as `describeAuthError` |
| Google sign-in | Same on Android | MVP | System browser and a link back. iPhone waits for Decision 3 |
| Reset password | Sends the email; the link opens the website | MVP | Decision 9 |
| Log out | Same, this device only | MVP | Also clears the cache, the queue and scheduled reminders |
| Delete account | New on both | MVP | Does not exist on the web today (MOB-01) |
| Dashboard | Same content as one scrolling column | MVP | Car snapshot, what is due, quick actions |
| Car Onboarding (manual form) | Same | MVP | Same field rules and the VIN rule |
| Spec suggestions from make, model and year | Same | MVP | Needs the backend; shows the waking-up state |
| Car Profile, view and edit | Same | MVP | |
| Car photo | Same, from camera or gallery | MVP | Bucket allows 8 MB and several formats |
| More than one car, default car | Same switcher | MVP | The web already supports it |
| Car-brand colour themes | Same colours | MVP | From one shared list |
| Car-brand logos | None | Never | Decision 17 |
| Fuel Log: list and add | Same | MVP | |
| Pump photo scan | Native camera | MVP | Counts against the same daily limit as the web |
| Odometer photo scan | Native camera | MVP | Same |
| Real km/L and the per-step figures | Same | MVP | Ported rules, shared cases |
| Fuel price chart | Later | Later | Comes with the chart package in MOB-19 |
| Delete a fill-up | Follows the web | When PLAN-05 ships | |
| Save a fill-up with no signal | New, mobile only | MVP | ADR-6 |
| Maintenance: items, status, mark done, undo | Same | MVP | |
| Photos on a maintenance completion | Later | Later | Same storage rules as receipts |
| Maintenance reminders | Local notifications, mobile only | MVP | ADR-5 |
| Expenses, monthly cost of ownership | Same | Later | |
| Receipt photos (up to three) | Native camera | Later | Receipts are attachments. They are stored privately and never sent to Gemini |
| Monthly cost chart | Same | Later | |
| Trip Planner estimate | Same result fields | Later | Uses the car's real km/L when there is enough data, as on the web |
| Address suggestions | Plain text first | Later, optional | Decision 16 |
| Static route image | None at first | Later, optional | Needs a key or a backend pass-through |
| Fuel price default and override | Same | Later | |
| Recent trips with delete | Follows the web | When PLAN-06 ships | |
| AI Advisor chat | Same | Later | |
| Warning-light and problem photo scan | Native camera | Later | Same Gemini notice |
| DIY video link, find-a-mechanic link | Open in the YouTube or maps app | Later | Plain outbound links, as CAR-65 says |
| "Did this fix it?" and DIY statistics | Same | Later | |
| USD and LBP toggle | Same, remembered on the phone | MVP | Rate read from `app_config` |
| Privacy and Terms | Open the live web pages | MVP | One copy of the wording |
| 404 page | Not applicable | Never | |
| "Waking up the server" banner | A quieter inline state | MVP | Never shown during a normal photo scan (the PLAN-13 lesson) |
| Skip link, per-route page titles | Screen-reader equivalents | MVP | Section 9 |
| Hover tooltips | Tap to show | MVP | |
| "Update CarSage" blocking screen | New, mobile only | MVP | ADR-3 |
| Anything on CLAUDE.md's out-of-scope list | No | Never | Vault, booking, live maps, OBD, voice, exports, fleets |

## 6. Shared business logic

For each rule: where it lives today, and whether to port it or move it.

| Rule | Today | Recommendation | Why |
|---|---|---|---|
| Real km/L with no full-tank assumption (`realEfficiency`, `fillUpEfficiencies`, `stepDispositions`, the Trip Planner floor of 3 intervals and 500 km) | `lib/odometer.js` and `backend/app/services/real_efficiency.py`, pinned by `efficiency_cases.json` | **Port to Dart, same case file** | The Fuel Log shows per-step figures as the list loads. The pattern is proven. The Trip Planner keeps using the backend copy |
| Odometer checks while typing (`getOdometerError`, `getOdometerOrderWarning`, `distanceSincePrevious`, `latestOdometer`) | `lib/odometer.js` | **Port, new cases** | Must answer on every keystroke and with no signal. The database CHECK (1 to 2,000,000 km) stays the authority |
| Fill-up rules and per-liter prices (`getFillUpErrors`, `pricePerLiter`, `pricePer20Liters`, sorting) | `lib/fuelLog.js` | **Port, new cases** | Same reason. The 20-liter figure is a Lebanon habit worth keeping identical |
| Currency (`convertAmount`, `formatMoney`, `LBP_PER_USD = 89,700`) | `lib/currency.js`; the backend has its own `LBP_PER_USD` and returns it from `/trip-planner/fuel-prices` | **Port the maths; move the rate out of code into `app_config`** | A rate compiled into an app cannot change without a store release. The compiled value stays only as a fallback |
| Cost totals (`monthlySummary`, `monthlyChartPoints`, the nine expense categories) | `lib/costs.js` | **Port in Batch E, new cases** | Small, pure, needed offline from the cache. The category list is also a database CHECK |
| Car snapshot (`carSnapshot`, `economyOf`) | `lib/carSnapshot.js` | **Port** | A thin combination of the rules above |
| Maintenance status (`nextDue`, `maintenanceStatus`, `DUE_SOON_DAYS = 14`, `DUE_SOON_KM = 500`, `addMonths`, `todayInBeirut`, sorting by urgency) | `lib/maintenance.js` only | **Port, new cases, with care** | Local reminders are computed on the phone, so the phone needs this rule anyway. The month arithmetic and the Beirut "today" are where two copies go wrong; most of the cases should sit there |
| Maintenance and completion form rules | `lib/maintenance.js` | **Port** | Screen-level checks; the database constraints are the authority |
| DIY fix statistics (`diyFixCounts`, `diyFixRate`, `timeAgo`) | `lib/diySuccess.js` | **Port in Batch E** | Three small functions; cases are cheap |
| Field limits and the VIN rule (`LIMITS`, `VIN_PATTERN`, `getCarFieldErrors`) | `lib/limits.js`, mirrored by database CHECKs and `backend/app/validation.py` | **Port, with the limits as one shared JSON file** | The database already refuses bad values, so a drifted copy gives a worse message, never bad data |
| Error wording (`describeAuthError`, `describeApiFetchError`, the fixed sentences) | `lib/limits.js` | **Port the mapping, cases for each code** | No raw error text may reach the screen, on either client |
| Photo limits (1600 px longest edge, 2 MB, JPEG) | `lib/photoReencode.js`; the bucket enforces 2 MB JPEG; the backend re-checks every scan | **Same numbers, native code** | The browser uses a canvas; the phone uses the picker's own resize. Only the numbers are shared |
| Daily limits (advisor 60 per user; camera 20 per user and 150 for everyone) | Database triggers on `api_usage` | **Already one copy** | Keyed on the user, so web and app share one allowance with no work |
| Traffic level (`getTrafficLevel`), drivetrain and transmission display, tank range | `lib/trafficLevel.js`, `lib/carFormat.js`, `lib/tankCapacity.js` | **Port when the screen that needs them is built** | Tiny |

**What should move to the server instead, and when.** If push notifications are ever built (MOB-23), the due-date rule would be needed in Python as a third copy. At that point move it into one Postgres function that the job calls, and let the clients keep their copies pinned by the same cases. Do not do it before then.

## 7. Backend and API for a mobile client

- **Versioning and old apps.** ADR-3. The rule in one line: add, never change.
- **Minimum version.** `app_config` through Supabase at start (cached, so a failed read never locks anyone out), plus a 426 from FastAPI. Ship it in build 1.
- **Cold start.** Supabase reads do not wait for Render. The app sends a quiet `GET /health` when it opens and again when the Fuel Log opens, so the server is usually awake by the time a photo is taken. The first backend call allows up to 75 seconds and shows the waking-up state after 6 seconds, the web's threshold, but never during a vision scan, which is slow for its own reasons. Only safe reads are retried, once. A scan is never retried automatically, because each one spends the user's daily allowance.
- **Rate and usage limits.** Shared with the web through the database triggers. A phone makes scanning easier, so the 150-a-day camera cap for all users will be reached sooner; review that number before a public release. Trip estimates have no cap today (PLAN-10 is a blocker).
- **JWT.** Unchanged: `Authorization: Bearer <token>`, verified by `get_current_user_id`. The app reads the current session immediately before each call, because a phone resumed after an hour holds an expired token. On a 401 it refreshes once, and logs the user out if that fails.
- **CORS.** A native app sends no `Origin`, so the allow list neither helps nor blocks it. Nothing changes, and no wildcard is added. CORS was never the protection; the JWT check is.
- **Error format.** Stays as it is: `{"detail": "plain sentence"}`, a list for 422, and 400, 401, 404, 429 and 503 as used today. MOB-03 adds tests that freeze these shapes, so a web-motivated change cannot break an installed app unnoticed. A machine-readable `code` field is only worth adding if Arabic happens.
- **Uploads.** Same multipart field (`file`) and the same server-side re-check.
- **New endpoint.** `DELETE /account` (MOB-01).

## 8. Design handoff: web design system to Flutter

**Sources, in order of authority.** The web's shipped tokens (`frontend/src/index.css`, `frontend/src/theme/carBrandThemes.js`) win. The Stitch references in `docs/stitch_carsage_landing_page/` are used for layout and spacing on a phone. Where they disagree, the web wins: for example Stitch names Plus Jakarta Sans, and the web ships Manrope and Space Grotesk.

**Colour tokens**

| Token (web) | Value | Flutter home | Use |
|---|---|---|---|
| `--color-primary` | `#00594C` | `ColorScheme.primary` | Primary buttons, selected tab, app bar accents |
| `--color-primary-hover` | `#00473D` | pressed state | Pressed primary button |
| `--color-background` | `#F5F1E8` | scaffold background | Page background (cream) |
| `--color-surface` | `#FFFFFF` | `ColorScheme.surface` | Cards |
| `--color-text` | `#2B2B2B` | `onSurface` | Body and headings (graphite) |
| `--color-text-muted` | `#6B6A63` | theme extension | Secondary text |
| `--color-accent` | `#C9A24B` | `ColorScheme.secondary` | Fills only: badges, chart bars, icon tiles |
| `--color-accent-text` | `#826627` | theme extension | Gold used as text. Never use the fill colour for text |
| `--color-on-accent` | `#2B2B2B` | `onSecondary` | Text on a gold fill |
| `--color-border` | `#D8D2C2` | `outlineVariant` | 1 px card and input borders |
| `--color-input-bg` | `#F1EDE4` | input fill | Text fields |
| `--color-danger` | `#B3261E` | `ColorScheme.error` | Errors, delete |
| Status: overdue / due soon / ok | danger on white / `#F5B400` with graphite / `#1B7A3D` with white | theme extension | Fixed. They do not follow the car's brand theme (the CAR-81 decision) |

**Per-car brand themes.** Each theme overrides the same six tokens. The list is exported once to `shared/fixtures/brand_themes.json` (MOB-04) and loaded by the app; a web test proves the file matches `carBrandThemes.js`. The web's contrast test (`themeContrast.test.js`) is ported, so every brand passes 4.5:1 for text on a phone too. The theme follows the car being shown, as on the web (the CAR-55 fix).

**Type.** Manrope for body and Space Grotesk for headings, bundled in the app as font files under their SIL Open Font License, with the licence text beside them. Nothing is fetched at run time, so the Privacy claim that no font request goes to Google stays true. Starting scale, from Stitch's mobile sizes: screen title 26/34 semibold, section title 22/30, card title 18/26, body 15/24, small 13/20, label 14/20 medium. Nothing below 12. Check these against `index.css` when building MOB-06.

**Shape and spacing.** 8-point spacing. Radius 8 for inputs and small controls, 12 for cards. 16 px screen margins. Cards are white with a 1 px border and a very soft shadow.

**Components and states**

| Component | Spec | States |
|---|---|---|
| Primary button | Green fill, white text, at least 48 high, full width in forms | Pressed darker; disabled at reduced opacity; loading shows a spinner and keeps its width; never a double submit |
| Secondary button | Surface fill, 1 px border, graphite text | Same. Check the border contrast on every brand theme (the PLAN-21 question) |
| Text field | 48 high, label above, hint below, error below in danger colour with an icon | Focus ring 2 px primary; the error is announced to screen readers |
| Number field | Opens the numeric keypad; thousands separators as on the web's `FormattedNumberInput` | |
| Status badge | Pill with text and colour together | Never colour alone |
| Card | Title, body, optional action | Loading skeleton with no shimmer under reduced motion; empty state with one sentence and one action; error with a retry |
| Scan button | Camera icon and label, with the Gemini sentence directly under it | Reading (spinner, cancel), unreadable result, limit reached, no connection |
| Bottom navigation | Four tabs: Home, Fuel, Care, More | Selected tab in primary, with a text label always visible |

**Navigation.** The web's header becomes a bottom bar. "More" holds Car Profile, the currency choice, Privacy, Terms, Log Out and Delete Account, and later Expenses, Trip Planner and Advisor.

**Screen references**

| Screen | Stitch folder | Phone notes |
|---|---|---|
| Welcome, Log In, Sign Up | `carsage_sign_up_authentication` | One card, logo above |
| Dashboard | `carsage_dashboard_vehicle_hub` | One column; quick actions as a 2 by 2 grid of 48-high buttons (as Design Pass 2 specified) |
| Add a car | `carsage_add_your_car` | Sections stacked; the save button stays above the keyboard |
| Car Profile | `carsage_car_profile` | Title first, "Not set" for blanks, delete in its own danger area (matches PLAN-25) |
| Trip Planner | `carsage_trip_planner` | Results under the form |
| AI Advisor | `carsage_ai_advisor` | The verdict is the most visible part of each reply (matches PLAN-23) |
| Fuel Log, Maintenance, Expenses | none; use the Dashboard card style | History as stacked rows, never a wide table (matches PLAN-24) |

Ignore any out-of-scope feature still visible in the Stitch images, as CLAUDE.md says.

**Icons.** The web copies Lucide SVGs under the ISC licence. For the app, `lucide_icons_flutter` gives the same set as an icon font; its page lists the MIT licence (read 2026-11-16) and the icons themselves remain ISC, so keep both notices in the app's licence screen. Smaller alternative: Flutter's built-in Material icons, with no package and a slightly different look.

**Motion.** Three durations from the web: 120 ms for small state changes, 180 ms for menus and sheets, 280 ms for screen and card entrances. No animation package. When the phone's "remove animations" setting is on, every duration becomes zero and the loading skeleton is static.

**Edge cases to build in.** Long car names and long Arabic or German strings wrap rather than clip. Large text (section 9). A slow or absent network on every screen. No car yet. No fill-ups yet. A user at their daily scan limit.

## 9. Mobile accessibility

This is a plan, not an audit: there is no app to audit yet. The target is WCAG 2.1 AA, as on the web.

| Area | Requirement | How it is checked |
|---|---|---|
| Screen readers | Every icon-only button has a spoken name. Decorative icons are hidden. Each screen announces its title when it opens. Lists read as "item, status, date" in one stop | A TalkBack pass on a real phone for every screen (MOB-17); VoiceOver when iPhone exists |
| Status | Overdue, due soon and ok are always text plus colour | Widget tests look for the text |
| Text scaling | Every screen works at 200% text size with no clipped or overlapping text. No fixed heights on anything that holds text | Widget tests at double text scale |
| Touch targets | At least 48 by 48 dp, with 8 dp between neighbours | Flutter's built-in tap-target guideline in widget tests |
| Contrast | 4.5:1 for text and 3:1 for controls, on every brand theme | The ported contrast test, plus Flutter's text-contrast guideline |
| Forms | Labels are real labels, not placeholders. On a failed save, focus moves to the first error and it is announced (the web's `useScrollToAlert` behaviour) | Widget tests and the TalkBack pass |
| Camera | A scan is never the only way: the numbers can always be typed, and a photo can come from the gallery. The scan result is announced | TalkBack pass |
| Charts | Each chart has a one-sentence text summary | Widget test |
| Motion | Honours the system setting (section 8) | Widget test with animations disabled |
| Direction | Padding and alignment are start and end, never left and right, from the first screen | Code review; one widget test in a right-to-left locale |
| Time limits | None. A session expiry returns to Log In with a plain message and keeps what was typed where possible | |

Known gap that tools will not catch: reading order inside the Dashboard cards. Only the manual pass finds it.

## 10. Testing strategy

**Shape.** Many fast rule tests, a widget test or two per screen, one journey on an emulator, and a short manual checklist on a real phone.

| Layer | What | Tool |
|---|---|---|
| Rules | Every Dart port runs the shared JSON cases: real km/L, odometer checks, fill-up rules, maintenance status and month arithmetic, currency, VIN and limits, costs, error wording | `flutter test` |
| Widgets | Each screen with a hand-written fake data source: normal, empty, loading, error, offline. Double text size. Tap targets and contrast guidelines. One right-to-left smoke test | `flutter test` |
| Journey | Log in, add a fill-up, see it on the Dashboard, log out. Against the development project only | `integration_test` on an emulator |
| Manual, real phone | Camera capture and permission refusal; a notification arriving; airplane-mode fill-up and its later sync; TalkBack; the update-required screen | A checklist in `mobile/README.md` |
| Backend contract | Tests that freeze the response fields and error shapes the app depends on | pytest (MOB-03) |

**Keeping web and mobile consistent.**
1. **Shared cases are the contract.** A rule changes by editing its JSON cases. The web, the backend and the app each fail until they agree.
2. **Web first.** A feature is built and settled on the web, then ported. The parity table in section 5 is updated in the same change.
3. **The database is the final authority.** Both clients' checks are for good messages. The CHECK constraints and RLS are what protect the data.
4. **One live test of RLS** (PLAN-15) covers both clients, because both use the same policies.
5. **CI** runs the app's tests when `mobile/` or `shared/` changes, and the web's tests when `shared/` changes.

**Not tested on purpose:** pixel-comparison screenshots (they differ between machines and would fail for no reason), and the stores' own review.

## 11. Security review of the planned mobile surface

There is no mobile code to review, so the security-review method was applied to the design. The Supabase security advisor (read 2026-11-16) reports two things: leaked-password protection is off ([guide](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)), and five tables have RLS on with no policies (`api_limits`, `api_usage`, `api_usage_global`, `fuel_prices`, `storage_cleanup_queue`), which is deliberate: only the backend's service key may touch them ([lint 0008](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)).

| # | Risk | Severity | What the plan does |
|---|---|---|---|
| 1 | The app's code and keys can be read by anyone who downloads it. Old versions never go away | High | Only the anon key and the URL ship. RLS is re-tested live before mobile starts (PLAN-15). Database changes are add-only (ADR-3) |
| 2 | Account deletion deletes everything. If the endpoint trusted a user id from the request, one user could delete another | High | The id comes only from the verified JWT. A fresh password check is required first. Tests cover "another user's token" directly (MOB-01) |
| 3 | The session token in plain app storage can be copied from a backup or a rooted phone | Medium | Keystore-backed storage; the session is excluded from Android backups (MOB-07) |
| 4 | Another app registers the same link scheme and receives the Google sign-in return | Medium | PKCE makes the intercepted code useless on its own. Verified app links before any public release with Google sign-in |
| 5 | A phone photo carries the place it was taken. Scans are re-encoded by the backend, but receipt and maintenance photos go straight to storage | Medium | Strip location data on the phone before upload, and test it with a real geotagged photo (MOB-12, MOB-19) |
| 6 | The Trip Planner estimate is billed and uncapped | Medium | PLAN-10 is a blocker (section 2) |
| 7 | `app_config` is readable by everyone | Low | Read-only policy, no write policy, and a comment on the table saying nothing secret may go in it (MOB-02) |
| 8 | Tokens or personal data in logs | Low | No request or session logging in release builds; a test that greps for it (MOB-08) |
| 9 | Cached data survives log out | Low | Log out and deletion wipe the cache, the queue and the reminders (MOB-07, MOB-16) |
| 10 | Plain-text network traffic | Low | Cleartext disabled in the Android manifest; every address is HTTPS |

Left out on purpose: certificate pinning (it breaks the app when a certificate rotates and nobody can ship a fix quickly), root detection, and code obfuscation as a security measure.

## 12. Secrets and keys

| Item | Ships in the app? | Notes |
|---|---|---|
| Supabase URL and anon key | **Yes** | Public by design, as in the browser. Passed at build time so the development and live projects can be swapped; that is for convenience, not secrecy |
| Supabase service key | **Never** | Backend only. It bypasses RLS |
| Gemini, Groq, API Ninjas and YouTube keys | **Never** | Backend only |
| The backend's Google Maps key | **Never** | Backend only |
| A Google Maps key for the app | **Not in this plan** | Decision 16 avoids it. If one is ever added: a separate key per platform, restricted to the Android package name and signing fingerprint (or the iPhone bundle id) and to the exact APIs used, with a quota |
| The web's browser Maps key | **Never reused** | It is restricted by web address and would not work, and should not |
| Android upload keystore and its passwords | **Never in the repository** | Kept outside the repository, backed up in a password manager and one offline copy. Play App Signing on, so a lost upload key can be replaced |
| CI copies of the keystore | Only if CI ever builds releases | As encrypted repository secrets. Until then, release builds are made on your machine |
| Firebase config file (only if push is built) | Yes | Not a secret, but restrict its API key |

`backend/scripts/scan_secrets.py` already exists; MOB-05 extends its run to `mobile/`.

## 13. Repository and workflow

- **Layout.** `mobile/` (the Flutter app), `shared/fixtures/` (JSON cases), alongside `frontend/`, `backend/` and `docs/`.
- **Branches.** `mobile/<item>` from `dev`, merged to `dev` by you. Nothing in this plan pushes or merges. `main` receives mobile work only as part of a normal `dev` to `main` merge, and only after row 14 of section 2 is confirmed.
- **CI.** One workflow, triggered by changes under `mobile/` or `shared/`: `flutter analyze` and `flutter test`. No secrets. iPhone builds need Mac runners, which are billed differently (check the current rate).
- **Signing.** See section 12. Creating the keystore is your step, guided by MOB-18; no session creates or sees it.
- **Release channels.** Play internal testing (a handful of named testers, available at once), then closed testing (the period new personal accounts must complete; check the current rule), then production. For a demo, an APK installed directly on your phone needs no store at all.
- **Versions.** `mobile-v0.1.0` tags. Each release that changes what the app needs from the database or backend updates `min_supported_version` only after the new build is live.

## 14. Packages

Licences and versions were read from pub.dev on 2026-11-16. Re-check them when building; MOB-05 does.

| Need | Package | Licence | Why | Smaller alternative |
|---|---|---|---|---|
| Supabase | `supabase_flutter` 2.18.3 (supabase.io) | MIT | Auth, rows, storage and the link handling for sign-in. It already brings `shared_preferences`, `url_launcher` and `app_links` | None worth considering |
| State | **None added.** Flutter's own `ChangeNotifier` and `ListenableBuilder` | BSD-3 (SDK) | Three pieces of app-wide state (session, currency, active car), the same three the web keeps in React context | Add `flutter_riverpod` (MIT) only when passing state by hand becomes the bug source |
| Routing | **None added.** The built-in `Navigator` | BSD-3 (SDK) | About ten screens behind one login gate. The sign-in link is handled inside `supabase_flutter` | `go_router` (BSD-3, flutter.dev, feature-complete) if notification taps need to open deep screens |
| Camera and gallery | `image_picker` 1.2.4 (flutter.dev) | Apache-2.0 and BSD-3 | Uses the phone's own camera screen and the Android photo picker; no Android manifest permission needed | The `camera` package gives an in-app viewfinder with a framing guide, at the cost of permission handling and more code |
| Reminders | `flutter_local_notifications` 23.0.2 (dexterx.dev), with `timezone` and `flutter_timezone` 5.1.1 | BSD-3; Apache-2.0 for `flutter_timezone`; check `timezone` | Scheduling, the Android 13 permission prompt, rescheduling after a restart | None. Skipping reminders removes all three |
| Secure session | `flutter_secure_storage` 11.2.0 (steenbakker.dev) | BSD-3 | Keeps the session in the keystore | Leave the default plain storage (not recommended) |
| Cache, queue, currency choice | `shared_preferences` (already present through Supabase) | BSD-3 | Small JSON blobs | No local database: not `sqflite`, `drift` or `hive` |
| Links out | `url_launcher` (already present through Supabase) | BSD-3 | Privacy, Terms, YouTube, maps, the store page | None |
| Icons | `lucide_icons_flutter` 4.0.3 (vqhapp.name.vn) | MIT, icons ISC | The same icons as the web | Built-in Material icons, no package |
| App version | `package_info_plus` 10.2.2 (fluttercommunity.dev) | BSD-3 | The version for the update check and the `X-Client` header | A constant passed at build time, no package |
| Translations | `flutter_localizations` and `intl` (SDK) | BSD-3 | Strings in files from day one | Hard-coded strings, which makes Arabic a rewrite |
| Charts (Batch E only) | `fl_chart` 1.3.1 (flchart.dev) | MIT | Two simple bar charts | Draw the bars with `CustomPaint`, no package; decide in MOB-19 |
| Push (Batch F only) | `firebase_messaging` | check at the time | Only if Decision 6 changes | Local notifications |
| Tests | `flutter_test`, `integration_test`, `flutter_lints` (SDK) | BSD-3 | | Hand-written fakes instead of a mocking package |

That is eight packages added for the MVP (Supabase, the picker, three for reminders, secure storage, icons, app version). Not added: a connectivity package (a failed request is the offline signal), a permissions package (the picker reports a refusal), an image-compression package unless the 2 MB check proves it necessary in MOB-12, an analytics or crash-reporting SDK (each one adds a line to the store privacy forms), and any animation or UI kit.

## 15. Topics not covered elsewhere

**Camera and photos (topic 6).**
- The phone's own camera screen through `image_picker`, with the gallery as the second choice on every scan.
- The picker resizes to 1600 px on the longest edge and saves JPEG, the web's numbers. The app then checks the file is at most 2 MB, the bucket's limit for `record-photos`; if not, it asks for another photo. A quality ladder like the web's (0.85 down to 0.45) is added only if real phones produce files over the limit.
- iPhone photos are often HEIC. The bucket for record photos accepts JPEG only, and the picker's simulator cannot pick HEIC at all, so this must be proven on a real iPhone in MOB-22.
- Location data is stripped before upload (section 11, risk 5).
- Receipt and maintenance photos follow the web's order exactly: create the database row first, then upload to the path the policy expects (`<user>/receipts/<expense>/<id>.jpg`), and remove the row if the upload fails.
- Permissions. Android needs none for the picker. iPhone needs a camera sentence and a photo-library sentence. Suggested wording: "CarSage uses the camera to read your pump, odometer or dashboard photo." and "CarSage lets you pick a photo to scan or attach to a record."
- Refused permission: say what happened in one sentence, offer the gallery and typing the numbers, and explain how to turn the camera on in Settings. No dead end.

**Offline and connectivity (topic 8).** ADR-6. In short: cached lists are readable offline; a fill-up can be saved offline; nothing else can. A queued fill-up shows a "waiting to send" mark. If the server refuses it later (for example the car was deleted on the web), the app keeps it visible with the reason and a delete button, and never drops it silently.

**Localisation (topic 10).** Decision 12. English at launch, built ready for right-to-left. Western digits in both languages. USD and LBP only, with the rate from `app_config`. The real costs of Arabic are outside the app: backend messages are English sentences, the Advisor answers in English, and the legal pages are your wording.

**App store requirements (topic 11).**

| Requirement | Status today | Plan |
|---|---|---|
| In-app account deletion, and a web address where deletion can be requested | Missing | MOB-01 (web and backend), MOB-16 (app) |
| Privacy policy address | Exists at `/privacy` | Update the wording for the app, deletion and notifications. Your wording |
| Data safety form (Play) and privacy labels (Apple) | Not started | MOB-18 drafts answers from the Privacy page: email, name, car data, photos, addresses typed into the Trip Planner; shared with Google (Gemini, Maps), Groq, API Ninjas, YouTube; no advertising, no tracking |
| Gemini photo disclosure | On the web beside each scan | Same sentence in the app, a one-time acknowledgement, and declared in both forms (Decision 15) |
| AI-generated content | The Advisor gives car advice | Keep the "not a substitute for a mechanic" wording. Check each store's current rules for AI content, including any requirement to let users report a bad answer |
| Permission texts | None | Section above; notifications are asked for at the moment the user turns reminders on, not at first launch |
| Age rating | Not done | Answer the questionnaires honestly; nothing here suggests more than the lowest general rating, but the store decides |
| Sign-in for the reviewer | None | A demo account you create and keep, on the live project |
| Developer account fees | | Check the current fee for Google Play and for the Apple Developer Program. I am not stating prices |
| Target Android version | | Play raises the required target level each year; check the current one in MOB-18 |

**Review risks, most likely first:** no account deletion; photos sent to a third-party AI without clear consent; an app that looks like a website in a box (not the case with this plan); car-brand logos; a reviewer who cannot log in; "student project" wording that reads as unfinished.

**What `flutter doctor` showed (2026-11-16).** Flutter 3.50.0 stable, Dart 3.14.0, at `D:\flutter_sdk\flutter\flutter_windows_3.29.0-stable\flutter` (the folder name says 3.29 but the SDK inside is 3.50). Android toolchain ready: SDK 36, licences accepted, Java 21 from Android Studio. Chrome and Edge available. One issue: Visual Studio is not installed, which only matters for Windows desktop apps and not for this plan. No iPhone toolchain exists on Windows, so iPhone builds are impossible on this machine. No Android phone or emulator was connected when it ran.

## 16. What would make this a bad idea right now

Stated plainly, as asked.

1. **There are 3 users.** Nobody has asked for an app. The mobile website works. 140 to 210 hours is a great deal of work for an audience that could be served by a home-screen shortcut.
2. **The web still has open work that matters more.** `docs/IMPROVEMENT_PLAN.md` lists a billed endpoint with no cap, an untested security claim, stored data users cannot delete, and no CI. Those are roughly 30 to 45 hours and protect real users today.
3. **It is a capstone with a deadline and a mentor review**, and CLAUDE.md says scope discipline matters more than features. Starting this before submission is exactly the scope creep that file warns about.
4. **The backend sleeps.** A phone app that takes up to a minute to answer its first scan feels broken in a way a website does not. The warm-up helps; it does not cure it.
5. **Every scan sends a photo to a free AI tier where people may read it.** That is acceptable on a student website with a notice. It is a harder sell in a store listing.
6. **iPhone is out of reach without spending money**, and many of the people you would show this to carry one.
7. **You become the maintainer of two apps.** The first release is the cheap part.

**When it stops being a bad idea:** section 2 is true, the capstone is submitted, and you want it either because real users ask for reminders and at-the-pump logging, or because building a Flutter app is itself the goal. The second reason is a perfectly good one. It should just be chosen knowingly.

## 17. Hard questions asked of this plan

The grilling skill was run against the draft. Nobody was available to answer, so these are the hardest questions and my answers. Where the answer is really yours, it points at a decision.

1. **The site works on a phone. What does the app do that the site cannot?** Three things: reminders without a server, saving a fill-up with no signal, and a faster camera. If those three are not worth the hours, take the installable web app.
2. **Why Flutter, when the rules are already JavaScript?** Because it was asked for and the SDK is here. React Native would delete MOB-04's reason to exist for mobile and all of MOB-09. That is roughly 20 to 30 hours and a permanent drift risk. It is worth one honest thought before starting (Decision 2).
3. **Three copies of the km/L rule. Is that not the smell?** Yes. Shared cases make it safe, not good. The one-copy answer is a Postgres function, and it becomes right the day a server job needs the rule too.
4. **A user installs version 1 and never updates. In a year you rename a column. What happens?** Their app breaks, or worse, writes the old shape. Hence add-only, and hence the version gate in build 1. The gate cannot stop a direct Supabase call; only compatible schemas can.
5. **Does any of this slow the web?** Three ways it could: a `mobile/` commit triggering a paid deploy (row 14), the fixtures item touching web tests (test files only, no shipped code), and backend changes (CI first, row 8). No shipped web code changes in this plan except the account-deletion button, which the web needs anyway.
6. **Local notifications miss an item edited on the website. Is that acceptable?** For a single driver with one phone, yes. The Maintenance screen says "reminders are set on this phone".
7. **What about distance-based items?** The app can only know the distance when a new odometer reading arrives. It reminds at that moment and not on a date. Guessing a date from average driving is tempting and wrong often enough to annoy.
8. **Play wants testers. You have 3 users.** Then the public release waits on recruiting people, not on code. The demo does not: internal testing and a directly installed APK need no waiting period. Start recruiting when Batch C starts.
9. **Testing against production?** No. Decision 10.
10. **Is secure storage worth a package?** Yes. The session token is the key to every row the user owns.
11. **Why no router and no state library?** Ten screens and three shared values. Each has a named trigger for adding the package later (section 14).
12. **Which "today" does maintenance use?** The web uses Beirut's date, and the port keeps that so both clients agree on what is overdue. Reminders fire in the phone's own time zone. A user abroad may see a one-day difference between the two; accepted.
13. **Are receipts scanned by AI?** No. The Privacy page says photos attached to maintenance and expenses stay private. Only the pump, odometer and Advisor photos go to Gemini. The app must keep that line exactly.
14. **What is the first thing to cut if hours run out?** The offline queue (MOB-13), then Google sign-in on mobile, then the car photo. Never account deletion, the version gate or the accessibility pass.

## 18. Phased work items

Batches ship on their own. A to D are the MVP.

| Batch | Items | Hours | Ships |
|---|---|---|---|
| A. Before mobile (web, backend, database) | MOB-01 to MOB-04 | 23 to 35 | Account deletion on the web; version and rate config; frozen API shapes; shared cases |
| B. Foundation | MOB-05 to MOB-10 | 50 to 74 | An app that boots, logs in and shows the Dashboard on your phone |
| C. MVP features | MOB-11 to MOB-17 | 60 to 86 | Cars, Fuel Log with scans and offline save, Maintenance with reminders, settings, accessibility |
| D. Release | MOB-18 | 8 to 12 | An Android build on a Play test track |
| E. Parity | MOB-19 to MOB-21 | 36 to 52 | Expenses, Trip Planner, AI Advisor |
| F. Optional | MOB-22 to MOB-24 | 70 to 115 | iPhone; push; Arabic |

**What could blow the estimate:** the first Android release always takes longer than planned (signing, forms, the tester rule); the camera behaves differently on each phone brand; scheduled notifications are unreliable on some Android phones; the month arithmetic in the maintenance port; a web change landing mid-port; and anything on iPhone, which starts with buying access to a Mac.

## Batch A: before mobile (web, backend and database)

No Flutter here. Each item improves or protects the web app on its own, and all four must be done before Batch B.

### MOB-01 · Web and backend / account · Let a user delete their own account, on the web and through the backend

- **problem:** CarSage has no way to delete an account. Both app stores require it inside the app, and Google Play also wants a web address where deletion can be requested. Nothing exists: no endpoint, no button, and no code that calls the admin delete.
- **outcome:** A signed-in user can delete their account from the web. The backend removes the sign-in, every row and every stored photo. The phone app later calls the same endpoint (MOB-16).
- **effort:** M, 8 to 12 hours
- **risk:** It is permanent and it runs with the service key. The user id must come only from the verified token. Database rows cascade from `auth.users` through `profiles` (every foreign key was `ON DELETE CASCADE` on 2026-11-16), but files in the `car-photos` and `record-photos` buckets do not cascade and must be removed explicitly. The Privacy wording changes, which needs your text.
- **depends on:** PLAN-29 (web CI) recommended first
- **decision needed:** yes (Decision 5, and the Privacy wording)
- **suggested model:** Opus (auth, permanent deletion, service key)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-01): Let a user delete their own account, on the web and through the backend

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. This is a Batch A item (web, backend or database). Ask me which rows of "Before mobile starts" in docs/FLUTTER_APP_PLAN.md are done, and tell me if this item depends on one that is not.
7. Create the work branch from dev: `git switch -c mobile/account-deletion`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Search backend/app and frontend/src for an existing account deletion (`delete_user`, `deleteUser`, `/account`). If one exists, stop and tell me.
- Through the Supabase connector, read every foreign key in `public` (`pg_constraint`) and confirm each chain from `auth.users` still ends in `ON DELETE CASCADE`. List any that does not.
- Read how backend/app/auth.py verifies the caller and how backend/app/services/storage_cleanup.py removes storage files; reuse both.
- Read the delete-with-confirm pattern in frontend/src/pages/CarProfilePage.jsx; copy it, do not invent a new one.
- Ask me for the approved Privacy wording about account deletion. If I have none yet, build everything else and leave the wording untouched.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Backend: `DELETE /account` in a new router, protected by `get_current_user_id`. The user id comes only from the token; the request has no id field. It requires the current password in the body and checks it with a sign-in call before deleting (for a Google-only account, require the typed word DELETE instead and say so in the reply to me).
- Order of work inside the endpoint: remove every object under `<user id>/` in `car-photos` and `record-photos`, then delete the auth user with the service client, which cascades the rows. If file removal fails part way, still delete the user and leave the leftovers to the existing cleanup queue; never leave an account half deleted without logging it.
- Responses: 204 on success, 401 for a bad token, 403 for a wrong password with a fixed sentence, 503 if Supabase is unreachable. No raw error text.
- Web: a "Delete account" danger area at the bottom of the My Car page or wherever the account controls live today, with a confirm step that names what will be lost, a password field, and a clear success state that signs the user out and returns to the Landing page.
- Tests, backend: success; wrong password; no token; a token for user A can never delete user B (there is no way to name B, and prove it); storage failure still deletes the user. Tests, web: confirm, cancel, wrong password, server error.
- Do not run any test against the live project that deletes a real user. Use fakes, as the existing backend tests do.

DONE WHEN
- A signed-in user can delete their account from the web after confirming with their password, and is signed out.
- No endpoint input can select which user is deleted.
- The page still passes axe at 390 px and 1280 px, and the bundle check passes.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/account-deletion, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- This item changes the web app or backend on purpose. Change only what it names. Styling is plain CSS only: no animation library, no UI library, no new icon library, no outside fonts. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- If frontend/ changes: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after, and report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Run the full suites and report the counts before and after: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline on 2026-11-16: 1869 frontend and 806 backend tests passing.
- Existing backend routes may only gain optional fields. Never rename or remove a response field or change an error shape: installed phone apps will depend on them.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The foreign-key chain you confirmed.
- How Google-only accounts are confirmed, and why.
- Bundle numbers before and after.
- The Privacy wording you used, or that none was given.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-02 · Database / configuration · A public, read-only app_config row: minimum app version, exchange rate, store links

- **problem:** An installed app cannot be forced to update, and the LBP rate (89,700) is compiled into the web and the backend. A phone app with a compiled-in rate or no update check can never be corrected without a store release.
- **outcome:** One row in a new `app_config` table that any client can read through Supabase and nobody can write through the API. It holds the minimum supported and latest version per platform, the LBP per USD rate and the store addresses.
- **effort:** S, 3 to 5 hours
- **risk:** It is readable without logging in, so a secret placed in it would be public. A wrong minimum version would lock every user out of the app; the app must treat a missing or unreadable row as "no minimum".
- **depends on:** nothing
- **decision needed:** yes (Decision 8; a migration on the live database)
- **suggested model:** Opus (database and access rules)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-02): A public, read-only app_config row: minimum app version, exchange rate, store links

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. This is a Batch A item (web, backend or database). Ask me which rows of "Before mobile starts" in docs/FLUTTER_APP_PLAN.md are done, and tell me if this item depends on one that is not.
7. Create the work branch from dev: `git switch -c mobile/app-config`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Through the Supabase connector, confirm there is still no `app_config` table and list the tables that exist.
- Find every place the LBP rate is defined (`LBP_PER_USD` in frontend/src/lib/currency.js and backend/app/services/fuel_prices.py) and report whether the two values still agree.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Write the migration: table `public.app_config` with a single enforced row (for example a boolean primary key fixed to true), columns `min_version_android`, `min_version_ios`, `latest_version_android`, `latest_version_ios` (text, nullable), `lbp_per_usd` (numeric, greater than zero), `store_url_android`, `store_url_ios` (text, nullable, https only), `updated_at`. RLS on. One SELECT policy for `anon` and `authenticated`. No INSERT, UPDATE or DELETE policy, and revoke those grants. A table comment saying nothing secret may ever be stored here.
- Seed the row with null versions and the current rate. Include the undo SQL as a comment. Show me and STOP until I say it has been run.
- After I confirm: add nothing to the web. The web keeps its compiled rate. Write down in the migration file's header that the web may adopt the row later and that this plan does not do it.
- Add a section to backend/README.md, "Changing the database while phone apps exist": add only; never rename, drop or tighten while an older app version is supported; raise the minimum version only after the new build is live.
- Re-run get_advisors (security) after I have applied it and report the result.

DONE WHEN
- An anonymous read of `app_config` returns exactly one row; an anonymous write is refused.
- The migration file in docs/db_migrations/ matches what I ran.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/app-config, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs a database change. Write the SQL as a new dated file in docs/db_migrations/, show me the full SQL and how to undo it, and STOP. Do not apply it yourself. Go on only after I tell you it has been run. The change must be add-only: no rename, no drop, no tighter constraint.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- This item changes the web app or backend on purpose. Change only what it names. Styling is plain CSS only: no animation library, no UI library, no new icon library, no outside fonts. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- If frontend/ changes: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after, and report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Run the full suites and report the counts before and after: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline on 2026-11-16: 1869 frontend and 806 backend tests passing.
- Existing backend routes may only gain optional fields. Never rename or remove a response field or change an error shape: installed phone apps will depend on them.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The exact SQL and my confirmation that it was run.
- The advisor result afterwards.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-03 · Backend / compatibility · Freeze the API shapes the app will depend on, and refuse app versions below the minimum

- **problem:** Nothing stops a web-motivated backend change from renaming a field that an installed app reads. And the backend has no way to turn away an app version that is too old.
- **outcome:** Contract tests pin the response fields and error shapes of every route the app will call. A small check answers 426 to a phone app whose version is below `app_config`'s minimum. The web is unaffected because it sends no client header.
- **effort:** S to M, 4 to 6 hours
- **risk:** A version check that fails closed would block every phone if `app_config` cannot be read. It must fail open. The web must never receive a 426.
- **depends on:** MOB-02
- **decision needed:** no
- **suggested model:** Opus (API contract)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-03): Freeze the API shapes the app will depend on, and refuse app versions below the minimum

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. This is a Batch A item (web, backend or database). Ask me which rows of "Before mobile starts" in docs/FLUTTER_APP_PLAN.md are done, and tell me if this item depends on one that is not.
7. Create the work branch from dev: `git switch -c mobile/api-contract`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- List every route in backend/app/routers and its response model. On 2026-11-16 they were: GET /health, POST /trip-planner/directions, GET /trip-planner/fuel-prices, POST /trip-planner/estimate, GET /car-specs/spec-suggestions, POST /ai-advisor/classify, POST /fuel-camera/scan-pump, POST /fuel-camera/scan-odometer, POST /advisor-camera/scan-photo. Report any difference, including exact prefixes.
- Confirm error bodies are still `{"detail": "sentence"}` and, for 422, a list of `loc`, `msg`, `type` (backend/app/main.py).
- Confirm `app_config` exists.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Add backend/tests/test_api_contract.py: for each route, assert the exact set of response field names and types from its response model, and the status codes and body shape of its error cases. A failing test here must mean "an installed app would break"; say so in the file header.
- Add a middleware or dependency that reads an optional `X-Client` header of the form `carsage-android/1.2.3` or `carsage-ios/1.2.3`. No header, or a header it cannot parse: do nothing. A parsed version below the cached minimum for that platform: 426 with a fixed sentence asking the user to update. Cache `app_config` in memory for a few minutes; if it cannot be read, allow the request.
- GET /health is never blocked.
- Tests: no header passes; a web-style request passes; equal and newer versions pass; an older version gets 426; unreadable config passes; a malformed header passes.
- Add a short "API rules" section to backend/README.md: existing routes only gain optional fields; a breaking change is a new route.

DONE WHEN
- Renaming any response field on any route fails a test.
- The web app's requests are provably unaffected (a test without the header on every route).

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/api-contract, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- This item changes the web app or backend on purpose. Change only what it names. Styling is plain CSS only: no animation library, no UI library, no new icon library, no outside fonts. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- If frontend/ changes: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after, and report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Run the full suites and report the counts before and after: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline on 2026-11-16: 1869 frontend and 806 backend tests passing.
- Existing backend routes may only gain optional fields. Never rename or remove a response field or change an error shape: installed phone apps will depend on them.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The list of routes and fields now pinned.
- How the version comparison handles 1.10.0 against 1.9.0.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-04 · Tests / shared rules · Put the shared business rules into JSON test cases that the web already passes

- **problem:** The rules the phone app must copy live in frontend/src/lib/*.js. Only one of them (real km/L) has cases that a second language can read. Without shared cases, a Dart copy can drift and nobody finds out.
- **outcome:** A top-level shared/fixtures/ folder with JSON cases for each rule, and web tests that read them. The Dart ports (MOB-09) will read the same files. Test files and JSON only: no shipped web code changes.
- **effort:** M, 8 to 12 hours
- **risk:** Cases written by reading the code simply restate its bugs. Write them from the behaviour the existing tests already assert. Moving `efficiency_cases.json` would break two suites if a path is missed.
- **depends on:** PLAN-29 (web CI) recommended first
- **decision needed:** no
- **suggested model:** Sonnet (mechanical, test-only)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-04): Put the shared business rules into JSON test cases that the web already passes

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. This is a Batch A item (web, backend or database). Ask me which rows of "Before mobile starts" in docs/FLUTTER_APP_PLAN.md are done, and tell me if this item depends on one that is not.
7. Create the work branch from dev: `git switch -c mobile/shared-fixtures`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Confirm these modules and exports still exist, and report any that moved or changed: odometer.js (`realEfficiency`, `fillUpEfficiencies`, `stepDispositions`, `getOdometerError`, `getOdometerOrderWarning`, `distanceSincePrevious`, `latestOdometer`, `meetsTripPlannerFloor`), fuelLog.js (`getFillUpErrors`, `pricePerLiter`, `pricePer20Liters`, `sortFillUps`), maintenance.js (`nextDue`, `maintenanceStatus`, `addMonths`, `daysBetween`, `todayInBeirut`, `sortByUrgency`, `getMaintenanceItemErrors`, `getCompletionErrors`), currency.js (`convertAmount`, `formatMoney`), costs.js (`monthlySummary`, `monthlyChartPoints`, `getExpenseErrors`), carSnapshot.js (`carSnapshot`, `economyOf`), diySuccess.js (`diyFixCounts`, `diyFixRate`, `timeAgo`), limits.js (`LIMITS`, `getVinError`, `getCarFieldErrors`, `describeAuthError`, `describeApiFetchError`), trafficLevel.js (`getTrafficLevel`), carBrandThemes.js (`DEFAULT_THEME`, `getBrandTheme`, `RECOGNIZED_MAKES`).
- Read frontend/src/lib/odometer.parity.test.js and backend/tests/test_real_efficiency.py to see the existing pattern.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Create shared/fixtures/ with one JSON file per rule group, each `{ "cases": [ { "name", "input", "expected" } ] }` with a short `about` field. Take cases from what the existing `*.test.js` files already assert, and add the edges that matter across languages: month ends and leap days for `addMonths`; midnight in Beirut against UTC for `todayInBeirut`; rounding and thousands separators for `formatMoney` in USD and LBP; a 17-character VIN with I, O or Q, lower case, and surrounding spaces; equal-date ordering for fill-ups; the 14-day and 500 km due-soon boundaries, exactly on and one either side.
- Decide with me before moving anything whether `backend/tests/fixtures/efficiency_cases.json` moves to shared/fixtures/ (both suites updated in the same commit) or stays and is referenced. Default: leave it where it is and say so in shared/fixtures/README.md.
- Export the brand themes to shared/fixtures/brand_themes.json and the field limits to shared/fixtures/limits.json, each with a web test proving the file equals the JavaScript source.
- Add `*.fixtures.test.js` files beside each module that run every case. No change to any non-test file under frontend/src or backend/app.
- Write shared/fixtures/README.md: what the folder is, that a rule changes by changing its cases first, and which three test suites read it.

DONE WHEN
- `git diff --stat dev -- frontend/src backend/app` shows only test files.
- Every listed rule has cases, and the web suite passes with them.
- The bundle check numbers are identical before and after.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/shared-fixtures, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- This item changes the web app or backend on purpose. Change only what it names. Styling is plain CSS only: no animation library, no UI library, no new icon library, no outside fonts. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- If frontend/ changes: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after, and report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Run the full suites and report the counts before and after: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline on 2026-11-16: 1869 frontend and 806 backend tests passing.
- Existing backend routes may only gain optional fields. Never rename or remove a response field or change an error shape: installed phone apps will depend on them.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The fixture files and how many cases each holds.
- Any case where the existing behaviour looked wrong: report it, do not fix it.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch B: foundation

Ends with an app on your own phone that logs in and shows the Dashboard. Nothing in this batch touches frontend/ or backend/.

### MOB-05 · Mobile / project · Create the Flutter project in mobile/, with lint, CI and proof that it triggers no web deploy

- **problem:** There is no Flutter project. Before one exists in this repository, it must be certain that a commit under mobile/ does not start a paid Netlify build or a Render deploy.
- **outcome:** mobile/ holds an empty, analysable, tested Flutter app for Android that builds a debug APK. A CI workflow runs only for mobile/ and shared/. The deploy settings are confirmed by me in writing.
- **effort:** S to M, 4 to 6 hours
- **risk:** A deploy to `main` costs credits. The package name is permanent once published. The installed SDK may have changed.
- **depends on:** Batch A; rows 14 and 16 of "Before mobile starts"
- **decision needed:** yes (the Android package name; Decisions 10 and 11)
- **suggested model:** Opus (repository, CI and deploy safety)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-05): Create the Flutter project in mobile/, with lint, CI and proof that it triggers no web deploy

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/scaffold`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Run `flutter --version` and `flutter doctor` and report them. On 2026-11-16: Flutter 3.50.0 stable, Dart 3.14.0, Android toolchain ready, no iOS toolchain, Visual Studio missing (irrelevant).
- Confirm mobile/ and shared/ do not already hold a Flutter project.
- Ask me: (a) the Android package name, for example a reverse-domain name I own; (b) whether I have confirmed in the Netlify and Render dashboards that a commit touching only mobile/ starts no build, and how (base directory, ignore command or root directory filter). If (b) is not confirmed, STOP: do not create the project.
- Check whether .github/workflows exists and what it runs (PLAN-29).
- Re-read the licence and publisher of each package in section 14 of the plan on pub.dev and report any change.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Create the project with `flutter create` for Android only, in mobile/, with the package name I gave. Remove the counter demo. Keep the generated .gitignore and add entries for the build-time config file, `key.properties` and any keystore.
- Turn on `flutter_lints` with the strict settings the SDK recommends. Set up `flutter_localizations` and one English translation file with a single string, so the pattern exists from the first screen.
- Build-time config: the Supabase URL, anon key and API base address come from a git-ignored file passed with `--dart-define-from-file`, with a committed example file holding placeholders. The app shows a plain error screen if they are missing.
- Android manifest: cleartext traffic off; the session must not be included in device backups.
- One widget test that the app starts. One test that fails if any file under mobile/lib contains a string that looks like a service key or a Google, Gemini or Groq key; extend `backend/scripts/scan_secrets.py` usage notes if it can simply be pointed at mobile/.
- CI: one workflow, triggered only by changes under mobile/ or shared/, running `flutter analyze` and `flutter test`. No secrets. Do not edit an existing web workflow except to add shared/ to its triggers, and only if one exists.
- mobile/README.md: how to run on a phone, how to pass the config file, the manual test checklist heading (empty for now), and the rule that this folder never holds a secret.
- Build a debug APK once to prove the toolchain, and report its size.

DONE WHEN
- `flutter analyze` is clean and `flutter test` passes in mobile/.
- A debug APK builds.
- My confirmation about Netlify and Render is quoted in the report.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/scaffold, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- `flutter doctor` output.
- The package name used.
- My deploy-setting confirmation, quoted.
- The debug APK size.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-06 · Mobile / design system · The CarSage theme in Flutter: colours, type, brand themes, icons and motion

- **problem:** The design system exists only as CSS variables and a JavaScript theme table. The app needs the same look from one source, with the same contrast guarantees.
- **outcome:** A Flutter theme built from the web's tokens, the per-car brand themes loaded from the shared JSON, bundled fonts, the icon set, motion tokens that respect the system setting, and a small gallery screen that shows every component in every state.
- **effort:** M, 8 to 12 hours
- **risk:** A brand theme that passes contrast in CSS can fail in Flutter if a token is mapped to the wrong role. Fonts add to the app's size. Dark mode is deliberately absent.
- **depends on:** MOB-05, MOB-04
- **decision needed:** no (Decisions 13 and 17 already say light only, no logos)
- **suggested model:** Sonnet (mechanical, from a written spec)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-06): The CarSage theme in Flutter: colours, type, brand themes, icons and motion

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/theme`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read section 8 of docs/FLUTTER_APP_PLAN.md. Then read the `:root` tokens in frontend/src/index.css and frontend/src/theme/carBrandThemes.js and report any value that differs from the table in section 8.
- Confirm shared/fixtures/brand_themes.json exists and matches carBrandThemes.js.
- Find the font files and their licence text under frontend/src/assets/fonts and confirm the licence is still the SIL Open Font License.
- Open docs/stitch_carsage_landing_page/carsage/DESIGN.md and the matching screen.png files for layout and spacing only.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Packages allowed: `lucide_icons_flutter` only (or none, using Material icons, if its licence is no longer MIT or ISC; tell me which).
- Build `ThemeData` from the tokens: colour scheme, a theme extension for the tokens Material has no slot for (accent text, text muted, input fill, the three fixed status colours), text theme with Manrope for body and Space Grotesk for headings, radii 8 and 12, 8-point spacing constants.
- Bundle the fonts as full font files with their licence text; nothing is downloaded at run time. Add the Lucide and font notices to the app's licence registry.
- Brand themes: load shared/fixtures/brand_themes.json as an asset and produce a theme per make, falling back to the default for an unknown make. Lock the app to the light theme.
- Components, each with all states from section 8: primary and secondary button, text field, number field, status badge, card with loading, empty and error forms, bottom navigation with four labelled tabs.
- Motion: three duration constants (120, 180, 280 ms) and one helper that returns zero when the system asks for no animations. No animation package.
- Tests: port frontend/src/theme/themeContrast.test.js so every brand theme proves 4.5:1 for text and 3:1 for controls; the status colours are identical under every brand; each component passes Flutter's tap-target and text-contrast guidelines; each component renders at double text size without overflow; animations are zero-length when disabled.
- A debug-only gallery screen listing every component in every state under a brand switcher.

DONE WHEN
- Every brand theme passes the ported contrast test.
- The gallery shows no overflow at double text size.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/theme, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- Any token that differed from the plan.
- Screenshots of the gallery in the default theme and two brand themes.
- The app size change from the fonts.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-07 · Mobile / auth · Sign up, log in, Google sign-in, log out and a securely stored session

- **problem:** The app needs the same accounts as the web. By default the Supabase Flutter library keeps the session in plain app storage, and Google sign-in needs a way back into the app.
- **outcome:** Welcome, Log In and Sign Up screens. Email and password work. Google sign-in works on Android through the system browser. The session lives in the keystore, survives a restart and is wiped on log out. "Forgot password" sends the email and explains that the link opens the website.
- **effort:** M to L, 10 to 14 hours
- **risk:** Sign-in bugs lock users out. A custom link scheme can be claimed by another app (PKCE limits the damage). Whether email confirmation is switched on in the Supabase dashboard is unknown from the code. Log out must not end the user's web session.
- **depends on:** MOB-05, MOB-06
- **decision needed:** yes (Decision 9; you add the redirect address in the Supabase dashboard)
- **suggested model:** Opus (auth and session security)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-07): Sign up, log in, Google sign-in, log out and a securely stored session

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/auth`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/auth/AuthContext.jsx and frontend/src/pages/AuthPage.jsx and list exactly what the web offers (on 2026-11-16: email and password sign-up and sign-in, Google sign-in redirecting to /dashboard, reset email redirecting to /reset-password).
- Read `describeAuthError` in frontend/src/lib/limits.js and the cases for it in shared/fixtures.
- Use the Supabase docs search for the current `supabase_flutter` guidance on: the default session storage and how to supply a custom one, the default auth flow type (confirm PKCE), deep link setup on Android, and the sign-out scopes. Quote what you find; do not rely on memory.
- Ask me: is email confirmation switched on for sign-up, and have I added the app's redirect address (scheme and host) to the redirect allow list? If the allow list is not done, build everything except Google sign-in and stop there.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Packages allowed: `supabase_flutter`, `flutter_secure_storage`.
- Initialise Supabase from the build-time config with PKCE and a custom session store backed by `flutter_secure_storage`.
- An auth state holder built on `ChangeNotifier` with three states (loading, signed in, signed out), mirroring `useAuthStatus` on the web. A gate at the top of the app shows the Welcome screen or the app shell.
- Screens: Welcome (logo, Log In, Sign Up), Log In, Sign Up, each matching docs/stitch_carsage_landing_page/carsage_sign_up_authentication for layout. Same field rules and the same error sentences as the web, driven by the shared cases. Password fields support paste and the system password manager.
- After sign-up with confirmation on: a "check your email" screen saying the link opens the CarSage website and that they should then return here and log in.
- Forgot password: send the reset email with the web's /reset-password address as the redirect, then show the same explanation.
- Google sign-in: `signInWithOAuth` in the external browser with the app's redirect address; handle the return; handle the user closing the browser.
- Log out: this device only (local scope). Wipe the secure session, any cached data and any scheduled reminders through one `clearLocalData()` function that later items extend.
- A resumed app with an expired session refreshes once; if that fails it returns to Log In with the fixed session-expired sentence.
- Tests with a fake auth client: every state transition; every error code to its sentence; log out clears local data; the gate never shows app content while loading.
- Add to the manual checklist in mobile/README.md: sign up, confirm by email, log in, restart the app and stay logged in, Google sign-in, log out, then confirm the web session in a browser is still alive.

DONE WHEN
- The session survives an app restart and is gone after log out.
- No screen shows raw error text from Supabase.
- TalkBack reads each field's label and each error.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/auth, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- What the docs said about storage, flow type and sign-out scope, quoted.
- Whether Google sign-in was built or left waiting on the allow list.
- The manual checklist results from my phone (ask me to run them).
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-08 · Mobile / plumbing · Backend client, cold-start handling, the update-required gate and the read cache

- **problem:** Every later screen needs the same four things: a way to call FastAPI with the right headers and error handling, a calm way to wait for a sleeping server, a check that the app is not too old, and a cache so lists are readable offline.
- **outcome:** One API client, one config loader, one cache, each small and tested. The app shows a blocking "Update CarSage" screen when it is below the minimum version.
- **effort:** M, 8 to 12 hours
- **risk:** A version gate that fails closed would lock users out when offline. An automatic retry on a scan would spend the user's daily allowance twice. Logging a token would leak it.
- **depends on:** MOB-07, MOB-02, MOB-03
- **decision needed:** no (Decision 14 keeps the free tier)
- **suggested model:** Opus (error handling, versioning, data on the device)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-08): Backend client, cold-start handling, the update-required gate and the read cache

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/core-plumbing`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/lib/apiClient.js and frontend/src/lib/coldStart.js and report the current threshold (6000 ms on 2026-11-16) and error handling.
- Confirm the 426 behaviour and the `X-Client` header format in the backend (MOB-03), and the `app_config` columns (MOB-02).
- Check whether PLAN-13 has shipped on the web (no "waking up the server" during a normal photo scan) and copy its rule.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Package allowed: `package_info_plus`. Nothing else; `shared_preferences` is already present through Supabase.
- API client: one function mirroring `apiFetch`: JSON or multipart body, `Authorization` from the current session read at call time, `X-Client: carsage-android/<version>`, a 75-second limit, a plain-sentence error from `detail` when it is a string and the fixed generic sentence otherwise. 401: refresh once, then sign out. 426: switch the app to the update-required screen. 429: the server's sentence. Network failure: the fixed network sentence.
- No automatic retry except one retry of GET requests after a connection failure. Never retry a POST.
- Cold start: a fire-and-forget `GET /health` when the app comes to the foreground, at most once every ten minutes. A `slow` flag raised after 6 seconds on non-scan calls only, for screens to show an inline "waking up the server" note.
- Config: read `app_config` through Supabase at start, cache the last good row on the device, and expose the rate and the minimum version. Unreadable or missing: use the cached row; no cached row: no minimum and the compiled fallback rate.
- Update gate: compare versions number by number (1.10.0 is newer than 1.9.0). Below the minimum: a full-screen message with one button that opens the store address from the row.
- Read cache: `saveList(key, json)` and `readList(key)` in `shared_preferences`, with the time saved. Extend `clearLocalData()` to wipe it.
- Release builds log nothing about requests, tokens or users. A test fails if `print` or `debugPrint` is called with a session or header value.
- Tests: every status code path; the retry rule; the version comparison including unequal lengths; the fail-open paths; cache round trip and wipe.

DONE WHEN
- With the network off, the app still opens to cached data and never shows the update screen by mistake.
- A POST is provably never sent twice.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/core-plumbing, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The fail-open cases you tested.
- Where the slow flag is and is not raised.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-09 · Mobile / shared rules · Port the MVP's business rules to Dart, proven by the shared test cases

- **problem:** The MVP screens need the same answers as the web for real km/L, odometer checks, fill-up rules, maintenance status, currency and field limits.
- **outcome:** Pure Dart functions in mobile/lib/logic/, with no Flutter imports, each passing every case in shared/fixtures/.
- **effort:** M to L, 12 to 18 hours
- **risk:** Date arithmetic and number formatting behave differently in Dart and JavaScript: month ends, time zones, floating-point rounding and thousands separators. A port that passes weak cases is worse than no port.
- **depends on:** MOB-04, MOB-05
- **decision needed:** no
- **suggested model:** Sonnet (mechanical port against fixed cases)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-09): Port the MVP's business rules to Dart, proven by the shared test cases

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/logic-ports`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- List the files in shared/fixtures/ and confirm each still matches its JavaScript module (the web suite proves it: run it).
- Re-read the JavaScript sources for the rules below and report any export added or changed since 2026-11-16.
- Check that the backend's real-efficiency fixture (`efficiency_cases.json`) is still where shared/fixtures/README.md says it is.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Package allowed: `timezone` only if the Beirut date cannot be computed correctly without it; say why. Otherwise none.
- Port, one file per source module, keeping the JavaScript names where Dart allows: odometer (real km/L, per-step figures, step dispositions, odometer error, order warning, distance since previous, latest odometer, the Trip Planner floor), fuelLog (fill-up errors, price per liter, price per 20 liters, sorting), maintenance (next due, status, add months, days between, today in Beirut, urgency sort, item and completion form errors, the dashboard summary), currency (convert, format), limits (the limits table from shared/fixtures/limits.json, VIN rule, car field errors, the error-sentence mappings), carSnapshot.
- Money and liters arrive from Postgres as numeric strings; parse them the way the web does and note any place where a double could lose precision.
- One test file per port that loads the JSON and runs every case. Comparisons of computed decimals use the same tolerance as the web's parity test.
- If a case fails because Dart and JavaScript genuinely differ (for example rounding half to even), fix the Dart code to match the case. Never edit a case to make a port pass; if a case looks wrong, stop and tell me.
- Not in this item: costs, DIY statistics and traffic level. They are ported with their screens in Batch E.

DONE WHEN
- Every shared case passes in Dart, and the web suite still passes on the same files.
- mobile/lib/logic/ imports nothing from Flutter.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/logic-ports, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- Cases per rule and results.
- Every place Dart and JavaScript behaved differently and how you matched them.
- Any case you believe is wrong.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-10 · Mobile / screens · The app shell and the Dashboard

- **problem:** After logging in there is nothing to see.
- **outcome:** A bottom bar with Home, Fuel, Care and More, an active-car holder with a car switcher, and a Dashboard that shows the car snapshot, what maintenance is due and quick actions, with loading, empty, error and offline forms.
- **effort:** M, 8 to 12 hours
- **risk:** The Dashboard reads several tables; a slow or failed read of one must not blank the others. The theme must follow the car shown.
- **depends on:** MOB-06, MOB-07, MOB-08, MOB-09
- **decision needed:** no
- **suggested model:** Sonnet (screen work from a spec)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-10): The app shell and the Dashboard

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/dashboard`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/pages/DashboardPage.jsx, frontend/src/theme/ActiveCarContext.jsx and frontend/src/lib/carSnapshot.js and list what the Dashboard shows for 0, 1 and 3 or more cars.
- Through the Supabase connector (read-only), confirm the columns the Dashboard reads on `cars`, `fuel_logs`, `maintenance_items`, `maintenance_records` and `profiles.default_car_id`.
- Open docs/stitch_carsage_landing_page/carsage_dashboard_vehicle_hub and section 3.4 of docs/DESIGN_PASS_2.md for the agreed layout.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Data access: one small class per table group in mobile/lib/data/ that takes the Supabase client and returns plain Dart objects. Screens depend on these classes, so tests can pass a hand-written fake. Every read also saves to and falls back on the read cache.
- Active car: a `ChangeNotifier` holding the user's cars and the selected one, starting from `profiles.default_car_id`, mirroring `ActiveCarContext`. The app theme follows the selected car's make.
- Shell: bottom bar with four labelled tabs. Fuel, Care and More may be placeholders that say what is coming; they must still be reachable and named for screen readers.
- Dashboard: no car (one sentence and an "Add your car" button); one car; several cars with a switcher. Car card with name and specs, fuel economy with its source label, the latest odometer, maintenance rows sorted by urgency with text status badges, and a 2 by 2 grid of quick actions.
- States: skeleton while loading (static when animations are off), a per-card error with retry, and an offline note showing when the data was last updated.
- Pull to refresh.
- Tests with fakes: 0, 1 and 3 cars; one table failing; offline from cache; double text size; tap targets; the screen title is announced.

DONE WHEN
- On my phone, against my account, the Dashboard matches the numbers the website shows for the same car.
- No overflow at double text size.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/dashboard, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- Screenshots at normal and double text size.
- Any number that differed from the website.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch C: MVP features

Each item is one screen or one capability and can be merged on its own.

### MOB-11 · Mobile / screens · Add a car and Car Profile, with the car photo

- **problem:** A new user cannot add a car in the app, and an existing user cannot view or edit one.
- **outcome:** The Add a Car form with spec suggestions, and a Car Profile that shows, edits and deletes a car and manages its photo.
- **effort:** M to L, 12 to 16 hours
- **risk:** Deleting a car cascades to its fill-ups, maintenance, expenses and trips. The car photo bucket accepts 8 MB and several formats; a phone photo is easily larger. A long form on a small screen hides its save button behind the keyboard.
- **depends on:** MOB-10
- **decision needed:** no
- **suggested model:** Sonnet (screens from existing behaviour)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-11): Add a car and Car Profile, with the car photo

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/cars`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/pages/CarOnboardingPage.jsx, CarProfilePage.jsx and frontend/src/lib/carPhoto.js and list the fields, the rules and the photo path format.
- Read the live CHECK constraints on `cars` and the `car-photos` bucket limits and storage policies. On 2026-11-16: 8 MB; JPEG, PNG, WebP, HEIC, HEIF; objects under `<user id>/`.
- Confirm the spec-suggestions route and its response fields in backend/app/routers/car_specs.py.
- Check whether PLAN-25 (Car Profile layout) and PLAN-08 (VIN paste) have shipped on the web, and match whatever the web does now.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Package allowed: `image_picker`.
- Add a Car: the same fields, order and rules as the web, validated by the ported rules. Spec suggestions call the backend and fill empty fields only; a slow server shows the inline waking-up note; a failed lookup never blocks saving. The registration-card scan stays absent, as on the web.
- Car Profile: title first, "Not set" for blanks, edit in place, set as default car, and delete in its own danger area with a confirm step that lists what else will be deleted.
- Car photo: camera or gallery through the picker, resized to 1600 px on the longest edge as JPEG, uploaded to the same path the web uses, shown through a signed address, replaceable and removable. Strip location data and prove it with a test on a geotagged sample file.
- A refused camera permission offers the gallery and explains how to allow the camera in Settings.
- Tests with fakes: every field rule; suggestions filling only empty fields; save failure keeps the form; delete confirmed and cancelled; photo too large; permission refused.

DONE WHEN
- A car added in the app appears on the website with identical values, and the reverse.
- The save button is reachable with the keyboard open.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/cars, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- Field-by-field comparison with the web.
- How location data is removed and the test that proves it.
- Screenshots.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-12 · Mobile / Fuel Log and camera · Fuel Log with the pump and odometer camera scans

- **problem:** Logging a fill-up at the pump is the main reason to have CarSage on a phone, and it does not exist in the app.
- **outcome:** A Fuel Log screen with the fill-up history, real km/L, an add form, and two scan buttons that open the phone's camera, send the photo to the existing backend routes and fill the form.
- **effort:** L, 14 to 20 hours
- **risk:** Money: a fill-up saved in the wrong currency corrupts totals, and fill-ups may not be deletable (PLAN-05). Privacy: each scan sends a photo to Google's free Gemini tier. Cost: each scan spends one of the user's 20 daily scans and one of 150 shared by everyone, so a retry is not free. Phone cameras produce large files and, on some brands, rotated ones.
- **depends on:** MOB-10, MOB-09; Decision 15
- **decision needed:** yes (Decision 15: the one-time acknowledgement before the first scan)
- **suggested model:** Opus (camera, privacy and money)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-12): Fuel Log with the pump and odometer camera scans

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/fuel-log`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/pages/FuelLogPage.jsx, frontend/src/lib/fuelCamera.js, scanPhoto.js, photoReencode.js and geminiPrivacyNotice.js. Report the current limits (1600 px, 2 MB, JPEG on 2026-11-16) and copy the privacy sentence character for character.
- Read backend/app/routers/fuel_camera.py for the two routes, the field name `file`, the response fields and every error case, and backend/app/services/image_validation.py for what the server accepts.
- Read the live policies on `fuel_logs`. On 2026-11-16: insert and select only. If a delete policy now exists (PLAN-05 shipped), build delete to match the web.
- Read the live `api_limits` rows for the camera and report them.
- Check whether the web still inserts fill-ups without sending an `id`, and confirm the insert policy allows a client-chosen id.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Package allowed: `image_picker` (already added).
- History: fill-ups newest first as stacked rows (date, liters, cost in the chosen currency, price per liter and per 20 liters, odometer, km/L for that step with its disposition). The real km/L summary above it with the same wording as the web. Empty state. No chart in this item.
- Add form: date, liters, cost with currency, optional odometer. The ported rules validate on change; the odometer order warning is a warning, not a block, exactly as on the web.
- Every new fill-up gets its id generated on the phone before saving, and the save button is disabled while a save is in flight, so a double tap can never create two rows.
- Scans: two buttons, each with the Gemini sentence directly under it. Before the first scan ever, a one-time dialog with the same sentence and "I understand" or "Type it instead"; remember the answer on the device. Camera first, gallery as the second option.
- Photo handling: ask the picker for 1600 px on the longest edge and JPEG. Check the result is at most 2 MB; if not, ask for another photo with a plain sentence. Strip location data. Add a comment in the code in this form: `shortcut: no quality ladder, add one if real phones exceed 2 MB`.
- Scan results fill the form and never save by themselves. An unreadable result says so and leaves the form for typing. Low confidence shows the web's note. A reached limit shows the server's sentence. No connection says scans need a connection and that the numbers can be typed.
- Never retry a scan automatically. During a scan show "Reading the photo" with a cancel button, not the waking-up note.
- Announce the scan result to screen readers.
- Tests with fakes: every form rule; id reuse on retry of a failed save; double tap; each scan outcome; the acknowledgement shown once; oversize photo; permission refused; location data removed.
- Add to the manual checklist: a real pump photo, a real odometer photo, a refused permission, a scan in poor light.

DONE WHEN
- A fill-up saved in the app shows the same km/L and per-liter figures on the website.
- No path sends a photo before the acknowledgement.
- No photo leaves the phone with location data.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/fuel-log, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The privacy sentence as shown, to compare with the web.
- File sizes of three real photos before and after resizing (ask me to take them).
- Scan results on my phone for one pump and one odometer photo.
- Whether delete was built, and why.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-13 · Mobile / offline · Save a fill-up with no signal and send it later

- **problem:** Petrol stations, underground car parks and mountain roads often have no signal, which is exactly when a fill-up is logged.
- **outcome:** A fill-up saved without a connection is kept on the phone, shown as waiting, and sent when the network returns. Nothing else works offline.
- **effort:** M, 6 to 10 hours
- **risk:** Losing a queued fill-up, or sending it twice. A queued row the server later refuses must not vanish. The queue belongs to one user and must not survive log out.
- **depends on:** MOB-12
- **decision needed:** no (first item to cut if hours run short)
- **suggested model:** Opus (data integrity)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-13): Save a fill-up with no signal and send it later

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/offline-fillup`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Confirm fill-ups are created with a phone-generated id (MOB-12) and that inserting the same id twice fails with a duplicate-key error the app can recognise.
- Re-read the live policies and CHECK constraints on `fuel_logs`.
- Confirm `clearLocalData()` exists and what it wipes.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- No new package.
- A queue of pending fill-ups in `shared_preferences`, written before the screen reports success. Each entry holds the full row, including its id and the user id it belongs to.
- Sending: on app start, on return to the foreground, on pull to refresh and after any successful request. One at a time, oldest first. Success, or a duplicate-key error for that id, removes the entry. A network failure leaves it. Any other refusal marks it "could not be saved" with the plain reason and keeps it visible with Delete and Try again.
- The history shows queued entries in place with a "waiting to send" mark, and they count in the on-screen km/L so the numbers make sense to the user.
- An entry is only ever sent while its owner is the signed-in user. Log out with entries waiting warns first; `clearLocalData()` then wipes the queue.
- A comment in the code: `shortcut: fill-ups only, no general sync; revisit if another action needs offline`.
- Tests: save offline then send; app killed between save and send; the same entry sent twice; refused by the server; two users on one phone; log out with a queue.
- Add to the manual checklist: airplane mode, save, close the app, turn the network on, open the app.

DONE WHEN
- No sequence of taps, restarts and network changes loses a fill-up or saves it twice.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/offline-fillup, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The sequences you tested.
- The airplane-mode result on my phone (ask me to run it).
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-14 · Mobile / screens · Maintenance: items, due status, mark done and undo

- **problem:** The app shows what is due on the Dashboard but has no screen to manage it.
- **outcome:** The Care tab lists maintenance items by urgency with text status, and supports add, edit, delete, mark done and undo, with the same rules as the web.
- **effort:** M, 10 to 14 hours
- **risk:** An item's due date depends on its latest completion and, for distance items, on the latest odometer reading. A wrong "today" shifts every status by a day.
- **depends on:** MOB-10, MOB-09
- **decision needed:** no
- **suggested model:** Sonnet (screen work on ported rules)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-14): Maintenance: items, due status, mark done and undo

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/maintenance`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/pages/MaintenancePage.jsx and frontend/src/lib/maintenance.js. Report the presets, the due-soon thresholds (14 days and 500 km on 2026-11-16) and the status labels.
- Read the live policies and constraints on `maintenance_items` and `maintenance_records`. On 2026-11-16: items can be edited; records are insert and delete only.
- Confirm the ported maintenance rules pass their shared cases.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- No new package.
- List: items sorted by urgency, each with a text status badge (Overdue, Due soon, Needs a reading, OK), the next due date or distance, and what remains. Empty state with the presets as one-tap starters.
- Add and edit: name, interval by distance and or by time, when it was last done, notes; the ported form rules.
- Mark done: date, optional odometer (required for a distance item), note. Undo removes the latest completion after a confirm.
- Delete an item, with a confirm that says its history goes too.
- "Needs a reading" links to the Fuel Log add form.
- Completion photos are not in this item.
- Tests with fakes: each status at its boundary; the Beirut date at midnight; mark done then undo; a distance item with no reading; double text size.

DONE WHEN
- Every item shows the same status and due date in the app and on the website.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/maintenance, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- A side-by-side of three items in the app and on the web.
- Screenshots.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-15 · Mobile / notifications · Maintenance reminders as local notifications

- **problem:** CAR-63 planned a daily email for maintenance that is due, and nothing was built. A user who does not open CarSage never learns the oil change is overdue.
- **outcome:** The phone reminds the user when an item becomes due soon and when it becomes overdue, with no server, no email and no new personal data.
- **effort:** M, 8 to 12 hours
- **risk:** Notifications that repeat or fire for a deleted item make people turn them all off. Some Android brands delay or drop scheduled notifications. Android 13 and later need the user's permission. Distance-based items cannot be scheduled by date.
- **depends on:** MOB-14
- **decision needed:** yes (Decision 6)
- **suggested model:** Opus (scheduling, permissions, personal data on the lock screen)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-15): Maintenance reminders as local notifications

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/reminders`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Ask me whether Decision 6 still stands: local notifications, and CAR-63 email dropped.
- Read the current `flutter_local_notifications` setup notes on pub.dev for Android: the notification permission, the restart receiver, exact and inexact scheduling, and the time zone packages. Quote what applies.
- Confirm the ported `nextDue` and `maintenanceStatus` and their thresholds.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Packages allowed: `flutter_local_notifications`, `timezone`, `flutter_timezone`.
- A switch "Remind me on this phone" on the Care screen, off by default. Turning it on is the moment the system permission is asked for. A refusal leaves the switch off and explains how to allow it in Settings.
- One pure function: given the items, their completions and today, return the list of notifications to schedule (item, kind, date). Date-based items get one at due date minus 14 days and one on the due date, at 09:00 in the phone's time zone. Past dates are skipped. Tested without any plugin.
- One function `rescheduleAll()`: cancel everything, then schedule the list. Call it on app start, on return to the foreground, and after any maintenance or fill-up change. Use inexact scheduling; do not request an exact-alarm permission.
- Distance-based items: no scheduled notification. When a fill-up with an odometer reading moves an item into due soon or overdue, show one notification then, and at most once per item per status.
- Text: the item and the car, for example "Oil change is due in 14 days (Corolla)". No odometer, no cost. Tapping opens the Care screen.
- The Care screen says, under the switch, "Reminders are set on this phone and update when you open CarSage."
- `clearLocalData()` cancels everything. Deleting an item or a car cancels its reminders through `rescheduleAll()`.
- Keep the number of pending notifications under 60 by scheduling the nearest ones first.
- Tests: the schedule function at every boundary; nothing in the past; nothing after an item is done; the once-per-status rule; the cap; cancel on log out.
- Add to the manual checklist: allow, refuse, a reminder arriving with the app closed, after a phone restart, and after log out (none must arrive).

DONE WHEN
- A date-based item produces exactly two reminders, and none after it is marked done.
- With permission refused, the app still works and says why reminders are off.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/reminders, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- What the plugin's notes said, quoted.
- The schedule for three example items.
- The checklist results on my phone, including the brand and Android version.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-16 · Mobile / account · The More tab: currency, legal pages, log out and delete account

- **problem:** The app has no place for the currency choice, the legal pages, logging out, or the in-app account deletion that both stores require.
- **outcome:** A More tab with the car list, the USD or LBP choice, Privacy and Terms opened from the live website, Log Out, and Delete Account calling the backend endpoint.
- **effort:** S, 4 to 6 hours
- **risk:** Account deletion is permanent. Anything left on the phone afterwards (session, cache, queue, reminders) is a leak.
- **depends on:** MOB-10, MOB-01
- **decision needed:** no
- **suggested model:** Sonnet (small screen; the deletion logic is the backend's)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-16): The More tab: currency, legal pages, log out and delete account

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/settings`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Confirm `DELETE /account` exists, what it requires in the body and what it returns (MOB-01).
- Read frontend/src/currency/CurrencyContext.jsx and frontend/src/lib/currency.js for the default and how the choice is remembered.
- Ask me for the live website address of the Privacy and Terms pages.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- No new package (`url_launcher` is already present through Supabase).
- Currency: a holder built on `ChangeNotifier`, default USD, remembered on the device, with the rate from `app_config`. Every money figure in the app reads from it.
- Privacy and Terms: open the website pages in the in-app browser view. No copy of the wording in the app.
- Log Out: confirm, then the existing log out.
- Delete Account: a danger area. A screen that says exactly what is deleted (account, cars, fill-ups, maintenance, expenses, trips, advisor chats, photos) and that it cannot be undone; the password field (or the typed word, for a Google account, as the endpoint requires); a final confirm. On success: `clearLocalData()`, then the Welcome screen with a one-line confirmation. On failure: the plain reason, and nothing local is wiped.
- The app version at the bottom of the tab.
- Tests with fakes: currency remembered; deletion success wipes everything local; wrong password wipes nothing; server error wipes nothing; both cancels.

DONE WHEN
- After deletion, restarting the app shows the Welcome screen, no cached data and no pending reminders.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/settings, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- What is on the phone after deletion (list the stores you checked).
- Screenshots of the deletion flow.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-17 · Mobile / accessibility · Accessibility pass on every MVP screen

- **problem:** Automated checks catch roughly a third of accessibility problems. Reading order, spoken names and large text only show up on a real phone with a screen reader.
- **outcome:** Every MVP screen passes the automated guidelines in tests, and a TalkBack walk-through on a real phone is recorded, with every finding fixed or listed.
- **effort:** M, 6 to 8 hours
- **risk:** Fixes can change layout. The manual part needs my phone and my time.
- **depends on:** MOB-11 to MOB-16
- **decision needed:** no
- **suggested model:** Sonnet
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-17): Accessibility pass on every MVP screen

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/a11y-pass`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read section 9 of docs/FLUTTER_APP_PLAN.md.
- List every screen and dialog that exists in mobile/lib and check each has a widget test.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- No new package.
- For every screen, add or confirm widget tests for: Flutter's Android tap-target guideline, the labelled-tap-target guideline and the text-contrast guideline; no overflow at double text size; a right-to-left locale renders without overflow; animations off.
- Check by reading the code: every icon-only button has a spoken name; decorative icons are excluded; status is never colour alone; each screen announces its title; a failed save moves focus to the first error and announces it; every chart or figure group has a text summary.
- Write a TalkBack script in mobile/README.md: for each screen, the swipe order expected and what should be spoken. Ask me to run it on my phone and tell you where it differs.
- Fix what the tests and my walk-through find. Anything you cannot fix goes in the report with its WCAG criterion.

DONE WHEN
- All guideline tests pass on every screen.
- My TalkBack walk-through is recorded with no unresolved blocker.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/a11y-pass, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- Findings by screen: fixed, or left with the reason.
- My walk-through results, quoted.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch D: release

### MOB-18 · Mobile / release · Android release build, signing, store forms and a test track

- **problem:** A debug build on one phone is not a release. Signing, the store listing, the data safety form and the tester rule are where first releases stall.
- **outcome:** A signed release build on Google Play's internal testing track, every form drafted for my review, and a written release procedure.
- **effort:** M, 8 to 12 hours, plus waiting time for account checks and the closed-test period
- **risk:** A lost upload key or a leaked one. A wrong answer on the data safety form is a policy violation. Store rules change; nothing here may be taken from memory.
- **depends on:** Batch C; my developer account; Decision 18
- **decision needed:** yes (Decision 18: listing name, support address, who the testers are)
- **suggested model:** Opus (signing keys, privacy declarations)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-18): Android release build, signing, store forms and a test track

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/android-release`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Ask me: is the Play developer account open and verified, what is the listing name, the support email and the privacy policy address, and has the Privacy wording been updated for the app, deletion and reminders?
- Read Google Play's current requirements and quote them with their addresses: target API level, the closed-testing rule for new personal accounts, account deletion, the data safety form, AI-generated content, and photo and notification permissions. Do not state a fee; tell me to check the current one.
- Read frontend/src/pages/LegalPages.jsx to see exactly which outside services the Privacy page lists.
- Confirm `min_version_android` in `app_config` is still null.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Write step-by-step instructions for me to create the upload keystore myself, outside the repository, to back it up in my password manager and one offline place, and to enrol in Play App Signing. You never run the key tool, never see a password, and never read the keystore.
- Wire release signing to a git-ignored `key.properties`, with a committed example. A release build without it fails with a clear message.
- Release settings: version name and code, code shrinking on, the app name and icon (from frontend/public/favicon.svg and the logo reference; no car-brand artwork), the minimum and target Android versions the store currently requires.
- Build the release bundle and report its size. Run it on my phone before anything is uploaded.
- Draft, as a file under mobile/store/, for my review: the short and full description, the data safety answers with the reason for each (email, name, car details, photos, addresses typed into the Trip Planner; shared with Google for Gemini and Maps, Groq, API Ninjas and YouTube; no advertising; no tracking; deletion available in the app and at the web address), the content rating answers, the reviewer's sign-in notes, and the permission explanations.
- Write mobile/RELEASING.md: version bump, build, test on a phone, upload to internal testing, promote, and only then raise `min_version_android` if the release needs it.
- I do the uploading. You upload nothing.

DONE WHEN
- A signed release build installs and runs on my phone.
- Every store form has a drafted answer I can paste.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/android-release, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The store requirements you found, quoted, with their addresses and the date.
- The release bundle size.
- Anything in the forms you were unsure how to answer.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch E: parity with the web

Three independent items, in any order.

### MOB-19 · Mobile / screens · Expenses, receipt photos and the monthly cost of ownership

- **problem:** The app cannot record non-fuel costs or show what the car costs per month.
- **outcome:** An Expenses screen with add and delete, up to three receipt photos per expense, and the monthly summary and chart.
- **effort:** M to L, 12 to 18 hours
- **risk:** Receipt photos are stored privately and must never be sent to Gemini. The storage policy only accepts an upload after its database row exists, at an exact path. Totals mix two currencies.
- **depends on:** Batch C
- **decision needed:** no (confirm the chart package or hand-drawn bars)
- **suggested model:** Sonnet
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-19): Expenses, receipt photos and the monthly cost of ownership

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/expenses`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/pages/ExpensesPage.jsx, frontend/src/lib/costs.js, recordPhotos.js and frontend/src/components/RecordPhotos.jsx.
- Read the live policies on `car_expenses`, `car_expense_receipts` and the `record-photos` bucket. On 2026-11-16: at most 3 receipts per expense, 100 photos per user across receipts and maintenance, the path `<user id>/receipts/<expense id>/<photo id>.jpg`, 2 MB, JPEG only, and the upload allowed only when the row exists.
- Confirm shared cases exist for the cost rules in shared/fixtures (MOB-04). If they do not, stop and tell me: adding them is a web test change and belongs in its own item.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Package allowed: `fl_chart`, only if two simple bar charts cannot reasonably be drawn with `CustomPaint`. Tell me which you chose and why before adding it.
- Port costs.js to mobile/lib/logic/ against the shared cases.
- Expenses: list, add (date, category from the nine fixed ones, amount with currency, note), delete with confirm. Expenses are never edited, as on the web.
- Receipts: camera or gallery, resized to 1600 px JPEG, at most 2 MB, location data stripped. Follow the web's order exactly: insert the row with a phone-generated id, upload to the path the policy expects, and delete the row if the upload fails. View through a short-lived signed address. Delete a receipt.
- No Gemini notice here, and a test proving no receipt path ever calls a scan route.
- Monthly summary and a six-month chart with a one-sentence text summary for screen readers. Add the fuel price chart to the Fuel Log in the same way.
- Tests with fakes: totals in both currencies; the three-receipt limit; the 100-photo limit; upload failure cleans up its row; delete.

DONE WHEN
- The monthly totals match the website for the same car and month.
- A receipt added in the app opens on the website, and the reverse.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/expenses, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- Chart choice and why.
- Totals compared with the web.
- The test that proves receipts never reach a scan route.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-20 · Mobile / screens · Trip Planner

- **problem:** The app cannot estimate a trip's fuel cost and time.
- **outcome:** A Trip Planner screen: destination and optional start as plain text, the fuel price with its default and override, and the same result fields as the web.
- **effort:** M, 10 to 14 hours
- **risk:** Each estimate calls a billed Google API. No Google key may ship in the app. Every estimate stores the addresses typed.
- **depends on:** Batch C; PLAN-10 (daily caps) must have shipped
- **decision needed:** yes (Decision 16: plain text, no suggestions, no route image)
- **suggested model:** Sonnet
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-20): Trip Planner

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/trip-planner`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Confirm the estimate route now has a daily cap (PLAN-10). If it does not, STOP.
- Read backend/app/routers/trip_planner.py for the request and response of `/trip-planner/estimate` and `/trip-planner/fuel-prices`, and frontend/src/pages/TripPlannerPage.jsx and frontend/src/lib/trafficLevel.js for how the result is shown.
- Check whether PLAN-06 (recent trips with delete) and PLAN-11 (clearer maps errors) have shipped, and match the web.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- No new package and no Google key in the app.
- Port trafficLevel.js against its shared cases. If the cases are missing from shared/fixtures, stop and tell me.
- Form: destination, optional start, fuel type and price (default from the fuel-prices route, overridable, validated by the ported rule) under an "Advanced" section as on the web.
- Result: distance, time, time in traffic with the traffic level in words, cost in the chosen currency for light and current traffic, and which fuel economy was used (real or rated) with the web's wording.
- A slow server shows the waking-up note. A reached limit shows the server's sentence. A bad address and a maps outage show different messages if the backend now tells them apart.
- The save button cannot be pressed twice while a request is in flight; an estimate is never retried automatically.
- If the web shows recent trips with delete, show the same list.
- Tests with fakes: every result field; every error; no double send.

DONE WHEN
- The same trip gives the same numbers in the app and on the website.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/trip-planner, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- A side-by-side result.
- Screenshots.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-21 · Mobile / screens · AI Advisor with the warning-light photo scan

- **problem:** The app cannot ask the AI Advisor about a car problem.
- **outcome:** A chat screen that sends a description to the existing backend route, shows the verdict as the most visible part of each reply, and supports the photo scan, the video link, the mechanic search link and the "did this fix it?" feedback.
- **effort:** L, 14 to 20 hours
- **risk:** Safety advice: a "see a mechanic" verdict must never be easy to miss. Each message spends one of 60 a day, and each photo one of 20. The photo goes to Google's free Gemini tier.
- **depends on:** Batch C; MOB-12 for the camera and acknowledgement
- **decision needed:** no
- **suggested model:** Sonnet (large screen, existing behaviour)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-21): AI Advisor with the warning-light photo scan

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/advisor`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Read frontend/src/pages/AIAdvisorPage.jsx, frontend/src/lib/advisorPhoto.js and diySuccess.js, and backend/app/routers/ai_advisor.py and advisor_camera.py for the request and response fields.
- Read the live policies on `advisor_conversations` and `advisor_messages`. On 2026-11-16: the owner may update only the fix feedback on an AI message with a DIY verdict.
- Check whether PLAN-23 (verdict prominence) and PLAN-12 (relevant videos only) have shipped, and match the web.
- Confirm the one-time scan acknowledgement from MOB-12 exists and reuse it.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- No new package.
- Port diySuccess.js against its shared cases. If the cases are missing from shared/fixtures, stop and tell me.
- Chat: the car being asked about, the conversation, an input with the server's length limit, and a typing indicator that is static when animations are off. Each AI reply leads with the verdict in words and colour ("You can fix this yourself" or "See a mechanic"), then the guidance.
- DIY replies: the video opens in the YouTube app or browser; "Did this fix it?" records the feedback. Mechanic replies: the outbound maps search link, a plain link as CAR-65 says.
- Photo scan: the same button, sentence and acknowledgement as the Fuel Log, the same resize and location-data rules, and the result shown as the web shows it.
- Earlier conversations load from Supabase and are cached for reading offline. Sending needs a connection.
- The same disclaimer wording as the web, in the same place.
- Never resend a message automatically.
- Tests with fakes: both verdicts; the limit reached; a scan result of each kind; feedback saved; offline reading.

DONE WHEN
- The verdict is the first thing TalkBack reads in each reply.
- A conversation started in the app continues on the website, and the reverse.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/advisor, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- Screenshots of both verdicts at normal and double text size.
- How the verdict is announced.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## Batch F: optional, each behind its own decision

### MOB-22 · Mobile / iPhone · iPhone build and TestFlight

- **problem:** The app runs only on Android. iPhone builds are impossible on the Windows machine this project is developed on.
- **outcome:** The same app building for iPhone, tested on a real device and delivered through TestFlight.
- **effort:** L, 20 to 35 hours, plus Apple's review time
- **risk:** It needs a Mac or a paid cloud Mac build service and a paid Apple developer membership. Offering Google sign-in brings a rule about offering an equivalent sign-in option. Apple reviews every build and is strict about account deletion and data shared with third-party AI. iPhone photos are HEIC by default and the receipts bucket accepts JPEG only.
- **depends on:** Batch D
- **decision needed:** yes (Decision 3; money and hardware)
- **suggested model:** Opus (signing, sign-in rules, store review)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-22): iPhone build and TestFlight

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/ios`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Ask me: what Mac access I have, whether the Apple developer membership is active (check the current fee yourself; do not state one), and whether I want Google sign-in on iPhone.
- Read Apple's current App Review Guidelines on account deletion, sign-in services, data shared with third-party AI, and minimum functionality, and quote the parts that apply with their addresses.
- Run `flutter doctor` on the Mac and report it.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- This item runs on a Mac. The "Android only" standing rule and the Windows folder in gate 1 do not apply: use the repository's folder on the Mac and tell me its path. Every other rule applies.
- Add the iOS platform to the existing project. Bundle id, permission sentences for the camera, the photo library and notifications, and the link scheme for sign-in.
- If Google sign-in stays: add whatever equivalent sign-in option the current guideline requires, and tell me its cost before building it.
- Prove on a real iPhone that picked and captured photos arrive as JPEG under 2 MB without location data, that reminders arrive, that the session is in the keychain, and that the offline queue works.
- A VoiceOver walk-through, with the same script as the TalkBack one.
- Draft the privacy label answers from the Android data safety draft.
- I create every certificate and profile and do every upload.

DONE WHEN
- A TestFlight build runs on a real iPhone and passes the manual checklist.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/ios, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- The web app and backend stay untouched: `git diff --stat dev -- frontend backend` must print nothing when you finish. If the task seems to need a web or backend change, stop and tell me.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The guideline text you relied on, quoted, with the date.
- What differed from Android.
- The checklist results.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-23 · Mobile and backend / notifications · Push notifications for maintenance reminders

- **problem:** Local reminders only know what the phone last saw. A user who edits maintenance on the website, or changes phone, gets no reminder until the app is opened.
- **outcome:** A daily server job that sends a push notification for maintenance due soon or overdue, to phones the user has opted in on.
- **effort:** L, 20 to 30 hours, plus accounts and setup on my side
- **risk:** It adds Firebase to the app (and a line to the store privacy forms), a table of device tokens on the live database, a scheduler the free host does not have, and the due-date rule in a third language. Wrong or repeated notifications reach real people.
- **depends on:** MOB-15 shipped and found lacking in practice
- **decision needed:** yes (Decision 6 reversed; a migration; a Firebase project; a scheduler)
- **suggested model:** Opus (database, scheduled job, personal data)
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-23): Push notifications for maintenance reminders

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/push`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Ask me what evidence there is that local reminders are not enough. If there is none, recommend not building this, and stop.
- Ask me for my choices: the Firebase project, the scheduler (a daily GitHub Actions job is the smallest), and approved Privacy wording.
- Confirm there is still no `device_tokens` table, no scheduler and no push code. List the installed Postgres extensions (on 2026-11-16 neither pg_cron nor pg_net was installed).
- Use the Supabase docs search for the current push notification guidance and quote it.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- Write a design note in your reply first, not as a file, and wait for my OK: opt-in per device, at most one notification per item per status, what happens when the host is asleep, and how local reminders are switched off for a device that has push so nobody gets two.
- Migration (show me and STOP): `device_tokens` (id, user id with cascade delete, token unique, platform, created and last seen). RLS: the owner may insert, read and delete their own rows; no update; the job reads with the service key. A small send log that only the service role can touch.
- Move the due-date rule into one Postgres function that the job calls, tested against the same shared cases, so there is no third hand-written copy.
- Backend: one endpoint the scheduler calls, protected by a shared secret from the environment, with a dry-run mode that lists who would be notified about what without sending.
- App: `firebase_messaging` (report its licence first), register and delete the token with the switch, delete it on log out and on account deletion, and handle a tap.
- Tests: nobody who has not opted in is ever notified; another user's token can never be read or deleted; the Postgres function passes the shared cases.

DONE WHEN
- The dry run against live data lists the right people and items.
- No device gets both a local and a pushed reminder for the same event.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/push, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs a database change. Write the SQL as a new dated file in docs/db_migrations/, show me the full SQL and how to undo it, and STOP. Do not apply it yourself. Go on only after I tell you it has been run. The change must be add-only: no rename, no drop, no tighter constraint.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- This item changes the web app or backend on purpose. Change only what it names. Styling is plain CSS only: no animation library, no UI library, no new icon library, no outside fonts. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- If frontend/ changes: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after, and report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Run the full suites and report the counts before and after: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline on 2026-11-16: 1869 frontend and 806 backend tests passing.
- Existing backend routes may only gain optional fields. Never rename or remove a response field or change an error shape: installed phone apps will depend on them.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- The design note and my approval.
- The SQL and my confirmation it was run.
- Dry-run output with tokens and emails masked.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

### MOB-24 · Mobile and backend / language · Arabic and right-to-left

- **problem:** CarSage's users are in Lebanon and the app is English only.
- **outcome:** The app in Arabic with a right-to-left layout, switchable in the More tab, with English unchanged.
- **effort:** L, 30 to 50 hours, plus a native-speaker review
- **risk:** The work outside the app is the large part: the backend's error sentences are English, the Advisor answers in English, and the legal pages are the developer's wording. Manrope and Space Grotesk have no Arabic letters. A half-translated app is worse than an English one.
- **depends on:** Batch E; Decision 12
- **decision needed:** yes (Decision 12; the Arabic wording is mine)
- **suggested model:** Sonnet for the screens, Opus to review the backend changes
- **PROMPT:**

````text
You are working on CarSage: a React and Vite web app (frontend/), a FastAPI backend (backend/), Supabase, and a planned Flutter phone app (mobile/). This prompt is complete on its own: assume you remember nothing from any earlier session. The full plan is docs/FLUTTER_APP_PLAN.md; read the sections this task names, not the whole file.

TASK (MOB-24): Arabic and right-to-left

GATES. Do these first, in order. If any one fails, STOP and tell me which.
1. Work in C:\Users\user\Desktop\carsage\carsage. `git rev-parse --show-toplevel` must print that folder, not a parent folder (the home folder is a separate git repository).
2. `git status --porcelain` must print nothing. If the only entries are plan documents under docs/, stop and ask me whether to commit them first.
3. `git branch --show-current` must print dev.
4. Copy CLAUDE.md to a folder outside the repository and confirm the copy exists (CLAUDE.md is git-ignored, and switching to an old branch can remove it). Then read CLAUDE.md in full.
5. Scope gate. CLAUDE.md has listed "native mobile app" as out of scope. If it still does, ask me to confirm in this session that the mobile phase is open and that this item is approved. Without that confirmation, STOP.
6. Readiness gate. Read "Before mobile starts" in docs/FLUTTER_APP_PLAN.md and check what you can yourself: `DELETE /account` exists in backend/app, the `app_config` table exists (read-only SELECT through the Supabase connector), and shared/fixtures/ exists. Ask me to confirm the rows you cannot check. If any row is not true, STOP.
7. Create the work branch from dev: `git switch -c mobile/arabic`. Never commit on dev or main.

VERIFY FIRST. Months may have passed since this was written (2026-11-16), and the web app keeps changing. Before building anything, check that the assumptions still hold:
- Ask me: who reviews the Arabic, whether the website will be translated too (this plan does not do it), and whether the Advisor should answer in Arabic.
- Count the strings in the app's translation file and list every backend `detail` sentence.
- Confirm every screen already passes its right-to-left test from MOB-17.
- Choose an Arabic font with an open licence, report its licence and size, and wait for my OK.
If an assumption no longer holds, change nothing, tell me what you found, and stop.

WHAT TO DO
- An Arabic translation file. I supply or approve every string; mark any you drafted.
- The Arabic font bundled with its licence, used only for Arabic text. Western digits in both languages. USD and LBP unchanged.
- Backend, additive only: an optional `code` field beside `detail` on every error, pinned by the contract tests, so the app can show its own Arabic sentence. The English `detail` stays for the web and for old apps.
- If I chose Arabic Advisor replies: an optional `language` request field, default English, pinned by tests.
- Privacy and Terms keep opening the website; say on the Arabic screen that they are in English unless I supply translations.
- Mirror only what should mirror: layout and back arrows, not numbers, charts' axes or the logo.
- Tests: every screen in Arabic at double text size; no English sentence from the backend reaches an Arabic screen; the web's requests and responses are unchanged.

DONE WHEN
- A native speaker has reviewed every screen in Arabic.
- The web app's behaviour is provably unchanged.

STANDING RULES
- No push, no merge, no pull request. One focused commit per logical change on mobile/arabic, then stop. This overrides the "commit and push" step in CLAUDE.md. There is no Jira ticket for this item unless I give you one; do not create or change one.
- Do not touch anything on port 5173 (my dev server). Use another port for anything you start. Before reporting, stop every process you started: dev servers, emulators, `flutter run`, and Gradle daemons (`gradlew --stop` in mobile/android if you built).
- Supabase project ehjvbkhoafldqfsivtrn is the LIVE production database: SELECT, schema inspection and get_advisors only. This item needs no database change. If you think it does, stop and tell me.
- Never type, print or commit credentials, keys, keystores or the contents of any .env file. If a logged-in view is needed, ask me to log in on the device or browser myself. Create no data on the live project; if I point you at a development project, label anything you create "QA test" and delete it through the app.
- The only keys that may appear in mobile/ are the Supabase URL and anon key, passed at build time from a git-ignored file. The service key and the Gemini, Groq, Maps, API Ninjas and YouTube keys never leave the backend.
- Every new file starts with a header comment saying what it is for. Every new or changed function, class and widget has a doc comment (what it does, parameters, return value). I must be able to explain every line.
- Add or update one line per new or changed file in docs/FILE_INDEX.md. Search that file, never read it whole (it is over 230 kB).
- Tests for all new logic: the normal case, invalid input and one edge case. Never commit on a red run.
- Commit messages: plain and factual, written as the developer. No mention of AI or Claude, no co-author line. Do not change git config.
- Never build anything from CLAUDE.md's out-of-scope list other than the mobile app itself (document vault, booking, live maps, OBD, voice, exports, fleets). Do not change Privacy or Terms wording without the exact text from me.
- If the `graphify` command exists, run `graphify query "<question>"` before searching or reading source, and `graphify update .` after changing code. If it does not exist, say so in the report and carry on.
- Name files, classes and functions in your notes, never line numbers.
- Before reporting, run /ponytail-review on the change and fix what it finds.
- This item changes the web app or backend on purpose. Change only what it names. Styling is plain CSS only: no animation library, no UI library, no new icon library, no outside fonts. Icons are the copied Lucide SVGs in frontend/src/components/icons.jsx and iconsMore.jsx.
- If frontend/ changes: with a real frontend/.env present, run `npm run build` then `npm run check:bundle` in frontend/ before and after, and report both sets of numbers. Never raise a budget; if the change does not fit, stop and tell me.
- Run the full suites and report the counts before and after: `npm test` and `npm run lint` in frontend/, and `.venv\Scripts\python -m pytest -q` in backend/. Baseline on 2026-11-16: 1869 frontend and 806 backend tests passing.
- Existing backend routes may only gain optional fields. Never rename or remove a response field or change an error shape: installed phone apps will depend on them.
- Flutter only. Work in mobile/. Run `flutter analyze` (no warnings) and `flutter test` (all green) before every commit, and report the counts. Android only on this machine; do not attempt iOS.
- Packages: only the ones this task names. Any other package needs my approval first, with its licence, its publisher and why the SDK cannot do the job.
- No user-visible string is hard-coded: every one goes in the translation file. Padding and alignment use start and end, never left and right.
- Colours, type and spacing come from the theme. Honour the system text size and the "remove animations" setting. Every tappable thing is at least 48 by 48 dp and has a spoken name.
- Do not create signing keys, developer accounts or store listings, and upload nothing to any store.

REPORT
- What you verified first, and whether the assumptions still held.
- What changed, file by file.
- Test and analysis results, before and after.
- String counts and who approved them.
- The font and its licence.
- Backend fields added.
- Screenshots of every screen in Arabic.
- What /ponytail-review said and what you did about it.
- Anything you could not check.
Then stop and wait for my OK.
````

## 19. Deliberately not doing

**Rejected approaches**
- **Rewriting the web in Flutter.** It replaces a tested, budgeted site for no user gain (ADR-1).
- **A wrapped web view.** None of the app's three benefits, and a review risk (ADR-1).
- **Prefixing every backend route with `/v1`.** It would change the web for nothing today (ADR-3).

**Smaller is enough**
- **A local database and two-way sync.** Tens of rows, one offline action (ADR-6).
- **A state library and a router package.** Three shared values and ten screens (section 14).
- **An in-app camera viewfinder with a framing guide.** The phone's own camera works and needs no Android permission. Revisit if scan results are poor.
- **A quality ladder for photo compression.** One resize is expected to land well under 2 MB. MOB-12 measures it on real phones first.
- **Offline for anything except a new fill-up.**
- **Estimating when a distance-based item will fall due.** A wrong guess is worse than no reminder.
- **Certificate pinning, root detection, obfuscation for security.**
- **Analytics and crash-reporting SDKs.** Each adds data collection that must be declared. Start with none; add one when a crash cannot be understood without it.
- **Pixel-comparison screenshot tests.**
- **CI that builds and uploads releases.** Local release builds until releases are frequent.

**Not for a phone**
- **The Landing page, the sitemap and the search description.** The store listing does that job.
- **Car-brand logos.** Colours only (Decision 17).
- **A Google Maps key in the app, address suggestions and the route image**, at first (Decision 16).
- **A copy of the Privacy and Terms wording.** One copy, on the website.

**Waiting on a decision**
- **Dark mode** (Decision 13), **Arabic** (Decision 12, MOB-24), **iPhone** (Decision 3, MOB-22), **push** (Decision 6, MOB-23).
- **Verified app links** in place of the custom scheme: before a public release with Google sign-in.
- **Moving the due-date rule into Postgres:** only with MOB-23.
- **The web reading the exchange rate from `app_config`:** sensible, and a web change this plan may not make.

**Out of scope under CLAUDE.md, on the phone as on the web**
- Document vault, insurance and roadside integration, OBD and live diagnostics, interactive maps and live GPS, mechanic booking, voice input, exportable reports, fleets and cost sharing. A phone makes several of these tempting (GPS trip logging, voice, a Bluetooth OBD reader). They stay out until CLAUDE.md says otherwise.

## 20. How this was checked

- **Read in full:** CLAUDE.md; the decisions, summary, open-items table, housekeeping, "not doing" and "could not verify" sections of `docs/IMPROVEMENT_PLAN.md`, with PLAN-05 and PLAN-31 as examples of its prompts; `docs/stitch_carsage_landing_page/carsage/DESIGN.md`; `backend/app/main.py`, `auth.py` and the health router; `frontend/src/lib/apiClient.js`, `coldStart.js`, `geminiPrivacyNotice.js`; the head of `carBrandThemes.js` and `icons.jsx`; `fonts.css`.
- **Read by outline or search only:** `docs/UI_AUDIT.md`, `docs/UI_TICKETS.md` and `docs/DESIGN_PASS_2.md` (headings, plus every mention of dark mode, right-to-left, touch targets and reduced motion); the export lists of every `frontend/src/lib` rule module; every backend route and its request and response fields; the routes in `App.jsx`; the auth calls in `AuthContext.jsx`; the Privacy page's mentions of deletion and outside services.
- **Not read:** the page components themselves, the backend services, the test files, and the other eight Stitch screens.
- **Live database, read-only (2026-11-16):** every `public` table with its columns and CHECK constraints; every policy on `public` and `storage`; every foreign key and its delete rule; the two buckets and their limits; functions; extensions; the `api_limits` rows; the count of accounts (3); the security advisor. Nothing was written.
- **Run:** `git branch --show-current` (dev), `flutter --version`, `flutter doctor -v`. No Flutter project was created. Port 5173 was not touched and no process was started.
- **Looked up:** the Supabase docs search for native mobile deep linking, the Flutter quickstart, email templates and push notifications; pub.dev pages for ten packages (licence, version, publisher).

## 21. Skills and connectors

| Asked for | Result |
|---|---|
| `/ponytail lite` | Loaded and followed |
| `engineering:system-design`, `engineering:architecture` | Loaded; the ADRs in section 4 use a shortened form of their format, as asked |
| `engineering:testing-strategy` | Loaded; section 10 |
| `design:design-handoff` | Loaded; section 8. No Figma connector was used (it needs authorising); the spec comes from the code and the Stitch files |
| `design:accessibility-review` | Loaded; section 9 is a plan against its checklist, because there is no app to audit |
| `security-review` | Loaded. It reviews a branch diff, and this branch has none, so its method was applied by hand to the planned design; section 11 |
| `mattpocock-skills:grilling` | Loaded. It is built to question you in rounds; you were not available, so section 17 lists the questions with my answers |
| Supabase connector | Worked: read-only SQL, table listing, security advisor, docs search |
| pub.dev | Read through web fetch |
| graphify | The command was not found in either shell (no executable, no Python module), the same as in the previous planning session. Searches were done directly |
| Jira (Atlassian connector) | Not needed and not used |

## 22. What could not be verified

- **Whether a `mobile/`-only commit triggers a Netlify build or a Render deploy.** There is no `netlify.toml` in the repository, so the setting lives in dashboards I cannot see. Section 2, row 14.
- **Supabase dashboard settings:** whether email confirmation is on, the redirect allow list, the site address. MOB-07 asks.
- **Store rules and fees.** Nothing about Google Play or Apple policy was read from the source in this session. Every such statement in this plan says "check", and MOB-18 and MOB-22 read the current rules before acting.
- **Google Cloud key restrictions for a mobile client.** Decision 16 avoids the question by shipping no key.
- **The default auth flow and sign-out scope in the current `supabase_flutter`.** Its package page confirms the default plain session storage and the custom store; it does not mention PKCE. MOB-07 looks both up.
- **How `image_picker` handles HEIC, rotation and location data on real phones.** Its page does not say. MOB-12 and MOB-22 test it.
- **The licence of the `timezone` package**, and of `firebase_messaging`. Not fetched.
- **The web's actual font sizes.** The type scale in section 8 starts from the Stitch file; MOB-06 checks it against `index.css`.
- **The share of Android and iPhone among likely users in Lebanon.** The Android-first choice rests on what this machine can build, not on market data.
- **Every hour estimate.** None is measured. They assume the pace of the last sprint and a developer new to Flutter release work.
- **Anything on a real phone.** No device or emulator was connected.
