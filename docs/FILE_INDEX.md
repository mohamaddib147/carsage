# File Index

One line per file: what it does. Update this every task — do not let it go stale.
Format: `path/to/file — what this file does`

## Root

- `CLAUDE.md` — context and workflow rules for AI-assisted development on this project.
- `README.md` — project overview and setup (placeholder until CAR-26).
- `.gitignore` — files/folders excluded from version control.

## docs/

- `docs/CarSage_BRD.pdf` — business requirements document.
- `docs/CarSage_ERD.pdf` — database schema and entity relationships.
- `docs/CarSage_Wireframes.pdf` — UI screens and user flow.
- `docs/FILE_INDEX.md` — this file.

## frontend/

- `frontend/README.md` — frontend setup and npm script reference.
- `frontend/index.html` — Vite HTML entry point, mounts the React app.
- `frontend/package.json` — frontend dependencies and npm scripts (dev, build, test, lint).
- `frontend/vite.config.js` — Vite build config and Vitest test config.
- `frontend/.env.example` — required frontend environment variables (Supabase, API base URL).
- `frontend/src/main.jsx` — React entry point, mounts `<App />` inside a `BrowserRouter` and `AuthProvider`.
- `frontend/src/App.jsx` — root component, defines the route table for all 7 screens; Dashboard, Car Profile, Trip Planner, and AI Advisor are wrapped in `ProtectedRoute`.
- `frontend/src/App.test.jsx` — routing tests: public screens render at their route, protected screens redirect logged-out users to `/login`, plus the 404 edge case.
- `frontend/src/index.css` — global design tokens (British Racing Green palette) and base styles.
- `frontend/src/test/setup.js` — Vitest setup, wires up jest-dom matchers.
- `frontend/src/lib/supabaseClient.js` — configures the shared Supabase client from `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`.
- `frontend/src/auth/AuthContext.jsx` — React context holding the Supabase auth session (re-hydrated on mount so login persists across refresh) and exposing `signUp`/`signIn`/`signOut`.
- `frontend/src/auth/AuthContext.test.jsx` — tests session re-hydration on mount (refresh persistence) and the logged-out edge case.
- `frontend/src/components/PageShell.jsx` — shared placeholder layout (title + description) reused by every screen.
- `frontend/src/components/SiteNav.jsx` — top nav bar linking to all 7 screens; shows a Log Out button when a user is signed in.
- `frontend/src/components/ProtectedRoute.jsx` — route guard that redirects logged-out users to `/login`.
- `frontend/src/components/ProtectedRoute.test.jsx` — tests the redirect (logged-out) and pass-through (logged-in) cases.
- `frontend/src/pages/LandingPage.jsx` — Landing screen placeholder.
- `frontend/src/pages/AuthPage.jsx` — combined Sign Up / Log In screen wired to Supabase Auth: client-side empty-field validation, calls `signUp`/`signIn`, shows a clear error on failure, redirects to the dashboard (or the originally-requested page) on success.
- `frontend/src/pages/AuthPage.test.jsx` — tests valid login/signup, invalid password, duplicate email signup, and empty-field validation, with the Supabase client mocked.
- `frontend/src/pages/DashboardPage.jsx` — Dashboard/Home screen placeholder.
- `frontend/src/pages/CarOnboardingPage.jsx` — Car Onboarding screen placeholder (basic feature).
- `frontend/src/pages/CarProfilePage.jsx` — Car Profile screen placeholder (basic feature), reads `carId` from the route.
- `frontend/src/pages/TripPlannerPage.jsx` — Trip Planner screen placeholder (core feature).
- `frontend/src/pages/AIAdvisorPage.jsx` — AI Advisor screen placeholder (core feature).
- `frontend/src/pages/NotFoundPage.jsx` — 404 fallback for unmatched routes.

## backend/

- `backend/README.md` — backend setup, run, test, and deployment reference.
- `backend/requirements.txt` — pinned Python dependencies.
- `backend/.env.example` — required backend environment variables (Supabase service key, API keys, CORS).
- `backend/pyproject.toml` — pytest config (adds `backend/` to the Python path, sets the test dir).
- `backend/conftest.py` — sets harmless default env vars so tests never need a real `.env` or real secrets.
- `backend/Dockerfile` — container image for deploying the API to any Docker-based host.
- `backend/.dockerignore` — excludes venv/tests/secrets from the built image.
- `backend/app/main.py` — FastAPI app instance, CORS middleware (from `ALLOWED_ORIGINS`), route registration.
- `backend/app/config.py` — loads and validates required env vars; fails fast with a clear error if a secret is missing.
- `backend/app/supabase_client.py` — shared Supabase client using the service role key (server-side only, bypasses RLS).
- `backend/app/routers/health.py` — `GET /health`, reports API status and DB reachability without leaking error detail.
- `backend/tests/test_health.py` — tests the health endpoint's normal case (DB reachable) and the DB-unreachable edge case.
- `backend/tests/test_main.py` — tests CORS allows the configured frontend origin and rejects an unlisted one.
- `backend/tests/test_config.py` — tests `ALLOWED_ORIGINS` parsing (normal + empty) and that a missing required secret raises a clear error.
