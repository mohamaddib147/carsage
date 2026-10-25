# The single shared source for "today" wherever an AI/camera usage cap's
# daily counter is read or written (app/services/usage_limiter.py). Every
# call site must use this, not datetime.now()/date.today() directly — a
# user's day boundary (and the "resets at midnight" wording shown when
# they're capped) is Asia/Beirut, not the server's own UTC day.

from datetime import datetime
from zoneinfo import ZoneInfo

BEIRUT = ZoneInfo("Asia/Beirut")


def today_in_beirut() -> str:
    """Today's date in Asia/Beirut, as "YYYY-MM-DD" (a Postgres `date` literal)."""
    return datetime.now(BEIRUT).date().isoformat()
