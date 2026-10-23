# Tests app/services/storage_cleanup.py (Step 3): the drain removes queued files
# per bucket and only then deletes their queue rows, leaves rows for the next run
# when a remove fails, ignores any bucket other than record-photos, and caps a run
# at 50; the background trigger starts at most once every 5 minutes; and the
# middleware starts it only for a request with an Authorization header. supabase
# is mocked; the live drain is proven by backend/scripts/verify_rls.py section 14.

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services import storage_cleanup


@pytest.fixture(autouse=True)
def _reset_throttle():
    storage_cleanup._last_drain_started = None
    yield
    storage_cleanup._last_drain_started = None


def _mock_supabase(rows, remove_side_effect=None):
    mock = MagicMock()
    select_chain = mock.table.return_value.select.return_value.order.return_value.limit.return_value
    select_chain.execute.return_value.data = rows
    remove = mock.storage.from_.return_value.remove
    if remove_side_effect:
        remove.side_effect = remove_side_effect
    return mock


def test_removes_queued_files_then_deletes_their_queue_rows():
    rows = [
        {"id": 1, "bucket_id": "record-photos", "object_path": "u/maintenance/r/a.jpg"},
        {"id": 2, "bucket_id": "record-photos", "object_path": "u/receipts/e/b.jpg"},
    ]
    mock = _mock_supabase(rows)
    with patch("app.services.storage_cleanup.supabase", mock):
        cleared = storage_cleanup.drain_storage_cleanup()

    assert cleared == 2
    mock.storage.from_.assert_called_once_with("record-photos")
    mock.storage.from_.return_value.remove.assert_called_once_with(["u/maintenance/r/a.jpg", "u/receipts/e/b.jpg"])
    mock.table.return_value.delete.return_value.in_.assert_called_once_with("id", [1, 2])


def test_reads_at_most_50_rows_oldest_first():
    mock = _mock_supabase([])
    with patch("app.services.storage_cleanup.supabase", mock):
        assert storage_cleanup.drain_storage_cleanup() == 0

    mock.table.return_value.select.return_value.order.assert_called_once_with("id")
    mock.table.return_value.select.return_value.order.return_value.limit.assert_called_once_with(50)
    mock.table.return_value.delete.assert_not_called()


def test_a_failed_remove_keeps_the_queue_rows_for_the_next_run():
    rows = [{"id": 7, "bucket_id": "record-photos", "object_path": "u/maintenance/r/a.jpg"}]
    mock = _mock_supabase(rows, remove_side_effect=RuntimeError("storage down"))
    with patch("app.services.storage_cleanup.supabase", mock):
        assert storage_cleanup.drain_storage_cleanup() == 0

    mock.table.return_value.delete.assert_not_called()


def test_ignores_any_bucket_other_than_record_photos():
    rows = [{"id": 3, "bucket_id": "car-photos", "object_path": "u/car/photo.jpg"}]
    mock = _mock_supabase(rows)
    with patch("app.services.storage_cleanup.supabase", mock):
        assert storage_cleanup.drain_storage_cleanup() == 0

    mock.storage.from_.assert_not_called()
    mock.table.return_value.delete.assert_not_called()


def test_the_background_drain_starts_at_most_once_per_interval():
    with patch("app.services.storage_cleanup.threading.Thread") as thread:
        assert storage_cleanup.maybe_drain_in_background() is True
        assert storage_cleanup.maybe_drain_in_background() is False

    assert thread.return_value.start.call_count == 1


def test_the_background_drain_starts_again_after_the_interval():
    with patch("app.services.storage_cleanup.threading.Thread") as thread, patch(
        "app.services.storage_cleanup.time.monotonic", side_effect=[1000.0, 1000.0 + 301]
    ):
        assert storage_cleanup.maybe_drain_in_background() is True
        assert storage_cleanup.maybe_drain_in_background() is True

    assert thread.return_value.start.call_count == 2


def test_a_drain_that_raises_never_escapes_the_background_thread():
    with patch("app.services.storage_cleanup.drain_storage_cleanup", side_effect=RuntimeError("boom")):
        storage_cleanup._drain_safely()  # must not raise


def test_the_middleware_starts_a_drain_only_for_a_request_with_an_authorization_header():
    from app.main import app

    client = TestClient(app)
    with patch("app.main.maybe_drain_in_background") as drain, patch("app.routers.health.supabase"):
        client.get("/health")
        assert drain.call_count == 0
        client.get("/health", headers={"Authorization": "Bearer anything"})
        assert drain.call_count == 1
