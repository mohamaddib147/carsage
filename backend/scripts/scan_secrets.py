"""
CAR-25 secret scanner: looks for leaked credentials in the working tree AND in
the whole git history (every branch, plus unreachable objects such as commits
dropped by a reset). Run it before a deployment and before merging a sprint:

    cd backend
    .venv/Scripts/python scripts/scan_secrets.py

It looks for two things:
  1. the literal secret VALUES from your local backend/.env and frontend/.env
     (so a key pasted into any file, in any commit, is caught even if it does not
     look like a known key format), and
  2. well-known credential FORMATS (Google, Groq, OpenAI-style keys, JWTs,
     database connection strings, private keys, ...), which needs no .env at all
     and is what the automated test (tests/test_no_secrets.py) uses.

It also checks that .env files were never committed and are git-ignored.
Secret values are NEVER printed — findings show only a masked label and where.
Exit code: 0 clean, 1 a finding, 2 the scanner's own self-test failed (a scanner
that cannot find a planted secret proves nothing, so it refuses to report).
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# Credential formats. Each is (name, compiled bytes regex).
PATTERNS: dict[str, re.Pattern[bytes]] = {
    "Google API key (AIza...)": re.compile(rb"AIza[0-9A-Za-z_\-]{35}"),
    "Groq key (gsk_...)": re.compile(rb"gsk_[0-9A-Za-z]{20,}"),
    "OpenAI-style key (sk-...)": re.compile(rb"\bsk-[0-9A-Za-z_\-]{20,}"),
    "JWT (Supabase keys are JWTs)": re.compile(
        rb"eyJ[0-9A-Za-z_\-]{10,}\.eyJ[0-9A-Za-z_\-]{10,}\.[0-9A-Za-z_\-]{10,}"
    ),
    "Supabase sb_secret_/sb_publishable_ key": re.compile(rb"sb_(secret|publishable)_[0-9A-Za-z_\-]{10,}"),
    "Database connection string with a password": re.compile(rb"postgres(ql)?://[^\s'\"<>]*:[^\s'\"<>@]+@"),
    "Private key block": re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "AWS access key id": re.compile(rb"AKIA[0-9A-Z]{16}"),
    "GitHub token": re.compile(rb"gh[pousr]_[0-9A-Za-z]{30,}"),
    "A long literal assigned to a secret-like name": re.compile(
        rb"(?i)(api[_-]?key|secret|password|passwd|token|service[_-]?key)\s*[:=]\s*['\"][A-Za-z0-9_\-\.\/+]{20,}['\"]"
    ),
}

# Planted samples, assembled at run time so this file itself never contains a
# string the scanner would flag. Every pattern must match its own sample.
_SAMPLES: dict[str, bytes] = {
    "Google API key (AIza...)": b"AI" + b"za" + b"A" * 35,
    "Groq key (gsk_...)": b"gs" + b"k_" + b"a" * 30,
    "OpenAI-style key (sk-...)": b"s" + b"k-" + b"a" * 30,
    "JWT (Supabase keys are JWTs)": b"ey" + b"J" + b"a" * 12 + b".ey" + b"J" + b"b" * 12 + b"." + b"c" * 12,
    "Supabase sb_secret_/sb_publishable_ key": b"sb_" + b"secret_" + b"a" * 20,
    "Database connection string with a password": b"post" + b"gres://user:pass" + b"word@host/db",
    "Private key block": b"-----BEGIN " + b"RSA PRIVATE KEY-----",
    "AWS access key id": b"AK" + b"IA" + b"A" * 16,
    "GitHub token": b"gh" + b"p_" + b"a" * 36,
    "A long literal assigned to a secret-like name": b'api_' + b'key = "' + b"a" * 24 + b'"',
}

# Files that are not text; skipped by the tree/history scan.
_BINARY_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".woff", ".woff2", ".ttf", ".zip"}

# A path that is an environment file: .env, .env.local, backend/.env.production ...
_ENV_FILE = re.compile(r"(^|/)\.env(\.[^/]+)?$")
_ENV_TEMPLATE = re.compile(r"(^|/)\.env\.(example|sample|template)$")


def is_secret_env_file(path: str) -> bool:
    """True for a real env file (.env, .env.local ...); False for a template such as .env.example."""
    return bool(_ENV_FILE.search(path)) and not _ENV_TEMPLATE.search(path)


def _git(*args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=REPO, capture_output=True, check=False).stdout


def in_git_repo() -> bool:
    """True if `git` is installed and REPO is inside a repository."""
    try:
        return _git("rev-parse", "--is-inside-work-tree").strip() == b"true"
    except OSError:
        return False


def self_test() -> list[str]:
    """Names of patterns that FAILED to match their own planted sample (empty = healthy)."""
    return [name for name, rx in PATTERNS.items() if not rx.search(_SAMPLES[name])]


def load_env_values() -> dict[bytes, str]:
    """Secret values from the local .env files -> masked label. URLs are skipped (not secret)."""
    values: dict[bytes, str] = {}
    for relative in ("backend/.env", "frontend/.env"):
        path = REPO / relative
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            value = value.strip().strip('"').strip("'")
            if len(value) >= 12 and "://" not in value:
                values[value.encode()] = f"{relative}:{name}"
    return values


def _matches(data: bytes, values: dict[bytes, str]) -> list[str]:
    """What a piece of content contains: a secret's label, or a format name."""
    found = [f"the value of {label}" for value, label in values.items() if value in data]
    found += [name for name, rx in PATTERNS.items() if rx.search(data)]
    return found


def _is_binary_path(path: str) -> bool:
    return Path(path).suffix.lower() in _BINARY_SUFFIXES


def scan_working_tree(values: dict[bytes, str] | None = None) -> list[tuple[str, str]]:
    """(what, path) for every file git would commit (tracked or untracked-not-ignored)."""
    values = values or {}
    listing = _git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode("utf-8", "replace")
    findings = []
    for relative in filter(None, listing.split("\0")):
        path = REPO / relative
        if not path.is_file() or _is_binary_path(relative):
            continue
        for what in _matches(path.read_bytes(), values):
            findings.append((what, relative))
    return findings


def scan_history(values: dict[bytes, str] | None = None) -> tuple[int, list[tuple[str, str]]]:
    """(objects scanned, findings) across EVERY object in the repository:
    all branches, tags, reflog-only and unreachable commits/blobs."""
    values = values or {}
    # sha -> a path it was seen at, for readable findings (unreachable objects have none).
    paths: dict[str, str] = {}
    for line in _git("rev-list", "--all", "--objects").decode("utf-8", "replace").splitlines():
        sha, _, path = line.partition(" ")
        paths.setdefault(sha, path)

    findings: list[tuple[str, str]] = []
    scanned = 0
    process = subprocess.Popen(
        ["git", "cat-file", "--batch-all-objects", "--batch"], cwd=REPO, stdout=subprocess.PIPE
    )
    assert process.stdout is not None
    while True:
        header = process.stdout.readline()
        if not header:
            break
        sha, kind, size = header.decode().split()
        data = process.stdout.read(int(size))
        process.stdout.read(1)  # the newline git prints after each object
        if kind not in ("blob", "commit", "tag"):
            continue
        path = paths.get(sha, "<unreachable object>")
        if _is_binary_path(path):
            continue
        scanned += 1
        for what in _matches(data, values):
            findings.append((what, f"{path} (object {sha[:8]})"))
    process.wait()
    return scanned, findings


def env_file_problems() -> list[str]:
    """Ways an environment file could have been exposed: tracked, ever committed, or not ignored."""
    problems = []
    tracked = _git("ls-files", "-z").decode("utf-8", "replace").split("\0")
    problems += [f"tracked by git: {p}" for p in tracked if p and is_secret_env_file(p)]

    ever = _git("log", "--all", "--name-only", "--pretty=format:").decode("utf-8", "replace").splitlines()
    problems += [f"in the history: {p}" for p in sorted(set(ever)) if p and is_secret_env_file(p)]

    for relative in ("backend/.env", "frontend/.env"):
        if (REPO / relative).exists():
            ignored = subprocess.run(["git", "check-ignore", "-q", relative], cwd=REPO).returncode == 0
            if not ignored:
                problems.append(f"exists but is NOT git-ignored: {relative}")
    return problems


def main() -> int:
    """Runs every check and prints a report; returns the process exit code."""
    broken = self_test()
    if broken:
        print("SELF-TEST FAILED — these patterns cannot find their own planted sample:")
        for name in broken:
            print("  ", name)
        return 2
    print(f"Self-test: all {len(PATTERNS)} credential patterns find their planted sample.")

    values = load_env_values()
    print(f"Looking for {len(values)} secret value(s) from local .env files:")
    for value, label in values.items():
        print(f"   {label}  (length {len(value)})")
    if not values:
        print("   (none - only credential FORMATS will be checked)")

    problems = env_file_problems()
    tree = scan_working_tree(values)
    scanned, history = scan_history(values)

    print(f"\nScanned {scanned} git objects (all branches + unreachable) and the working tree.\n")
    failed = False
    for title, items in (
        ("Environment files", problems),
        ("Working tree", [f"{what}  ->  {where}" for what, where in tree]),
        ("Git history", sorted({f"{what}  ->  {where}" for what, where in history})),
    ):
        if items:
            failed = True
            print(f"{title}: FINDINGS")
            for item in items:
                print("   ", item)
        else:
            print(f"{title}: clean")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
