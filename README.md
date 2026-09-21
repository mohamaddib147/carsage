# CarSage

## Overview

**CarSage is a web companion app for everyday car owners.** Save your car once, then plan trips by their real fuel cost and ask an AI advisor whether a car problem is something you can fix yourself or a job for a mechanic.

It was built as a capstone project (React + FastAPI + Supabase). Fuel prices are tuned for Lebanon; everything else works anywhere Google Maps does.

## Contents

- [Overview](#overview)
- [Main features](#main-features)
- [Technologies used](#technologies-used)
- [How it fits together](#how-it-fits-together)
- [Install and run](#install-and-run)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [How to use CarSage](#how-to-use-carsage)
- [API reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Documentation](#documentation)

## Main features

| Feature | What it does |
|---|---|
| **Car Onboarding** | Add your car with a short form. Type the make, model and year and CarSage fills in engine type, fuel efficiency, cylinders, drivetrain, transmission and fuel tank size for you. You can change any of it. (Scanning a registration card is shown as "coming soon".) |
| **Car Profile** | See every saved spec for your car, edit any of them, or delete the car. |
| **Trip Planner** | Enter where you start and where you are going. You get the distance, the driving time with live traffic, the fuel cost, and the cost of a full tank, plus a map of the route. It compares light traffic with current traffic. |
| **AI Advisor** | Describe a car problem in plain words. You get a clear "DIY Fixable" or "See a Mechanic" verdict with short guidance, and a tutorial video for DIY fixes. Answers are checked against official US recall and complaint data first. Your conversation is saved. |

Supporting screens: Landing page, Sign Up / Log In, and a Dashboard that lists your cars and links to the tools.

## Technologies used

| Layer | Technology |
|---|---|
| Frontend | [React](https://react.dev) 19, [Vite](https://vite.dev), React Router, `@supabase/supabase-js` |
| Backend service | [FastAPI](https://fastapi.tiangolo.com) (Python 3.13), `httpx`, Uvicorn |
| Database and login | [Supabase](https://supabase.com): PostgreSQL, Supabase Auth, Row Level Security |
| Maps | Google Maps Platform: Directions API (backend), Places API (New) and Maps Static API (browser) |
| AI (LLM) | Google Gemini (`gemini-3.6-flash`) as the primary model, with automatic fallback to Groq (`openai/gpt-oss-120b`). Both have free tiers. |
| Vehicle data | NHTSA vPIC, Recalls and Complaints APIs; API Ninjas Cars API; fueleconomy.gov; auto-data.net (tank size) |
| Other | YouTube Data API v3 (DIY videos); Lebanese fuel prices read from L'Orient Today |
| Testing | pytest (backend), Vitest and Testing Library (frontend) |

## How it fits together

```
 Browser (React)
   │  ├── login, cars, saved chats ──────►  Supabase (Auth + Postgres, protected by Row Level Security)
   │  └── trip estimates, AI advice,
   │      spec autofill (with login token) ─►  FastAPI service ──► Google Maps, Gemini/Groq, NHTSA, ...
   │                                              │
   │                                              └── checks the login token, then reads/writes Supabase
   └── address suggestions, route map ────►  Google Maps (browser key)
```

The browser talks to Supabase directly for simple reads and writes; Row Level Security makes sure each person can only touch their own rows. Anything that needs a secret key or an outside service goes through the FastAPI service, which first verifies who is calling.

## Install and run

### Prerequisites

- **Git**
- **Node.js** with npm (developed and tested on Node 24)
- **Python 3.13** (the same version the Docker image uses)
- A free **Supabase** project. See [Database setup](#database-setup).
- API keys for the services listed under [Environment variables](#environment-variables). Only Supabase, Google Maps (Directions) and Gemini are required to start the backend; the rest are optional.

### 1. Get the code

```bash
git clone <this repository's URL>
cd carsage
```

### 2. Set up the database

Follow [Database setup](#database-setup) first. The app cannot log anyone in until the tables exist.

### 3. Run the FastAPI service

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate            # Windows (PowerShell / cmd)
# source .venv/bin/activate       # macOS / Linux
pip install -r requirements.txt
copy .env.example .env            # macOS / Linux: cp .env.example .env
# open .env and fill in the values (see "Environment variables")
uvicorn app.main:app --reload --port 8000
```

Check it is running: open <http://localhost:8000/health>. You should see `{"status":"ok","database":"connected"}`. Interactive API docs are at <http://localhost:8000/docs> while developing.

If a required variable is missing the service stops at start-up and names the variable.

### 4. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
copy .env.example .env            # macOS / Linux: cp .env.example .env
# open .env and fill in the values
npm run dev
```

Open <http://localhost:5173>.

Useful frontend scripts: `npm run dev` (dev server), `npm run build` (production build into `frontend/dist`), `npm test` (tests), `npm run lint` (linter), `npm run preview` (serve the production build locally).

## Environment variables

Copy each `.env.example` to `.env` and fill it in. **Never commit a `.env` file**: they are git-ignored, and `backend/scripts/scan_secrets.py` checks for leaked secrets. No real values appear in this README.

### Backend (`backend/.env`)

| Variable | Required | What it is |
|---|---|---|
| `SUPABASE_URL` | Yes | Your Supabase project URL (Project Settings → API). |
| `SUPABASE_SERVICE_KEY` | Yes | The Supabase **service role** key. It bypasses Row Level Security, so keep it on the server only and never put it in the frontend. |
| `GOOGLE_MAPS_API_KEY` | Yes | Google Cloud key with the **Directions API** enabled. Used for routes and traffic-adjusted travel time. |
| `GEMINI_API_KEY` | Yes | Google AI Studio key for the AI Advisor (primary model) and the tank-size estimate fallback. |
| `GROQ_API_KEY` | No | Groq key. If Gemini is busy or unavailable the AI Advisor falls back to Groq. Without it, that case shows a clear error instead. |
| `API_NINJAS_KEY` | No | API Ninjas key for car spec autofill (cylinders, drivetrain, transmission). Without it the form is simply filled in by hand or from the other free sources. |
| `YOUTUBE_API_KEY` | No | YouTube Data API v3 key for DIY video suggestions. Without it the advisor answers without a video. |
| `ALLOWED_ORIGINS` | Yes for browser use | Comma-separated list of frontend addresses allowed to call the API, for example `http://localhost:5173`. Anything not listed is refused by the browser. |

### Frontend (`frontend/.env`)

These are baked into the page at build time and are visible to anyone who opens the site, so only put public values here.

| Variable | Required | What it is |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL. |
| `VITE_SUPABASE_ANON_KEY` | Yes | The Supabase **anon** (public) key. Never the service role key. |
| `VITE_API_BASE_URL` | Yes | Where the FastAPI service is running, for example `http://localhost:8000`. |
| `VITE_GOOGLE_MAPS_API_KEY` | No | A separate, browser-only Google key with **Places API (New)** and **Maps Static API** enabled. Without it, address suggestions and the route map are simply hidden. Restrict this key to your site's address (HTTP referrer) in Google Cloud Console, because anyone can read it. |

Use two separate Google keys: the backend one (Directions, kept secret) and the browser one (restricted by referrer).

## Database setup

CarSage uses a Supabase project (PostgreSQL + Auth). The database is described by SQL migrations kept in [`docs/db_migrations/`](docs/db_migrations/). They match what was applied to the project, so running them in order recreates the same database.

1. **Create a project** at [supabase.com](https://supabase.com) (the free plan is enough).
2. **Auth:** email sign-in is on by default. Whether new users must confirm their email is your choice (Authentication → Sign In / Providers); the app works either way.
3. **Run the migrations in order.** Open the **SQL Editor**, and for each file below, paste its contents and run it. Do them in this order, one after another:

| # | File | What it does |
|---|---|---|
| 1 | `2026-09-11_01_create_profiles_table.sql` | `profiles` table, its Row Level Security policies, and a trigger that creates a profile whenever someone signs up. |
| 2 | `2026-09-11_02_create_cars_table.sql` | `cars` table with owner-only policies. |
| 3 | `2026-09-11_03_create_trips_table.sql` | `trips` table with owner-only policies. |
| 4 | `2026-09-11_04_create_advisor_tables.sql` | `advisor_conversations` and `advisor_messages` tables with owner-only policies. |
| 5 | `2026-09-11_05_harden_handle_new_user.sql` | Locks down the sign-up trigger function. |
| 6 | `2026-09-11_06_revoke_public_execute_handle_new_user.sql` | Removes public access to that function. |
| 7 | `2026-09-16_create_fuel_prices_table.sql` | `fuel_prices` cache table (used only by the backend). |
| 8 | `2026-09-17_add_car_spec_autofill_columns.sql` | Adds cylinders, drivetrain and transmission to `cars`. |
| 9 | `2026-09-18_add_advisor_messages_video_columns.sql` | Adds the DIY video link and title to `advisor_messages`. |
| 10 | `2026-09-19_add_cars_fuel_tank_capacity_liters.sql` | Adds fuel tank capacity to `cars`. |
| 11 | `2026-09-19_cars_fuel_tank_capacity_range_check.sql` | Limits tank capacity to 5 to 200 litres. |
| 12 | `2026-09-20_car23_input_validation_constraints.sql` | Database-level input limits (lengths, ranges, allowed fuel types) and `fuel_type` required. |
| 13 | `2026-09-20_car24_access_control_hardening.sql` | A trip or conversation may only point at the caller's own car; removes unneeded table privileges. |

   The file names sort in the order they must be run. Files 1 to 11 are verbatim copies of the migration history; files 12 and 13 were checked against what is applied to the project.
4. **Copy your keys** (Project Settings → API): the project URL, the `anon` key (frontend) and the `service_role` key (backend only) into the two `.env` files.
5. **Check it worked.** In the Table Editor you should see `profiles`, `cars`, `trips`, `advisor_conversations`, `advisor_messages` and `fuel_prices`, each with Row Level Security **enabled**. To be thorough, run the access-control check (it creates and deletes two throwaway users):

   ```bash
   cd backend
   .venv\Scripts\python scripts\verify_rls.py     # macOS / Linux: .venv/bin/python
   ```

   It should end with every check passing and no gaps.

The `fuel_prices` table starts empty; the backend fills it the first time fuel prices are requested. The PDF in `docs/CarSage_ERD.pdf` is the schema as submitted for planning; the migrations above are the current, complete description of the database.

## How to use CarSage

1. **Sign up.** Choose **Sign Up**, enter an email and a password of at least 6 characters. If your project requires email confirmation, click the link in the email, then **Log In**. You land on the **Dashboard**.
2. **Add your car** (Car Onboarding). From the Dashboard choose **Add Your Car** (or **Add Another Car**).
   - Fill in **Make**, **Model**, **Year** and **Fuel Type**. These four are required.
   - Use the make's official spelling, for example `Mercedes-Benz` rather than `Mercedes Benz`. Once make, model and year are filled in, the remaining specs (engine, fuel efficiency, cylinders, drivetrain, transmission, tank size) fill themselves in when the sources know your car. A short note under the tank size says where that figure came from; please check it. Anything you type yourself is never overwritten.
   - Choose **Add Car**. You are taken to the car's profile.
3. **View or edit your car** (Car Profile). The profile lists every spec. Choose **Edit** to change any field and **Save** (or **Cancel** to discard). **Delete Car** asks you to confirm and also removes that car's trip history.
4. **Plan a trip** (Trip Planner).
   - Pick the car (a selector appears when you have more than one).
   - Enter the **Starting Location** and the **Destination**. Address suggestions appear as you type. Both are needed to plan a route.
   - Optional: open **Advanced options** to change the fuel price (Lebanese pounds per litre, filled in from the latest published price) or the tank size.
   - Choose **Plan Trip**. You get the fuel cost for light traffic and for current traffic, the driving time with a Light / Moderate / Heavy traffic label, the distance, the cost of a full tank, and a map of the route. Costs are shown in US dollars with the Lebanese pound amount beside them.
5. **Ask the AI Advisor.**
   - Pick the car (if you have several).
   - Describe the problem, or tap an example such as "Squeaking brakes at low speed", and choose **Send**. Use real words: at least three letters and up to 1,000 characters.
   - You get a **DIY Fixable** badge with numbered steps (and a "Watch on YouTube" video when one is found) or a **See a Mechanic** badge with guidance. If the problem matches an open recall or a pattern of owner complaints for your car, the advisor points you to a mechanic. Your conversation is saved and reloads next time.
   - The advice is a starting point, not a professional diagnosis.
6. **Log out** from the header when you are done.

## API reference

The FastAPI service is used by the frontend; it is not meant to be called by hand, but this is what it offers. Every route except `/health` requires a valid login token (`Authorization: Bearer <token>`) and answers `401` without one.

| Method and path | What it does |
|---|---|
| `GET /health` | Reports whether the service and its database are reachable. Public. |
| `POST /trip-planner/directions` | Distance, duration and traffic duration between two places. |
| `POST /trip-planner/estimate` | The full trip estimate for one of your cars; saves the trip. |
| `GET /trip-planner/fuel-prices` | Current fuel prices per fuel type (LBP and USD). |
| `GET /cars/spec-suggestions` | Best-effort spec autofill for a make, model and year. |
| `POST /ai-advisor/classify` | Sends a described problem to the AI Advisor and saves the conversation. |

Errors are always short, plain messages; the service never returns stack traces or internal details.

## Testing

```bash
# Backend (from backend/, with the virtual environment active)
pytest

# Frontend (from frontend/)
npm test
npm run lint
```

No test needs real keys or the network: outside services are mocked.

Security re-checks that do use a real project (run them before a release or after any database or auth change; each cleans up after itself):

```bash
cd backend       # on macOS / Linux use .venv/bin/python instead of .venv\Scripts\python
.venv\Scripts\python scripts\verify_rls.py            # database access rules, two throwaway users
.venv\Scripts\python scripts\verify_backend_auth.py   # login checks against the running API (start it first)
.venv\Scripts\python scripts\scan_secrets.py          # looks for leaked keys in the code and the whole git history
```

## Deployment

**CarSage has not been deployed yet**, so there are no live addresses to list here. Add them below once the frontend and the API are hosted.

| Part | Host | Live address |
|---|---|---|
| Frontend | _not deployed yet_ | _to be added_ |
| FastAPI service | _not deployed yet_ | _to be added_ |
| Database and login | Supabase (hosted, project `ehjvbkhoafldqfsivtrn`) | managed by Supabase |

The repository is ready for deployment:

- **FastAPI service.** `backend/Dockerfile` builds an image that runs on any Docker host (Render, Fly.io and similar). Set the backend variables from the table above as environment variables on the host; the image never contains secrets. Set `ALLOWED_ORIGINS` to the exact address of the deployed frontend.
- **Frontend.** Run `npm run build` in `frontend/` and publish the `frontend/dist` folder on any static host. Set the `VITE_*` variables when building, because they are baked in. Configure the host to serve `index.html` for every path so page refreshes on routes such as `/dashboard` work.
- **After deploying:** set the deployed frontend address as the Site URL in Supabase (Authentication → URL Configuration); add that address to the browser Google key's allowed referrers; and check that the fuel price lookup works from the host. The price source sits behind Cloudflare, which can treat a hosting provider's address differently from a laptop. If it is blocked the app keeps using the last saved price instead of failing.

## Project structure

```
carsage/
├── frontend/          React app (Vite)
│   └── src/           pages, components, auth, shared helpers
├── backend/           FastAPI service
│   ├── app/           routers (API routes) and services (Google Maps, AI, NHTSA, ...)
│   ├── tests/         pytest suite
│   └── scripts/       security re-check scripts
├── docs/              planning documents, design references and database migrations
│   └── db_migrations/ the SQL that builds the database, in run order
├── CLAUDE.md          project rules and context
└── README.md          this file
```

`docs/FILE_INDEX.md` has a one-line description of every file.

## Documentation

- [`docs/FILE_INDEX.md`](docs/FILE_INDEX.md): what every file is for
- [`docs/CarSage_BRD.pdf`](docs/CarSage_BRD.pdf): business requirements
- [`docs/CarSage_Wireframes.pdf`](docs/CarSage_Wireframes.pdf): screens and user flow
- [`docs/CarSage_ERD.pdf`](docs/CarSage_ERD.pdf): database design as submitted
- [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md): short notes for each part
- [Jira board](https://mohamaddib.atlassian.net/jira/software/projects/CAR/boards/67/backlog): the project's tasks and acceptance criteria

Author: Mohamad Dib.
