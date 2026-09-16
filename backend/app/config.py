# Loads configuration from environment variables (.env in local dev, the
# host's env var settings in production). No secret ever lives in code.

import os

from dotenv import load_dotenv

load_dotenv()


def _require_env(name: str) -> str:
    """Reads a required environment variable, failing fast with a clear message if it's missing."""
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(
            f"Missing required environment variable: {name}. "
            "Copy backend/.env.example to backend/.env and fill in the values."
        )
    return value


SUPABASE_URL = _require_env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = _require_env("SUPABASE_SERVICE_KEY")
GOOGLE_MAPS_API_KEY = _require_env("GOOGLE_MAPS_API_KEY")

# Comma-separated list of allowed frontend origins for CORS, e.g.
# "http://localhost:5173,https://carsage.example.com"
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

# Optional for this task — required once the AI Advisor is built (CAR-19).
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
