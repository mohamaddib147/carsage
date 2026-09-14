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
- **AI model**: LLM API (e.g., Claude) — for the AI Advisor
- **Maps**: Google Maps API (Directions + Distance Matrix)
- **Fuel prices**: region-specific source (research and pick one; a reasonable static/regional default is acceptable for MVP)

## Database (already live in Supabase — see `docs/CarSage_ERD.pdf`)

Project: **CarSage** on Supabase (ref: `ehjvbkhoafldqfsivtrn`). Do not create new tables without checking the ERD first — the schema is finalized.

Tables: `profiles`, `cars`, `trips`, `advisor_conversations`, `advisor_messages`. All have row-level security enabled — every policy scopes to `auth.uid()`. Never bypass RLS by using the service key from the frontend; the service key belongs in the FastAPI backend only.

Full field-by-field definitions, types, and relationships are in `docs/CarSage_ERD.pdf`.

## Environment Variables

Create `.env` files (never commit them — see `.gitignore`) based on `frontend/.env.example` and `backend/.env.example`. Required variables:

**Frontend**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL`

**Backend**: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_MAPS_API_KEY`, `LLM_API_KEY`, `ALLOWED_ORIGINS`

## Design System

British Racing Green (`#00594C`) primary, cream (`#F5F1E8`) background, dark graphite (`#2B2B2B`) text, soft gold/amber (`#C9A24B`) accent. Full wireframes and screen-by-screen breakdown in `docs/CarSage_Wireframes.pdf`.

## Workflow Rules (from capstone requirements — follow strictly)

1. **Never commit directly to `main`.** Work on a `development` branch. Update it as each feature completes.
2. **Meaningful, focused commits.** One logical change per commit, clear message.
3. **Per feature**: implement → test → review for quality → merge to `development` → review again after merge → check for security issues. Don't skip steps or batch multiple features before testing.
4. **Test every feature for**: the normal case, invalid inputs, edge cases, and authorization (can a different user see/edit this data? — test this directly, not just via the UI).
5. **Security checklist for every feature**: input validation (client AND server side), auth/authorization via Supabase RLS + JWT verification in FastAPI, no hardcoded secrets, no SQL/NoSQL injection risk, no raw error/stack-trace leakage to the client.
6. I (the developer) must be able to explain any code produced — don't generate code that can't be explained, debugged, or modified by hand.

## How to Work Through Tasks

- **One Jira task at a time.** Do not start the next task until the current one is fully implemented, tested, and documented. Announce which task (e.g., CAR-8) you're starting and confirm the acceptance criteria before writing code.
- **After implementing each task, write a unit test for it** before moving on. Cover: the normal/expected case, invalid input, and at least one edge case (matches the capstone's testing requirement — see Workflow Rules below). Do not consider a task done until its test passes.
- **Document everything from the start** — not as a cleanup pass later:
  - Every function/component gets a docstring or comment block explaining what it does, its parameters, and its return value.
  - Every file starts with a short header comment stating its purpose (e.g., "Handles Trip Planner cost calculation logic").
  - Non-obvious logic gets inline comments explaining *why*, not just *what*.

## Git & Commit Rules

- **Commit author must be only the developer (Mohamad Dib)** — never add a "Co-Authored-By: Claude" trailer, never mention Claude/AI generation in commit messages, and never modify local git config (`user.name` / `user.email`). If your commit workflow normally appends a co-author trailer, disable that behavior for this repo.
- Write commit messages as if a human developer wrote them: plain, factual, describing what changed and why (e.g., "Add car onboarding form validation", not "Implemented feature with Claude's help").
- Never commit anything under `.claude/`, `.claude.json`, `CLAUDE.local.md`, or `.mcp.json` — these are already in `.gitignore`; don't override that.
- Follow the branch rule below (`development`, never `main`) for every commit.

## Project Tracking

All work is tracked in Jira (project key `CAR`). Epics: Foundation (CAR-1), Onboarding & Profile (CAR-2), Trip Planner (CAR-3), AI Advisor (CAR-4), Security Review (CAR-5), Documentation & Submission (CAR-6). Each has detailed tasks with acceptance criteria — treat those acceptance criteria as the source of truth for what "done" means for each piece of work.

## Reference Documents (in `docs/`)

- `CarSage_BRD.pdf` — full business requirements, scope, user stories, functional/non-functional requirements
- `CarSage_ERD.pdf` — database schema, entity definitions, relationships, security notes
- `CarSage_Wireframes.pdf` — all 7 screens, user flow diagram, design notes
