# Keeps the two copies of the USD/LBP conversion rate equal (CAR-54). The app's
# screens use frontend/src/lib/currency.js; the backend has its own copy for the
# USD figures in its API replies (app/services/fuel_prices.py). Two numbers that
# should be one would make the same price read differently depending on where it
# came from, so this fails if they ever drift apart. It reads files only.

import re
from pathlib import Path

from app.services.fuel_prices import LBP_PER_USD, lbp_to_usd

FRONTEND_CURRENCY = Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "currency.js"


def _frontend_rate() -> int:
    source = FRONTEND_CURRENCY.read_text(encoding="utf-8")
    match = re.search(r"export const LBP_PER_USD = ([\d_]+);", source)
    assert match, "could not find the named LBP_PER_USD constant in frontend/src/lib/currency.js"
    return int(match.group(1).replace("_", ""))


def test_the_backend_rate_is_the_agreed_89700():
    assert LBP_PER_USD == 89700


def test_the_backend_and_frontend_use_the_same_rate():
    assert _frontend_rate() == LBP_PER_USD


def test_the_backend_converts_with_that_rate():
    assert lbp_to_usd(89700) == 1.0
    assert lbp_to_usd(2691000) == 30.0
    assert lbp_to_usd(0) == 0.0
