# Tests app/services/beirut_time.py: the single shared "today" helper every
# AI-usage-limit call site uses, so a user's day boundary is always
# Asia/Beirut, never the server's own UTC day.

from datetime import datetime
from zoneinfo import ZoneInfo

from app.services.beirut_time import today_in_beirut


def test_returns_todays_date_in_beirut_as_an_iso_string():
    expected = datetime.now(ZoneInfo("Asia/Beirut")).date().isoformat()
    assert today_in_beirut() == expected


def test_is_a_plain_yyyy_mm_dd_string_a_postgres_date_literal_accepts():
    result = today_in_beirut()
    assert len(result) == 10
    assert result[4] == "-" and result[7] == "-"
    datetime.strptime(result, "%Y-%m-%d")  # raises if it isn't exactly that shape
