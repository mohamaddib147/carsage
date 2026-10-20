# Tests app/services/ai_limits.py: reads and caches api_limits rows, and
# a feature with no row at all reads back as None rather than raising or
# guessing. Pure wording support for usage_limiter.py's capped message —
# the real enforcement is the database trigger, tested live (see that
# migration's own comments).

import time
from unittest.mock import MagicMock, patch

import pytest

from app.services import ai_limits


@pytest.fixture(autouse=True)
def _clear_cache():
    ai_limits.clear_cache()
    yield
    ai_limits.clear_cache()


def _mock_supabase(data):
    mock = MagicMock()
    mock.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = data
    return mock


def test_returns_the_limits_row_for_a_configured_feature():
    mock_supabase = _mock_supabase({"per_user_daily": 20, "global_daily": 150})
    with patch("app.services.ai_limits.supabase", mock_supabase):
        result = ai_limits.get_limit("camera")

    assert result == {"per_user_daily": 20, "global_daily": 150}
    mock_supabase.table.assert_called_once_with("api_limits")


def test_returns_none_for_a_feature_with_no_row():
    mock_supabase = _mock_supabase(None)
    with patch("app.services.ai_limits.supabase", mock_supabase):
        assert ai_limits.get_limit("not_a_real_feature") is None


def test_caches_a_read_so_a_second_call_doesnt_hit_the_database_again():
    mock_supabase = _mock_supabase({"per_user_daily": 60, "global_daily": None})
    with patch("app.services.ai_limits.supabase", mock_supabase):
        ai_limits.get_limit("advisor")
        ai_limits.get_limit("advisor")

    mock_supabase.table.assert_called_once()


def test_a_different_feature_is_read_separately_even_while_cached():
    mock_supabase = _mock_supabase({"per_user_daily": 20, "global_daily": 150})
    with patch("app.services.ai_limits.supabase", mock_supabase):
        ai_limits.get_limit("camera")
        ai_limits.get_limit("advisor")

    assert mock_supabase.table.call_count == 2


def test_the_cache_expires_after_its_ttl():
    mock_supabase = _mock_supabase({"per_user_daily": 20, "global_daily": 150})
    with patch("app.services.ai_limits.supabase", mock_supabase), patch(
        "app.services.ai_limits._CACHE_TTL_SECONDS", 0.05
    ):
        ai_limits.get_limit("camera")
        time.sleep(0.1)
        ai_limits.get_limit("camera")

    assert mock_supabase.table.call_count == 2


def test_clear_cache_drops_every_cached_read():
    mock_supabase = _mock_supabase({"per_user_daily": 20, "global_daily": 150})
    with patch("app.services.ai_limits.supabase", mock_supabase):
        ai_limits.get_limit("camera")
        ai_limits.clear_cache()
        ai_limits.get_limit("camera")

    assert mock_supabase.table.call_count == 2
