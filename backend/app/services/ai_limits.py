# Reads api_limits (docs/db_migrations/2026-10-20_ai_camera_usage_limits.sql)
# — the single source of truth for every AI/camera feature's daily caps —
# purely to word a friendly "today's limit" message if a caller ever wants
# one. Cached briefly since display text doesn't need a fresh read on every
# call; the REAL enforcement is the database triggers in usage_limiter.py,
# which read api_limits directly and live on every single write, never
# cached, so a limit change here is still enforced immediately regardless
# of what this cache is showing.

import time

from app.supabase_client import supabase

_CACHE_TTL_SECONDS = 120
_cache: dict[str, tuple[float, dict | None]] = {}


def get_limit(feature: str) -> dict | None:
    """
    Returns {"per_user_daily": int, "global_daily": int | None} for
    `feature`, or None if it has no api_limits row at all (meaning every
    attempt at it is blocked). Cached up to 2 minutes.
    """
    cached = _cache.get(feature)
    now = time.monotonic()
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    result = (
        supabase.table("api_limits")
        .select("per_user_daily, global_daily")
        .eq("feature", feature)
        .maybe_single()
        .execute()
    )
    data = result.data if result else None
    _cache[feature] = (now, data)
    return data


def clear_cache() -> None:
    """Test-only: drops every cached read, so one test's result can never
    leak into another's."""
    _cache.clear()
