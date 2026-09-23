# Injection regression guard (CAR-23, AC 3): the backend must reach the
# database ONLY through the Supabase client's query builder, whose values are
# sent as parameters (filters as PostgREST query params, inserts/updates as a
# JSON body) — never through SQL built from strings. A manual audit found this
# to be true today; these tests fail if someone later adds raw SQL, a raw
# filter string, or interpolates a value into a builder call.
#
# They read the source files, so they need no network or database.

import re
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1] / "app"
SOURCES = {path: path.read_text(encoding="utf-8") for path in APP_DIR.rglob("*.py")}


def _offenders(pattern, flags=0):
    regex = re.compile(pattern, flags)
    return [
        f"{path.relative_to(APP_DIR)}:{number}: {line.strip()}"
        for path, text in SOURCES.items()
        for number, line in enumerate(text.splitlines(), start=1)
        if regex.search(line) and not line.strip().startswith("#")
    ]


def test_the_backend_source_was_found():
    assert any(path.name == "ai_advisor.py" for path in SOURCES)


def test_no_sql_driver_or_orm_is_imported():
    assert _offenders(r"^\s*(import|from)\s+(psycopg2?|asyncpg|pymysql|sqlite3|sqlalchemy|aiomysql|pg8000)\b") == []


def test_no_raw_sql_statement_is_built_from_strings():
    # A SQL keyword in an f-string / %-format / .format() / concatenation.
    assert _offenders(r"""f["'][^"']*\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP|ALTER)\b[^"']*\{""", re.IGNORECASE) == []
    assert _offenders(r"""["'][^"']*\b(SELECT\s.+\sFROM|INSERT\s+INTO|DELETE\s+FROM)\b[^"']*["']\s*(%|\+|\.format)""", re.IGNORECASE) == []


def test_the_raw_filter_and_sql_helpers_of_the_client_are_never_used():
    # .rpc() runs a stored function, .or_()/.filter()/.like()/.ilike() take raw
    # PostgREST filter strings — each is a place a value could be injected.
    assert _offenders(r"\.(rpc|or_|ilike|like|textsearch|filter)\(", re.IGNORECASE) == []


def test_every_table_name_is_a_string_literal():
    assert _offenders(r"\.table\(\s*[^\"'\s)]") == []


def test_no_value_is_interpolated_into_a_query_builder_call():
    # e.g. .eq("id", f"{x}") or .eq(f"col_{x}", ...) or .eq("id", "a" + b)
    assert _offenders(r"\.(eq|neq|gt|gte|lt|lte|in_|is_|select|order|limit|insert|update|delete|upsert)\([^)]*f[\"']") == []
    assert _offenders(r"\.(eq|neq|gt|gte|lt|lte|in_|is_)\([^)]*[\"']\s*\+") == []


def test_the_guard_actually_detects_a_violation():
    """Sanity check that the scanner isn't vacuous."""
    sample = 'cursor.execute(f"SELECT * FROM cars WHERE id = {car_id}")'
    assert re.search(r"""f["'][^"']*\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|DROP|ALTER)\b[^"']*\{""", sample, re.IGNORECASE)
    assert re.search(r"\.(rpc|or_|ilike|like|textsearch|filter)\(", 'supabase.table("cars").ilike("make", x)', re.IGNORECASE)
