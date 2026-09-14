# CarSage Backend

FastAPI service (Trip Planner cost calculation, AI Advisor) for CarSage. See the root `CLAUDE.md` and `docs/` for project scope.

## Local setup

```
python -m venv .venv
.venv\Scripts\activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
copy .env.example .env        # fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, etc.
uvicorn app.main:app --reload --port 8000
```

Then check `http://localhost:8000/health` — it should return
`{"status": "ok", "database": "connected"}`.

## Tests

```
pytest
```

## Deployment

A `Dockerfile` is included for deploying to any Docker-based host (Render,
Fly.io, etc.). Set the same variables from `.env.example` as environment
variables on the host — never commit real secrets. **Deployment itself is a
manual step done from the hosting provider's dashboard/CLI, not part of this
repo's automation.**
