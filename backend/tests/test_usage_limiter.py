# Tests app/services/usage_limiter.py: record_usage/record_global_usage
# correctly distinguish the trigger's own USAGE_LIMIT_EXCEEDED refusal from
# any other failure, enforce_usage checks per-user before global, and the
# capped message includes the actual configured limit when it's known
# (and degrades gracefully when it isn't). supabase and the api_limits
# cache are both mocked -- the real atomicity/error-shape proof against the
# live database is in this migration's own docs/db_migrations file and was
# run by hand (30 concurrent requests against a limit of 20 gave exactly
# 20/10, with the stored count never exceeding the limit).

from unittest.mock import MagicMock, patch

import pytest
from postgrest.exceptions import APIError

from app.services import ai_limits
from app.services.usage_limiter import (
    UsageCheckFailed,
    UsageLimitExceeded,
    enforce_usage,
    record_global_usage,
    record_usage,
)


@pytest.fixture(autouse=True)
def _clear_limits_cache():
    ai_limits.clear_cache()
    yield
    ai_limits.clear_cache()


def _api_error(message):
    return APIError({"message": message, "code": "P0001", "hint": None, "details": None})


def test_record_usage_succeeds_on_a_normal_upsert():
    mock_supabase = MagicMock()
    with patch("app.services.usage_limiter.supabase", mock_supabase):
        record_usage("user-1", "camera")

    mock_supabase.table.assert_called_once_with("api_usage")
    upsert_call = mock_supabase.table.return_value.upsert.call_args
    assert upsert_call.args[0]["user_id"] == "user-1"
    assert upsert_call.args[0]["feature"] == "camera"
    assert upsert_call.kwargs["on_conflict"] == "user_id,feature,usage_date"


def test_record_usage_raises_usage_limit_exceeded_on_the_triggers_own_refusal():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.upsert.return_value.execute.side_effect = _api_error("USAGE_LIMIT_EXCEEDED")
    with patch("app.services.usage_limiter.supabase", mock_supabase), patch(
        "app.services.usage_limiter.get_limit", return_value={"per_user_daily": 20, "global_daily": None}
    ):
        with pytest.raises(UsageLimitExceeded) as excinfo:
            record_usage("user-1", "camera")

    assert "reached today's limit of 20" in str(excinfo.value)
    assert "midnight Beirut time" in str(excinfo.value)


def test_record_usage_raises_usage_check_failed_on_any_other_database_error():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.upsert.return_value.execute.side_effect = _api_error("relation \"api_usage\" does not exist")
    with patch("app.services.usage_limiter.supabase", mock_supabase):
        with pytest.raises(UsageCheckFailed):
            record_usage("user-1", "camera")


def test_record_usage_raises_usage_check_failed_on_a_transport_failure():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.upsert.return_value.execute.side_effect = ConnectionError("network down")
    with patch("app.services.usage_limiter.supabase", mock_supabase):
        with pytest.raises(UsageCheckFailed):
            record_usage("user-1", "camera")


def test_a_feature_with_no_api_limits_row_is_blocked():
    # The trigger raises USAGE_LIMIT_EXCEEDED for a feature it has no row
    # for at all (see the migration's enforce_api_usage_limit) -- this is
    # indistinguishable, on purpose, from a limit genuinely being hit.
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.upsert.return_value.execute.side_effect = _api_error("USAGE_LIMIT_EXCEEDED")
    with patch("app.services.usage_limiter.supabase", mock_supabase), patch(
        "app.services.usage_limiter.get_limit", return_value=None
    ):
        with pytest.raises(UsageLimitExceeded) as excinfo:
            record_usage("user-1", "an_unconfigured_feature")

    # No configured limit is known, so the message degrades to the
    # limit-less wording rather than crashing or showing a wrong number.
    assert "reached today's limit for this feature" in str(excinfo.value)


def test_record_global_usage_raises_usage_limit_exceeded_on_the_triggers_refusal():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.upsert.return_value.execute.side_effect = _api_error("USAGE_LIMIT_EXCEEDED")
    with patch("app.services.usage_limiter.supabase", mock_supabase), patch(
        "app.services.usage_limiter.get_limit", return_value={"per_user_daily": 20, "global_daily": 150}
    ):
        with pytest.raises(UsageLimitExceeded) as excinfo:
            record_global_usage("camera")

    assert "today's limit of 150" in str(excinfo.value)


def test_enforce_usage_checks_per_user_before_global():
    mock_supabase = MagicMock()
    with patch("app.services.usage_limiter.supabase", mock_supabase):
        enforce_usage("user-1", "camera")

    tables_called = [call.args[0] for call in mock_supabase.table.call_args_list]
    assert tables_called == ["api_usage", "api_usage_global"]


def test_enforce_usage_stops_at_the_per_user_refusal_without_touching_global():
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.upsert.return_value.execute.side_effect = _api_error("USAGE_LIMIT_EXCEEDED")
    with patch("app.services.usage_limiter.supabase", mock_supabase), patch(
        "app.services.usage_limiter.get_limit", return_value={"per_user_daily": 20, "global_daily": None}
    ):
        with pytest.raises(UsageLimitExceeded):
            enforce_usage("user-1", "camera")

    mock_supabase.table.assert_called_once_with("api_usage")
