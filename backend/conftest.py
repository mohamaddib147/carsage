# Ensures tests never depend on a real backend/.env file or real secrets —
# sets harmless defaults before any test imports app modules. setdefault()
# means a real .env (loaded later by app.config, override=False) never
# overrides these, so tests stay hermetic regardless of local setup.

import os

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("GOOGLE_MAPS_API_KEY", "test-google-maps-key")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
