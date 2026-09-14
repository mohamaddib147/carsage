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
- `frontend/src/main.jsx` — React entry point, mounts `<App />` inside a `BrowserRouter`.
- `frontend/src/App.jsx` — root component, defines the route table for all 7 screens.
- `frontend/src/App.test.jsx` — routing tests: each screen renders at its route, plus the 404 edge case.
- `frontend/src/index.css` — global design tokens (British Racing Green palette) and base styles.
- `frontend/src/test/setup.js` — Vitest setup, wires up jest-dom matchers.
- `frontend/src/components/PageShell.jsx` — shared placeholder layout (title + description) reused by every screen.
- `frontend/src/components/SiteNav.jsx` — top nav bar linking to all 7 screens, for manual dev verification.
- `frontend/src/pages/LandingPage.jsx` — Landing screen placeholder.
- `frontend/src/pages/AuthPage.jsx` — combined Sign Up / Log In screen placeholder.
- `frontend/src/pages/DashboardPage.jsx` — Dashboard/Home screen placeholder.
- `frontend/src/pages/CarOnboardingPage.jsx` — Car Onboarding screen placeholder (basic feature).
- `frontend/src/pages/CarProfilePage.jsx` — Car Profile screen placeholder (basic feature), reads `carId` from the route.
- `frontend/src/pages/TripPlannerPage.jsx` — Trip Planner screen placeholder (core feature).
- `frontend/src/pages/AIAdvisorPage.jsx` — AI Advisor screen placeholder (core feature).
- `frontend/src/pages/NotFoundPage.jsx` — 404 fallback for unmatched routes.

## backend/

*(nothing yet — added in CAR-10)*
