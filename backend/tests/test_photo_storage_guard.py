# Source guard (Step 3): maintenance photos and expense receipts are STORED ONLY.
# They are never read by the backend and never sent to Gemini or any other
# service. The only backend file that may name their bucket or tables is the
# cleanup drainer, and it may not import the LLM client or an HTTP client. The
# frontend side of this guard lives in frontend/src/lib/recordPhotos.test.js.

import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"
SOURCES = {path.relative_to(APP_DIR).as_posix(): path.read_text(encoding="utf-8") for path in APP_DIR.rglob("*.py")}

PHOTO_NAMES = re.compile(r"record-photos|maintenance_record_photos|car_expense_receipts|storage_cleanup_queue")
DRAINER = "services/storage_cleanup.py"


def test_it_scans_the_real_source():
    assert DRAINER in SOURCES
    assert "services/llm_client.py" in SOURCES


def test_only_the_cleanup_drainer_names_the_photo_bucket_or_tables():
    offenders = sorted(path for path, text in SOURCES.items() if PHOTO_NAMES.search(text) and path != DRAINER)
    assert offenders == []


def test_the_drainer_never_imports_the_llm_client_or_an_http_client():
    text = SOURCES[DRAINER]
    assert not re.search(r"^\s*(from|import)\s+(app\.services\.llm_client|httpx|requests|urllib)", text, re.M)
    assert "download(" not in text  # it removes files; it never reads one


def test_the_gemini_code_never_touches_storage():
    for path in ("services/llm_client.py", "routers/fuel_camera.py"):
        assert ".storage" not in SOURCES[path], path
