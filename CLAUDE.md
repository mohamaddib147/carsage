# CarSage — Context for Claude Code

Read this file fully before writing any code. It defines exactly what to build, what NOT to build, and the rules this project must follow. This is a capstone project with a hard deadline (Sep 25) and a mentor review — scope discipline matters more than adding features.

## Project Overview

CarSage is a web-based companion app for everyday car owners. MVP consists of **2 basic features** and **2 core features** — nothing else. Full details are in `docs/CarSage_BRD.pdf`.

- **Car Onboarding** (basic) — add a car via manual form, with a "scan registration card" button that can be a disabled/placeholder for MVP (OCR is a stretch goal, not required).
- **Car Profile** (basic) — view and edit the saved car's specs.
- **Trip Planner** (core) — enter a destination, get estimated fuel cost + traffic-adjusted travel time. Uses Google Maps API + the car's fuel efficiency. No map UI, no route modifiers, no waypoint recommendations — just destination in, cost/time/distance out.
- **AI Advisor** (core) — describe a car issue in a text chat, get a DIY-fixable vs. see-a-mechanic recommendation with short guidance steps. No voice input, no audio library, no mechanic booking, no report export.

Plus supporting screens: Landing Page, Sign Up/Log In, Dashboard/Home.

## ⚠️ Explicitly OUT OF SCOPE — do not build these

An earlier AI-generated wireframe draft (Google Stitch) added a lot of extra features that were deliberately cut. Do not reintroduce any of these:

- Maintenance log / service history / maintenance ledger
- Digital document vault (insurance, title, warranty storage)
- Insurance & roadside assistance integration
- OBD-II telemetry, live diagnostics, "Diagnostics" as a nav tab
- Interactive maps, live GPS tracking, terrain/satellite view, waypoint recommendations
- Mechanic booking / marketplace
- Voice input, audio sound library, exportable reports
- Multi-car fleet management, cost-sharing, social features
- Native mobile app (this is a website first; mobile app is a future phase)

If a feature isn't listed in "Project Overview" above, treat it as out of scope. When in doubt, ask rather than build it.

## Tech Stack

- **Frontend**: React (web)
- **Backend/DB**: Supabase (Postgres + Auth + Storage) — already provisioned and schema deployed
- **AI/Logic service**: FastAPI (Python) — for Trip Planner cost calculation and AI Advisor
- **AI model**: Gemini (Google AI Studio free tier, e.g. `gemini-2.0-flash`) as primary, with automatic fallback to Groq's free tier (e.g. Llama 3.3 70B) if Gemini's rate limit is hit. Both have genuine free tiers with no credit card required. **Do not use xAI's Grok API** — it has no free tier and bills from the first call, so it doesn't serve the free-fallback purpose. The LLM call must be isolated in a single function/module so providers can be swapped without touching the rest of the codebase. See CAR-19.
- **Maps**: Google Maps API (Directions + Distance Matrix)
- **Car identification/specs**: NHTSA vPIC API (`https://vpic.nhtsa.dot.gov/api/`, free, no key, official) for make/model/year/VIN lookup, combined with API Ninjas Cars API (free tier, api-ninjas.com) for detailed specs (MPG, cylinders, drivetrain, transmission). See CAR-34.
- **Vehicle safety data (AI Advisor enrichment)**: NHTSA Recalls API + Complaints API (`api.nhtsa.gov`, free, no key, official, US-market only) — cross-check user-described issues against real recalls/complaints before falling back to LLM-only classification. See CAR-36.
- **Fuel prices**: no free live API covers Lebanon/Middle East (confirmed via research — GlobalPetrolPrices.com is paid, fuel-prices.eu only covers EU+UK). Built as a small scheduled scraper against Lebanon's Ministry of Energy and Water published weekly prices, cached in the database, with graceful fallback to the last known value and a user-overridable field on the Trip Planner form. See CAR-35.

## Database (already live in Supabase — see `docs/CarSage_ERD.pdf`)

Project: **CarSage** on Supabase (ref: `ehjvbkhoafldqfsivtrn`). Do not create new tables without checking the ERD first — the schema is finalized.

Tables: `profiles`, `cars`, `trips`, `advisor_conversations`, `advisor_messages`. All have row-level security enabled — every policy scopes to `auth.uid()`. Never bypass RLS by using the service key from the frontend; the service key belongs in the FastAPI backend only.

Also `fuel_prices` (added in CAR-35): an append-only cache of weekly-scraped Lebanon fuel prices (`fuel_type`, `price_per_liter_lbp`, `scraped_at`). RLS enabled with no policies — only the backend's service key reads/writes it; it's reference data, not user data.

Full field-by-field definitions, types, and relationships are in `docs/CarSage_ERD.pdf`.

**If a Supabase MCP connector is configured** in this environment (scoped to project ref `ehjvbkhoafldqfsivtrn`): use it to check the live schema and RLS policies directly before writing queries, instead of relying on the ERD PDF alone — the live database is always the source of truth if the two ever disagree. You can also use it to apply migrations if a task genuinely requires a schema change, but confirm with me first since the schema is meant to be finalized.

## Environment Variables

Create `.env` files (never commit them — see `.gitignore`) based on `frontend/.env.example` and `backend/.env.example`. Required variables:

**Frontend**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`

**Backend**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `API_NINJAS_KEY`, `ALLOWED_ORIGINS`

## Design System

British Racing Green (`#00594C`) primary, cream (`#F5F1E8`) background, dark graphite (`#2B2B2B`) text, soft gold/amber (`#C9A24B`) accent. Full wireframes and screen-by-screen breakdown in `docs/CarSage_Wireframes.pdf`.

## Workflow Rules (from capstone requirements — follow strictly)

1. **Never commit directly to `main` or `dev`.** All work happens on the current sprint branch (`sprint-1`, `sprint-2`, `sprint-3`), which merges into `dev` only when that sprint is complete. See Git & Commit Rules for the full branch strategy.
2. **Meaningful, focused commits.** One logical change per commit, clear message.
3. **Per feature**: implement → test → review for quality → merge to the current sprint branch → review again after merge → check for security issues. Don't skip steps or batch multiple features before testing.
4. **Test every feature for**: the normal case, invalid inputs, edge cases, and authorization (can a different user see/edit this data? — test this directly, not just via the UI).
5. **Security checklist for every feature**: input validation (client AND server side), auth/authorization via Supabase RLS + JWT verification in FastAPI, no hardcoded secrets, no SQL/NoSQL injection risk, no raw error/stack-trace leakage to the client.
6. I (the developer) must be able to explain any code produced — don't generate code that can't be explained, debugged, or modified by hand.

## How to Work Through Tasks

Follow this exact loop for every single task. Do not skip or reorder steps.

1. **Check existing state first.** Before writing anything, review what's already in the repo (existing files, `docs/FILE_INDEX.md`, recent commits) so you don't duplicate work or contradict something already built. Read the task's acceptance criteria directly from Jira via the connector and restate them back before starting.
2. **Implement just this one task.** Nothing from later tasks, nothing "while I'm at it."
3. **Document as you go:**
   - Every file starts with a header comment stating its purpose in one or two lines (e.g., "Handles Trip Planner cost calculation logic").
   - Every function/component gets a docstring covering what it does, its parameters, and its return value.
   - Non-obvious logic gets inline comments explaining *why*, not just *what*.
   - Update `docs/FILE_INDEX.md` with one line per new or changed file, in the format: `path/to/file.ext — what this file does`. This is the project-wide map of what every file is for; keep it current every task, not just at the end.
4. **Write unit test(s) and run them.** Cover the normal/expected case, invalid input, and at least one edge case. Actually run the test suite and show me the passing output — a task is not done until its tests are written *and* run *and* pass, not just written.
5. **Commit and push to the current sprint branch.** One focused, meaningful commit (see Git & Commit Rules for the branch strategy). Never move to step 6 with uncommitted or unpushed work.
6. **Update Jira, report back, and stop.** Transition the task's status and add a comment summarizing what was done directly in Jira via the connector. Then tell me:
   - What was built and which files changed.
   - The test results.
   - What you just updated in Jira (status + comment text).
   - Then explicitly ask me to verify before continuing, and wait for my go-ahead. Do not start the next task in the sprint on your own.

## Git & Commit Rules

**Branch strategy:**
- `main` — final, tested code only. Merged from `dev` at the very end of the project, not before.
- `dev` — integration branch, created once from `main` at the start of the project. Never commit here directly; it only receives a merge from a sprint branch once that entire sprint is complete.
- `sprint-1`, `sprint-2`, `sprint-3` — one branch per sprint. **Every sprint branch is created directly from `dev`, never from another sprint branch.** All of that sprint's task commits go here. When the sprint is done, merge it into `dev`.

Flow, explicitly:
1. `dev` is created from `main` (once, at the very start).
2. `sprint-1` is created from `dev`. All Sprint 1 tasks commit here.
3. When Sprint 1 is done, merge `sprint-1` → `dev`.
4. `sprint-2` is created from `dev` (the updated `dev`, not from `sprint-1`). All Sprint 2 tasks commit here.
5. When Sprint 2 is done, merge `sprint-2` → `dev`.
6. `sprint-3` is created from `dev` (not from `sprint-2`). Same pattern.
7. When Sprint 3 is done, merge `sprint-3` → `dev`.
8. Only at the very end, once `dev` is fully tested, merge `dev` → `main`.

The rule in one sentence: **`dev` is the only parent any sprint branch is ever created from.**

**Other rules:**
- **Commit author must be only the developer (Mohamad Dib)** — never add a "Co-Authored-By: Claude" trailer, never mention Claude/AI generation in commit messages, and never modify local git config (`user.name` / `user.email`). If your commit workflow normally appends a co-author trailer, disable that behavior for this repo.
- Write commit messages as if a human developer wrote them: plain, factual, describing what changed and why (e.g., "Add car onboarding form validation", not "Implemented feature with Claude's help").
- Never commit anything under `.claude/`, `.claude.json`, `CLAUDE.local.md`, or `.mcp.json` — these are already in `.gitignore`; don't override that.

## Project Tracking

All work is tracked in Jira (project key `CAR`) via a connected Jira/Atlassian MCP connector — you (Claude Code) have direct read/write access to Jira in this environment.

- **Board**: https://mohamaddib.atlassian.net/jira/software/projects/CAR/boards/67/backlog
- **Individual task**: https://mohamaddib.atlassian.net/browse/CAR-8 (replace the number with any task ID, e.g. CAR-9, CAR-15)

Epics: Foundation (CAR-1), Onboarding & Profile (CAR-2), Trip Planner (CAR-3), AI Advisor (CAR-4), Security Review (CAR-5), Documentation & Submission (CAR-6), Project Planning (CAR-29). Each task has detailed acceptance criteria in Jira — read them directly via the connector at the start of each task and treat them as the source of truth for what "done" means.

**Since the connector is live**: read each task's acceptance criteria directly from Jira rather than waiting for me to paste them. When a task is finished (step 6 of the task loop), update the Jira task yourself — transition its status and add a comment summarizing what was done — rather than just drafting text for me to paste. Still stop and tell me what you updated, and wait for my verification before starting the next task.

## Reference Documents (in `docs/`)

- `CarSage_BRD.pdf` — full business requirements, scope, user stories, functional/non-functional requirements
- `CarSage_ERD.pdf` — database schema, entity definitions, relationships, security notes
- `CarSage_Wireframes.pdf` — all 7 screens, user flow diagram, design notes
- `FILE_INDEX.md` — living, one-line-per-file map of the codebase. Read it at the start of every task; update it at the end of every task.
