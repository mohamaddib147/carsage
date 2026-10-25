# Removes Storage files whose maintenance photo / expense receipt rows were
# deleted (Step 3). Postgres can't delete Storage files itself (the project's
# protect_objects_delete trigger blocks it), so an AFTER DELETE trigger on
# maintenance_record_photos / car_expense_receipts writes each removed path to
# storage_cleanup_queue (docs/db_migrations/2026-10-21_record_photos_storage.sql),
# including deletes that come from a cascade (undoing a completion, deleting an
# item, a car or the account). This module drains that queue with the service
# key through the Storage API.
#
# Idempotent: removing a file that is already gone succeeds, and a queue row is
# deleted only after its bucket's remove call returned without error, so a
# failure leaves the row for the next run. At most DRAIN_BATCH files per run and
# at most one run every DRAIN_INTERVAL_SECONDS, started in a background thread
# by a logged-in request (see app/main.py), so it never slows a response.
#
# Photos are stored only: this module never reads a photo's content and never
# sends anything to Gemini or any other service (tests/test_photo_storage_guard.py).

import logging
import threading
import time

from app.supabase_client import supabase

logger = logging.getLogger(__name__)

DRAIN_BATCH = 50
DRAIN_INTERVAL_SECONDS = 300
# The only bucket the queue is ever filled for; anything else is left alone.
CLEANUP_BUCKETS = {"record-photos"}

_last_drain_started = None
_lock = threading.Lock()


def drain_storage_cleanup(limit: int = DRAIN_BATCH) -> int:
    """
    Removes up to `limit` queued files from Storage and deletes their queue
    rows. Returns how many queue rows were cleared.
    """
    rows = (
        supabase.table("storage_cleanup_queue")
        .select("id, bucket_id, object_path")
        .order("id")
        .limit(limit)
        .execute()
        .data
        or []
    )

    by_bucket: dict[str, list[dict]] = {}
    for row in rows:
        if row["bucket_id"] in CLEANUP_BUCKETS:
            by_bucket.setdefault(row["bucket_id"], []).append(row)

    cleared = []
    for bucket, group in by_bucket.items():
        try:
            supabase.storage.from_(bucket).remove([row["object_path"] for row in group])
        except Exception:  # noqa: BLE001 - keep the rows for the next run
            logger.exception("Could not remove %d queued file(s) from %s", len(group), bucket)
            continue
        cleared.extend(row["id"] for row in group)

    if cleared:
        supabase.table("storage_cleanup_queue").delete().in_("id", cleared).execute()
    return len(cleared)


def _drain_safely() -> None:
    try:
        drain_storage_cleanup()
    except Exception:  # noqa: BLE001 - a background job must never crash the app
        logger.exception("Storage cleanup drain failed")


def maybe_drain_in_background() -> bool:
    """Starts a background drain if none started in the last
    DRAIN_INTERVAL_SECONDS. Returns whether one was started."""
    global _last_drain_started
    with _lock:
        now = time.monotonic()
        if _last_drain_started is not None and now - _last_drain_started < DRAIN_INTERVAL_SECONDS:
            return False
        _last_drain_started = now
    threading.Thread(target=_drain_safely, daemon=True).start()
    return True
