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
- `frontend/src/App.jsx` — root component, defines the route table for all 7 screens; Dashboard, Car Onboarding, Car Profile, Trip Planner, and AI Advisor are wrapped in `ProtectedRoute`.
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
- `frontend/src/pages/DashboardPage.jsx` — Dashboard/Home screen: shows the logged-in user's saved car(s) (or an empty state linking to Car Onboarding), an "Add Another Car" link, and two module cards linking to Trip Planner and AI Advisor.
- `frontend/src/pages/DashboardPage.test.jsx` — tests the empty state, showing saved car(s), the Add Another Car link, a failed-load edge case falling back to the empty state, and the two module cards.
- `frontend/src/pages/CarOnboardingPage.jsx` — Add Your Car screen (basic feature): manual entry form (Make, Model, Year, Engine Type, Fuel Type, License Plate, VIN), client-side validation on the required fields, inserts a new `cars` row scoped to the logged-in user, disabled "Scan Registration Card" placeholder.
- `frontend/src/pages/CarOnboardingPage.test.jsx` — tests a valid submit (correct `user_id` on the inserted row, navigates to the new car's profile), missing required fields, a too-old and a too-far-future year, non-numeric year input, very long Make/Model text, special characters in VIN, and the insert-error case.
- `frontend/src/pages/CarProfilePage.jsx` — Car Profile screen (basic feature): displays all `cars` fields for the logged-in user's car (via `/cars/mine`, or a specific `/cars/:carId`), Edit mode updates any field via `cars` update, empty state (no car yet) links to Car Onboarding. Relies on RLS to scope view/edit to the owner. Fuel Efficiency is labeled km/L (not mpg — fixed in CAR-16, since the cost formula divides distance_km directly by this value).
- `frontend/src/pages/CarProfilePage.test.jsx` — tests viewing all fields, the empty state, editing/saving a field (correct `id` scoping), edit validation, update failure, Cancel discarding changes, special characters in VIN rendering as safe text (no XSS), and that a car id the user doesn't own renders the same safe not-found state.
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
- `backend/app/config.py` — loads and validates required env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GOOGLE_MAPS_API_KEY`); fails fast with a clear error if one is missing.
- `backend/app/supabase_client.py` — shared Supabase client using the service role key (server-side only, bypasses RLS).
- `backend/app/routers/health.py` — `GET /health`, reports API status and DB reachability without leaking error detail.
- `backend/app/auth.py` — `get_current_user_id` FastAPI dependency: verifies the `Authorization: Bearer <jwt>` header against Supabase Auth, since the backend's service-role client bypasses RLS and so must check the caller's identity itself on any user-scoped endpoint.
- `backend/app/routers/trip_planner.py` — `POST /trip-planner/directions`: origin/destination → distance + durations via Google Maps. `GET /trip-planner/fuel-prices`: current price per fuel type in LBP and USD. `POST /trip-planner/estimate`: the full flow — route + the caller's car's fuel_efficiency (km/L) + fuel price (scraped default or manual override) → estimated cost, saved as a new `trips` row. Requires auth; verifies `car_id` belongs to the caller. All return a clear error message, never a stack trace, on failure.
- `backend/app/services/google_maps.py` — isolates the Google Maps Distance Matrix API call in one function (`get_route_summary`); raises `GoogleMapsError` with a safe, user-facing message on any failure.
- `backend/app/services/fuel_prices.py` — scrapes Lebanon's weekly fuel prices from dgo.gov.lb (Directorate General of Oil), caches them in the `fuel_prices` table (at most weekly), falls back to the last cached price if a re-scrape fails, and converts LBP to USD at a fixed rate (`LBP_PER_USD`). Scraping approach and HTML structure documented in the module docstring.
- `backend/tests/test_health.py` — tests the health endpoint's normal case (DB reachable) and the DB-unreachable edge case.
- `backend/tests/test_main.py` — tests CORS allows the configured frontend origin and rejects an unlisted one.
- `backend/tests/test_config.py` — tests `ALLOWED_ORIGINS` parsing (normal + empty) and that a missing required secret (Supabase or Google Maps) raises a clear error.
- `backend/tests/test_auth.py` — tests `get_current_user_id`: a valid token, a missing header, a non-Bearer header, and an invalid/expired token (no leaked detail).
- `backend/tests/test_google_maps.py` — tests a valid route lookup, the traffic-duration-absent fallback, an unresolvable address, a non-OK top-level API status, and a network failure (no leaked detail).
- `backend/tests/test_fuel_prices.py` — tests HTML parsing (valid block, skipping zero-placeholder blocks, no parseable block), cache orchestration (fresh cache reused, stale cache triggers a re-scrape, a failed re-scrape falls back to stale cache, and no-cache-at-all raises), and the LBP→USD conversion.
- `backend/tests/test_trip_planner.py` — tests directions (valid, missing/empty destination, missing origin, a Maps failure), fuel-prices (LBP+USD shape, unavailable), and estimate (default vs. manual fuel price, diesel-vs-gasoline price mapping, a car that isn't the caller's own, missing fuel efficiency, an electric car with no override, a Maps failure, and missing authentication).
