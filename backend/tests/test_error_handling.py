# Error-handling and log-hygiene guards for the API (CAR-25, AC 3). Whatever goes
# wrong inside the server, a caller only ever reads a fixed, friendly sentence —
# never a stack trace, a database error, a file path or an exception's own text —
# and the API keys (which travel in outbound URLs) never reach a log line.

import ast
import logging
import re
from pathlib import Path
from unittest.mock import patch

import httpx
import pytest
from fastapi.testclient import TestClient

from app.auth import get_current_user_id
from app.main import UNEXPECTED_ERROR_MESSAGE, app

APP_DIR = Path(__file__).resolve().parents[1] / "app"
FRONTEND_ORIGIN = "http://localhost:5173"  # what conftest.py sets ALLOWED_ORIGINS to

# Text that must never reach a caller: it stands in for a database driver's
# message, a stack trace and an internal path all at once.
INTERNALS = 'connection to "db.internal.example" refused at /srv/carsage/app/secret_module.py, line 42'


@pytest.fixture
def signed_in_client():
    """A client for a logged-in user that, unlike the default, RETURNS 500s
    instead of re-raising the server's exception into the test."""
    app.dependency_overrides[get_current_user_id] = lambda: "user-1"
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.pop(get_current_user_id, None)


class TestUnexpectedServerErrors:
    def test_the_client_gets_a_fixed_friendly_json_message(self, signed_in_client):
        with patch("app.routers.trip_planner.get_current_fuel_prices", side_effect=Exception(INTERNALS)):
            response = signed_in_client.get("/trip-planner/fuel-prices")

        assert response.status_code == 500
        assert response.json() == {"detail": UNEXPECTED_ERROR_MESSAGE}

    @pytest.mark.parametrize(
        "error",
        [
            Exception(INTERNALS),
            RuntimeError(INTERNALS),
            KeyError("secret_column"),
            ZeroDivisionError("division by zero"),
            httpx.ConnectError(INTERNALS),
        ],
        ids=lambda error: type(error).__name__,
    )
    def test_nothing_about_the_exception_reaches_the_client(self, signed_in_client, error):
        with patch("app.routers.trip_planner.get_current_fuel_prices", side_effect=error):
            response = signed_in_client.get("/trip-planner/fuel-prices")

        body = response.text
        for leaked in ("db.internal", "secret_module", "/srv/", "secret_column", "division", "Traceback", "File \""):
            assert leaked not in body
        assert type(error).__name__ not in body

    def test_the_browser_is_allowed_to_read_the_error(self, signed_in_client):
        # Without CORS headers on the 500 the browser would block the reply and the
        # page could only say "network error" instead of the friendly message.
        with patch("app.routers.trip_planner.get_current_fuel_prices", side_effect=Exception(INTERNALS)):
            response = signed_in_client.get("/trip-planner/fuel-prices", headers={"Origin": FRONTEND_ORIGIN})

        assert response.headers["access-control-allow-origin"] == FRONTEND_ORIGIN

    def test_the_real_cause_is_logged_on_the_server_only(self, signed_in_client, caplog):
        with caplog.at_level(logging.ERROR, logger="app.main"):
            with patch("app.routers.trip_planner.get_current_fuel_prices", side_effect=Exception(INTERNALS)):
                response = signed_in_client.get("/trip-planner/fuel-prices")

        assert INTERNALS not in response.text
        assert any(record.exc_info and INTERNALS in str(record.exc_info[1]) for record in caplog.records)

    # The catch-all must not swallow deliberate answers (HTTPException, 422).
    def test_a_refused_login_is_still_a_401_with_its_own_message(self):
        response = TestClient(app, raise_server_exceptions=False).get("/trip-planner/fuel-prices")

        assert response.status_code == 401
        assert response.json() == {"detail": "Missing or invalid Authorization header."}

    def test_invalid_input_is_still_a_422(self, signed_in_client):
        response = signed_in_client.post("/trip-planner/directions", json={"origin": "A"})

        assert response.status_code == 422

    def test_unknown_routes_are_still_a_plain_404(self):
        response = TestClient(app, raise_server_exceptions=False).get("/no/such/route")

        assert response.status_code == 404
        assert "Traceback" not in response.text


class TestApiKeysStayOutOfLogs:
    # Google Maps, Gemini and YouTube take their key as a `?key=` query parameter,
    # and httpx logs each outbound URL at INFO level.

    def _log_of_one_outbound_call(self, caplog):
        transport = httpx.MockTransport(lambda request: httpx.Response(200, json={}))
        with caplog.at_level(logging.DEBUG):  # the noisiest setting a host could pick
            with httpx.Client(transport=transport) as client:
                client.get("https://maps.example/api", params={"key": "SUPER-SECRET-KEY-VALUE"})
        return caplog.text

    def test_an_outbound_request_with_a_key_in_its_url_is_not_logged(self, caplog):
        assert "SUPER-SECRET-KEY-VALUE" not in self._log_of_one_outbound_call(caplog)

    def test_the_http_libraries_are_held_at_warning_level(self):
        for name in ("httpx", "httpcore"):
            assert logging.getLogger(name).level == logging.WARNING

    def test_without_the_setting_the_key_WOULD_be_logged(self, caplog):
        # Proves the check above is real: lift the setting and the key appears.
        httpx_logger = logging.getLogger("httpx")
        original = httpx_logger.level
        httpx_logger.setLevel(logging.NOTSET)
        try:
            assert "SUPER-SECRET-KEY-VALUE" in self._log_of_one_outbound_call(caplog)
        finally:
            httpx_logger.setLevel(original)


class TestSourceNeverBuildsAnErrorFromInternals:
    """Source-level guard: the API's code may only put text it wrote itself into
    an error response. (Scans backend/app; a manual audit found it true today.)"""

    # Exceptions whose message is a fixed sentence written in this codebase.
    SAFE_EXCEPTIONS = {"GoogleMapsError", "FuelPriceError", "LLMError"}

    @staticmethod
    def _sources():
        return {path: path.read_text(encoding="utf-8") for path in APP_DIR.rglob("*.py")}

    def test_it_scans_the_real_source(self):
        sources = self._sources()
        assert len(sources) >= 10
        assert any(path.name == "trip_planner.py" for path in sources)

    def test_no_traceback_or_exception_dump_is_ever_produced(self):
        forbidden = re.compile(r"traceback|format_exc|print_exc|exc_info\s*=\s*True|repr\(\s*(e|err|error|exc)\s*\)")
        hits = [
            f"{path.name}:{number}: {line.strip()}"
            for path, text in self._sources().items()
            for number, line in enumerate(text.splitlines(), 1)
            if forbidden.search(line) and not line.strip().startswith("#")
        ]

        assert hits == []

    def test_debug_mode_is_never_switched_on(self):
        for path, text in self._sources().items():
            assert not re.search(r"debug\s*=\s*True", text), path.name

    def test_an_http_error_detail_is_only_ever_written_text_or_a_vetted_exceptions_message(self):
        # `detail=str(x)` is allowed only inside `except <SafeError> as x`.
        problems = []
        for path, text in self._sources().items():
            tree = ast.parse(text)
            for handler in (node for node in ast.walk(tree) if isinstance(node, ast.ExceptHandler)):
                caught = ast.unparse(handler.type) if handler.type else "everything"
                for node in ast.walk(handler):
                    if not (isinstance(node, ast.keyword) and node.arg == "detail"):
                        continue
                    value = ast.unparse(node.value)
                    passes_exception_text = handler.name and re.search(rf"\b{handler.name}\b", value)
                    if passes_exception_text and caught not in self.SAFE_EXCEPTIONS:
                        problems.append(f"{path.name}:{node.value.lineno}: detail={value} inside `except {caught}`")

        assert problems == []

    def test_the_guard_flags_a_leak_when_one_is_planted(self):
        planted = "try:\n    pass\nexcept ValueError as error:\n    raise HTTPException(status_code=500, detail=str(error))\n"
        handler = next(n for n in ast.walk(ast.parse(planted)) if isinstance(n, ast.ExceptHandler))
        detail = next(n for n in ast.walk(handler) if isinstance(n, ast.keyword) and n.arg == "detail")

        assert handler.name in ast.unparse(detail.value)
        assert ast.unparse(handler.type) not in self.SAFE_EXCEPTIONS
