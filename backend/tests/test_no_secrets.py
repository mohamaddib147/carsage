# Secret-leak regression guard (CAR-25, AC 1 and 2), built on the same scanner
# you run by hand before a deployment (scripts/scan_secrets.py). In an automated
# run there is no real .env, so this checks credential FORMATS across everything
# git would commit, that no .env file is or ever was committed, and that the
# scanner can still find a planted secret (a scanner that can't proves nothing).

import importlib.util
import subprocess
from pathlib import Path

import pytest

_SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "scan_secrets.py"
_spec = importlib.util.spec_from_file_location("scan_secrets", _SCRIPT)
scan = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(scan)

needs_git = pytest.mark.skipif(not scan.in_git_repo(), reason="not running inside a git checkout")


def test_every_credential_pattern_finds_its_own_planted_sample():
    assert scan.self_test() == []


def test_a_planted_secret_is_reported_by_name():
    planted = b'GEMINI = "' + b"AI" + b"za" + b"B" * 35 + b'"'

    assert "Google API key (AIza...)" in scan._matches(planted, {})


def test_a_planted_env_value_is_found_anywhere_even_in_an_unrecognised_format():
    value = b"totally-custom-format-secret-value-9481"

    hits = scan._matches(b"config = " + value + b" # oops", {value: "backend/.env:SOME_KEY"})

    assert hits == ["the value of backend/.env:SOME_KEY"]


def test_ordinary_code_and_placeholders_are_not_flagged():
    clean = b'GROQ_API_KEY=your_groq_api_key\nAPI_URL = "http://localhost:8000"\ntoken = get_token()\n'

    assert scan._matches(clean, {}) == []


@pytest.mark.parametrize("path", [".env", "backend/.env", "frontend/.env.local", "backend/.env.production"])
def test_real_env_files_are_recognised(path):
    assert scan.is_secret_env_file(path) is True


@pytest.mark.parametrize("path", ["backend/.env.example", ".env.sample", "docs/env.md", "src/environment.js"])
def test_templates_and_lookalikes_are_not_mistaken_for_env_files(path):
    assert scan.is_secret_env_file(path) is False


@needs_git
def test_no_env_file_is_tracked_was_ever_committed_or_is_left_unignored():
    assert scan.env_file_problems() == []


@needs_git
def test_no_credential_format_appears_in_any_file_git_would_commit():
    assert scan.scan_working_tree() == []


@needs_git
@pytest.mark.parametrize(
    "path",
    [
        ".env",
        "backend/.env",
        "frontend/.env.local",
        "frontend/.env.production",  # Vite loads one file per mode; these were once NOT ignored
        "frontend/.env.staging",
        "backend/.env.development",
        "deploy/server.pem",
        "deploy/signing.key",
    ],
)
def test_git_ignores_every_kind_of_env_and_key_file(path):
    ignored = subprocess.run(["git", "check-ignore", "-q", path], cwd=scan.REPO).returncode == 0

    assert ignored, f"{path} is not git-ignored"


@needs_git
@pytest.mark.parametrize("path", ["backend/.env.example", "frontend/.env.example"])
def test_the_placeholder_templates_stay_committable(path):
    ignored = subprocess.run(["git", "check-ignore", "-q", path], cwd=scan.REPO).returncode == 0

    assert not ignored, f"{path} must stay tracked so new developers know which variables to set"
