# Tests config loading: ALLOWED_ORIGINS parsing (normal + empty edge
# case) and that a missing required secret fails fast with a clear
# message instead of the app silently starting half-configured.
#
# Each test loads app/config.py as a standalone module (rather than
# reloading the already-imported app.config) so it never disturbs the
# singleton app.config/app.supabase_client used by the rest of the app.
# dotenv.load_dotenv is stubbed out because python-dotenv's default search
# walks up from config.py's own file location (not cwd), so it would
# otherwise find the real backend/.env and silently refill whatever
# variable a test just deleted.

import importlib.util
from pathlib import Path

import pytest

CONFIG_PATH = Path(__file__).resolve().parent.parent / "app" / "config.py"


def _load_config_module(monkeypatch):
    monkeypatch.setattr("dotenv.load_dotenv", lambda *args, **kwargs: False)
    spec = importlib.util.spec_from_file_location("app_config_under_test", CONFIG_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_allowed_origins_parses_comma_separated_list(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-key")
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:5173, https://carsage.example.com")

    module = _load_config_module(monkeypatch)

    assert module.ALLOWED_ORIGINS == [
        "http://localhost:5173",
        "https://carsage.example.com",
    ]


def test_allowed_origins_is_empty_list_when_unset(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-key")
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)

    module = _load_config_module(monkeypatch)

    assert module.ALLOWED_ORIGINS == []


def test_missing_required_secret_raises_a_clear_error(monkeypatch):
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-key")
    monkeypatch.delenv("SUPABASE_URL", raising=False)

    with pytest.raises(RuntimeError, match="SUPABASE_URL"):
        _load_config_module(monkeypatch)


def test_missing_google_maps_key_raises_a_clear_error(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setenv("SUPABASE_SERVICE_KEY", "test-key")
    monkeypatch.delenv("GOOGLE_MAPS_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="GOOGLE_MAPS_API_KEY"):
        _load_config_module(monkeypatch)
