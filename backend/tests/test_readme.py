# Keeps the root README.md honest (CAR-26). A README goes stale silently, so these
# tests compare what it says with the code and files it describes: it has every
# section the acceptance criteria require, it lists every environment variable
# the code reads (and no stale ones), every database migration in run order,
# every API route, and every file path and npm script it mentions really exists.
# It reads files only; nothing here needs a network or a real key.

import json
import re
from pathlib import Path

import pytest

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
README = (ROOT / "README.md").read_text(encoding="utf-8")
BACKTICKED = set(re.findall(r"`([^`\n]+)`", README))


def _env_names(path: Path) -> set[str]:
    """Variable names defined in a .env.example file."""
    return set(re.findall(r"^([A-Z][A-Z0-9_]*)=", path.read_text(encoding="utf-8"), re.MULTILINE))


def test_the_readme_has_every_section_the_task_requires():
    headings = " | ".join(re.findall(r"^## (.+)$", README, re.MULTILINE)).lower()

    for required in (
        "overview",
        "main features",
        "technologies used",
        "install and run",
        "environment variables",
        "database setup",
        "how to use",
        "deployment",
    ):
        assert required in headings, f"README is missing a '{required}' section"


def test_the_main_features_are_all_described():
    for feature in ("Car Onboarding", "Car Profile", "Trip Planner", "AI Advisor", "Fuel Log"):
        assert README.count(feature) >= 2, f"{feature} should be introduced and explained"


def test_the_required_technologies_are_named():
    for technology in ("React", "Supabase", "FastAPI", "Google Maps", "Gemini", "Groq"):
        assert technology in README


class TestEnvironmentVariables:
    backend_example = _env_names(ROOT / "backend" / ".env.example")
    frontend_example = _env_names(ROOT / "frontend" / ".env.example")

    def test_it_found_the_example_files(self):
        assert {"SUPABASE_URL", "SUPABASE_SERVICE_KEY"} <= self.backend_example
        assert {"VITE_SUPABASE_URL", "VITE_API_BASE_URL"} <= self.frontend_example

    @pytest.mark.parametrize("name", sorted(backend_example | frontend_example))
    def test_every_example_variable_is_listed_in_the_readme(self, name):
        assert name in BACKTICKED, f"{name} is in a .env.example but not documented in the README"

    def test_the_backend_example_lists_exactly_what_the_code_reads(self):
        config = (ROOT / "backend" / "app" / "config.py").read_text(encoding="utf-8")
        read_by_code = set(re.findall(r'_require_env\("([A-Z0-9_]+)"\)', config)) | set(
            re.findall(r'os\.environ\.get\("([A-Z0-9_]+)"', config)
        )

        assert read_by_code == self.backend_example

    def test_the_frontend_example_lists_exactly_what_the_code_reads(self):
        used = set()
        for path in (ROOT / "frontend" / "src").rglob("*.js*"):
            if ".test." not in path.name:
                used |= set(re.findall(r"import\.meta\.env\.(VITE_[A-Z0-9_]+)", path.read_text(encoding="utf-8")))

        assert used == self.frontend_example

    def test_no_real_value_is_written_next_to_a_variable_name(self):
        # `NAME=something` in the README would be a value; only names are allowed.
        for name in self.backend_example | self.frontend_example:
            assert not re.search(rf"\b{name}\s*=\s*\S", README), f"README shows a value for {name}"


class TestDatabaseSetup:
    migrations = sorted(p.name for p in (ROOT / "docs" / "db_migrations").glob("*.sql"))

    def test_it_found_the_migrations(self):
        assert len(self.migrations) >= 14

    def test_every_migration_is_listed_in_run_order(self):
        positions = []
        for name in self.migrations:
            assert README.count(name) == 1, f"{name} must appear exactly once in the README table"
            positions.append(README.index(name))

        assert positions == sorted(positions), "migrations must be listed in the order they must be run"

    def test_every_table_is_named(self):
        for table in ("profiles", "cars", "trips", "advisor_conversations", "advisor_messages", "fuel_prices", "fuel_logs"):
            assert f"`{table}`" in README

    def test_the_exported_migrations_say_where_they_came_from(self):
        # Files 1-11 are verbatim exports; the header records the applied version.
        for path in (ROOT / "docs" / "db_migrations").glob("2026-09-1*.sql"):
            assert re.search(r"version \d{14},", path.read_text(encoding="utf-8")), path.name


def test_every_api_route_is_documented_and_no_removed_route_is_still_listed():
    published = {
        f"{method.upper()} {path}"
        for path, operations in app.openapi()["paths"].items()
        for method in operations
    }
    documented = set(re.findall(r"`((?:GET|POST|PUT|PATCH|DELETE) /[^`\s]*)`", README))

    assert published == documented


def test_every_file_the_readme_mentions_exists():
    file_like = re.compile(r"^(?:docs|backend|frontend)/[\w./-]+\.(?:py|sql|md|pdf|js|jsx|json|example)$|^backend/Dockerfile$")
    mentioned = {token for token in BACKTICKED if file_like.match(token)}
    linked = {
        target.split("#")[0]
        for target in re.findall(r"\]\(([^)\s]+)\)", README)
        if not target.startswith(("http://", "https://", "#", "mailto:"))
    }

    assert mentioned, "expected the README to mention some files"
    missing = sorted(p for p in (mentioned | linked) if p and not (ROOT / p).exists())
    assert missing == []


def test_every_npm_script_the_readme_tells_you_to_run_exists():
    scripts = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))["scripts"]
    named = set(re.findall(r"npm run (\w+)", README)) | set(re.findall(r"npm (test)\b", README))

    assert {"dev", "build", "test", "lint"} <= named
    assert named <= set(scripts), f"README mentions npm scripts that do not exist: {named - set(scripts)}"


def test_the_readme_lists_the_real_deployed_addresses():
    # CAR-28: the app is deployed. Guards that the Deployment table names the
    # actual live hosts (not a placeholder, not a made-up address) for both halves.
    deployment = README.split("## Deployment", 1)[1].split("\n## ", 1)[0]

    assert "not deployed yet" not in deployment
    assert "https://carsage.netlify.app" in deployment
    assert "https://carsage-cp21.onrender.com" in deployment


def test_the_readme_contains_no_secret_looking_value():
    # The full secret scan (scripts/scan_secrets.py, test_no_secrets.py) covers every
    # tracked file; this is a direct check that the README never shows a key.
    assert not re.search(r"AIza[0-9A-Za-z_\-]{35}|eyJ[0-9A-Za-z_\-]{10,}\.eyJ|gsk_[0-9A-Za-z]{20,}|sk-[0-9A-Za-z]{20,}", README)
