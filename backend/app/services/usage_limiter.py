# Atomic per-user and global daily usage limiting for Gemini-backed
# features (camera, advisor), enforced by a Postgres
# trigger on api_usage / api_usage_global
# (docs/db_migrations/2026-10-20_ai_camera_usage_limits.sql) — this module
# never computes or checks a count itself, only upserts and reacts to the
# trigger's refusal. Proven atomic and race-free against the real database:
# 30 simultaneous requests against a limit of 20 gave exactly 20 successes
# and 10 refusals, with the stored count never exceeding the limit — see
# that migration's own comments.
#
# Only .upsert() is used, never .rpc() (test_no_raw_sql.py bans a
# backend-invoked stored procedure, but not a trigger fired by a plain
# write).
#
# The camera FAILS CLOSED on anything other than the
# limit actually being hit (UsageCheckFailed): a real database/network
# problem means "can't read photos right now, enter it manually" — a photo
# feature whose usage counter might be broken is not safe to let through
# silently. The Advisor FAILS OPEN on that same case (logs the error, keeps
# answering), since blocking car-safety advice over a usage-counter hiccup
# is worse than under-counting it for a few requests. A genuine
# UsageLimitExceeded — the trigger correctly reporting the limit IS hit —
# is enforced the same way for every feature; fail-open only ever applies
# to the enforcement mechanism itself failing, never to a limit that was
# actually reached. Each router decides this policy itself by catching
# UsageCheckFailed; this module only ever raises, it never decides.

from postgrest.exceptions import APIError

from app.services.ai_limits import get_limit
from app.services.beirut_time import today_in_beirut
from app.supabase_client import supabase

USAGE_LIMIT_EXCEEDED = "USAGE_LIMIT_EXCEEDED"
_RESET_SUFFIX = " It resets at midnight Beirut time."


class UsageLimitExceeded(Exception):
    """Raised when today's per-user or global cap for a feature has been
    reached, or the feature has no api_limits row at all (which blocks
    every attempt). Its message is safe to show to the end user."""


class UsageCheckFailed(Exception):
    """Raised when the usage table/trigger itself couldn't be reached or
    answered — NOT the limit being hit. Callers decide whether this fails
    open or closed; this module never swallows it itself."""


def _is_usage_limit_error(error: APIError) -> bool:
    return bool(error.message) and USAGE_LIMIT_EXCEEDED in error.message


def _capped_message(feature: str, scope: str) -> str:
    """"You've reached today's limit of 20 for this feature." when the
    configured limit is still known, or a limit-less fallback if the
    cached read itself is unavailable — the refusal already happened at
    the database, this is wording only."""
    limit = get_limit(feature)
    number = limit.get(scope) if limit else None
    prefix = (
        f"You've reached today's limit of {number} for this feature."
        if isinstance(number, int)
        else "You've reached today's limit for this feature."
    )
    return prefix + _RESET_SUFFIX


def record_usage(user_id: str, feature: str) -> None:
    """
    Atomically records one use of `feature` by `user_id` for today (Asia/
    Beirut), enforced by the api_usage_enforce_limit trigger.

    Raises:
        UsageLimitExceeded: today's per-user cap for `feature` is reached,
            or `feature` has no api_limits row at all.
        UsageCheckFailed: the table/trigger couldn't be reached or
            answered for any other reason (network, unexpected database
            error).
    """
    try:
        supabase.table("api_usage").upsert(
            {"user_id": user_id, "feature": feature, "usage_date": today_in_beirut()},
            on_conflict="user_id,feature,usage_date",
        ).execute()
    except APIError as error:
        if _is_usage_limit_error(error):
            raise UsageLimitExceeded(_capped_message(feature, "per_user_daily")) from error
        raise UsageCheckFailed(error.message or str(error)) from error
    except Exception as error:  # noqa: BLE001 - network/transport failures
        raise UsageCheckFailed(str(error)) from error


def record_global_usage(feature: str) -> None:
    """
    Same as record_usage, but for the feature-wide counter
    (api_usage_global), enforced by api_usage_global_enforce_limit. A
    feature whose api_limits.global_daily is NULL (advisor) is never
    blocked by this — see that function's own
    comment — it is only ever hit for camera today.
    """
    try:
        supabase.table("api_usage_global").upsert(
            {"feature": feature, "usage_date": today_in_beirut()},
            on_conflict="feature,usage_date",
        ).execute()
    except APIError as error:
        if _is_usage_limit_error(error):
            raise UsageLimitExceeded(_capped_message(feature, "global_daily")) from error
        raise UsageCheckFailed(error.message or str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise UsageCheckFailed(str(error)) from error


def enforce_usage(user_id: str, feature: str) -> None:
    """
    Records both the per-user and the feature-wide usage for `feature` in
    one call — the per-user check first, since it's both the far more
    common refusal and the clearer message.

    Raises:
        UsageLimitExceeded, UsageCheckFailed: see record_usage /
            record_global_usage.
    """
    record_usage(user_id, feature)
    record_global_usage(feature)
