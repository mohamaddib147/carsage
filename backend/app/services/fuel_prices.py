# Scrapes Lebanon's official weekly fuel prices from the Directorate
# General of Oil (dgo.gov.lb, affiliated with the Ministry of Energy and
# Water) and caches them in the fuel_prices table, so Trip Planner never
# scrapes on every request. This is the only place that knows about that
# site's HTML structure or the LBP-per-20-liters pricing convention.
#
# Scraping approach (documented per CAR-35's requirement, since this WILL
# break if the site's markup changes):
#   - GET https://en.dgo.gov.lb/prices. Prices are server-rendered (not
#     loaded via a later JS/XHR call) inside repeating blocks:
#       <div class="counter-wrapper"> ... </div>
#     each holding a price in <span class="counter-up" data-count="N">
#     (the visible "0" text is a JS count-up animation start value — the
#     real number is the data-count attribute) and a label in
#     <div class="counter-title"><h5>...</h5></div>.
#   - The page lists one block of 4 counters per weekly date heading, in
#     a fixed order: Octane 95, Octane 98, Gaz, Diesel oil (for motor
#     vehicles) — newest date first.
#   - Some recent blocks on the live site render as "0" placeholders
#     (a site-side issue, not ours), so we walk blocks newest-first and
#     use the first one where our 3 target fuels are all non-zero.
#   - Prices are published per 20 liters (Lebanon's standard reporting
#     unit for fuel), so we divide by 20 to store LBP per liter.
#
# USD figures shown alongside LBP (e.g. on the fuel-prices endpoint) use
# a fixed LBP_PER_USD rate below rather than a live exchange-rate API —
# see the comment on that constant.

from datetime import datetime, timedelta, timezone

import httpx
from bs4 import BeautifulSoup

from app.supabase_client import supabase

FUEL_PRICES_URL = "https://en.dgo.gov.lb/prices"
LITERS_PER_PRICED_UNIT = 20
CACHE_MAX_AGE = timedelta(days=7)

# Lebanon has no stable official exchange rate; the parallel-market rate
# is what actually applies to everyday prices like fuel, and it moves
# often enough that a live-rate API would just be another point of
# failure for a capstone-scale app. Fixed by request; update this
# constant by hand if it drifts far from the real rate.
LBP_PER_USD = 89000

FUEL_TYPES = ("95_octane", "98_octane", "diesel")

_LABEL_TO_FUEL_TYPE = {
    "Octane 95": "95_octane",
    "Octane 98": "98_octane",
    "Diesel oil (for motor vehicles)": "diesel",
}


class FuelPriceError(Exception):
    """Raised when a current fuel price genuinely can't be determined —
    the scrape failed AND there's no cached price to fall back to. Its
    message is safe to show to the end user."""


def _parse_prices_from_html(html: str) -> dict[str, float] | None:
    """Returns {fuel_type: price_per_liter_lbp} from the page's most
    recent fully-populated weekly block, or None if none is found."""
    soup = BeautifulSoup(html, "html.parser")

    entries = []
    for counter in soup.select(".counter-wrapper"):
        value_el = counter.select_one(".counter-value .counter-up")
        label_el = counter.select_one(".counter-title h5")
        if value_el is None or label_el is None:
            continue
        try:
            value = float(value_el.get("data-count", "0"))
        except ValueError:
            value = 0.0
        entries.append((label_el.get_text(strip=True), value))

    # Blocks are 4 entries each (Octane 95, Octane 98, Gaz, Diesel).
    for block_start in range(0, len(entries) - 3, 4):
        block = dict(entries[block_start : block_start + 4])
        priced_per_20l = {
            fuel_type: block.get(label, 0.0)
            for label, fuel_type in _LABEL_TO_FUEL_TYPE.items()
        }
        if all(priced_per_20l[fuel_type] > 0 for fuel_type in FUEL_TYPES):
            return {
                fuel_type: round(price / LITERS_PER_PRICED_UNIT, 2)
                for fuel_type, price in priced_per_20l.items()
            }

    return None


def scrape_fuel_prices() -> dict[str, float]:
    """
    Fetches and parses the current fuel prices from dgo.gov.lb.

    Returns:
        {fuel_type: price_per_liter_lbp} for "95_octane", "98_octane", "diesel".

    Raises:
        FuelPriceError: if the page can't be fetched or no fully-populated
            price block can be parsed from it.
    """
    try:
        response = httpx.get(FUEL_PRICES_URL, timeout=15.0, follow_redirects=True)
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise FuelPriceError("Could not reach the fuel price source.") from error

    prices = _parse_prices_from_html(response.text)
    if prices is None:
        raise FuelPriceError(
            "Could not find a current fuel price on the source page."
        )
    return prices


def _get_cached_prices() -> dict[str, float]:
    """Returns the most recent cached price per fuel type (only for
    types that have ever been cached — may be a partial dict)."""
    cached = {}
    for fuel_type in FUEL_TYPES:
        result = (
            supabase.table("fuel_prices")
            .select("price_per_liter_lbp, scraped_at")
            .eq("fuel_type", fuel_type)
            .order("scraped_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            cached[fuel_type] = result.data[0]
    return cached


def get_current_fuel_prices() -> dict[str, float]:
    """
    Returns the current price per liter (LBP) for each fuel type, using
    the cache if it's fresh (scraped within the last 7 days), otherwise
    scraping and re-caching. Falls back to the last cached price (of any
    age) if a fresh scrape fails.

    Returns:
        {fuel_type: price_per_liter_lbp} for "95_octane", "98_octane", "diesel".

    Raises:
        FuelPriceError: if the scrape fails and there is no cached price
            at all yet (only possible before the very first successful scrape).
    """
    cached = _get_cached_prices()
    now = datetime.now(timezone.utc)

    is_fresh = len(cached) == len(FUEL_TYPES) and all(
        now - datetime.fromisoformat(row["scraped_at"]) < CACHE_MAX_AGE
        for row in cached.values()
    )
    if is_fresh:
        return {ft: row["price_per_liter_lbp"] for ft, row in cached.items()}

    try:
        fresh_prices = scrape_fuel_prices()
    except FuelPriceError:
        if cached:
            return {ft: row["price_per_liter_lbp"] for ft, row in cached.items()}
        raise

    supabase.table("fuel_prices").insert(
        [
            {
                "fuel_type": fuel_type,
                "price_per_liter_lbp": price,
                "source_label": FUEL_PRICES_URL,
            }
            for fuel_type, price in fresh_prices.items()
        ]
    ).execute()

    return fresh_prices


def lbp_to_usd(amount_lbp: float) -> float:
    """Converts an LBP amount to USD using the fixed rate above."""
    return round(amount_lbp / LBP_PER_USD, 2)
