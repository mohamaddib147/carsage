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

# AI Advisor (CAR-19): Gemini is the primary provider (required). Groq is
# an automatic fallback used only when Gemini rate-limits (429) — if it
# isn't configured, that rare case surfaces as a clear error instead of
# silently guessing.
GEMINI_API_KEY = _require_env("GEMINI_API_KEY")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")

# Optional: powers Car Onboarding's spec autofill (CAR-34). If unset, that
# lookup just returns no API Ninjas data and the user fills specs manually
# — it must never block onboarding.
API_NINJAS_KEY = os.environ.get("API_NINJAS_KEY", "")
