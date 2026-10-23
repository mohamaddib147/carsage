# Shared test setup. Any request carrying an Authorization header may start the
# Step 3 photo-file cleanup in a background thread (app/main.py), which would
# reach the real Supabase project. It is switched off for every test here;
# tests/test_storage_cleanup.py tests the trigger and the drain on their own.

from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def _no_background_photo_cleanup(request):
    if request.module.__name__.endswith("test_storage_cleanup"):
        yield
        return
    with patch("app.main.maybe_drain_in_background") as mock_drain:
        yield mock_drain
