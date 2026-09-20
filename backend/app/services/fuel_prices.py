# Scrapes Lebanon's current fuel prices from L'Orient Today and caches
# them in the fuel_prices table, so Trip Planner never scrapes on every
# request. This is the only place that knows about that site's structure
# or the LBP-per-20-liters pricing convention.
#
# CAR-50: this used to scrape en.dgo.gov.lb/prices, which turned out to be
# serving stale (2024) data. L'Orient Today instead publishes a new dated
# article each time the Ministry of Energy and Water changes prices (often
# twice a week), citing the Ministry, in a very consistent text format.
#
# Scraping approach (documented because it WILL break if the site changes;
# every step degrades to "no result" -> the cached price is used):
#   1. There is no fixed "current prices" URL, so fetch the site's keyword
#      listing pages (KEYWORD_LISTING_URLS — /keyword/<id>-fuel-prices and
#      /keyword/<id>-gasoline; the plain /tag/... paths 404). They are
#      server-rendered, newest article first, and include unrelated news.
#   2. Collect the article links (/article/<numeric id>/<slug>.html), keep
#      those whose slug looks fuel-related, and try the newest first
#      (highest numeric id), up to MAX_ARTICLES_TO_TRY. The site rejects
#      obvious bot user agents, so a browser-like User-Agent is sent, and
#      pages are fetched with the standard library (urllib) rather than
#      httpx: the site is behind Cloudflare, which answers 403 to httpx's
#      TLS handshake even with an identical browser User-Agent but lets
#      urllib through. If that ever stops working, the failure is graceful
#      (last cached price is used) — see _fetch_text.
#   3. In an article's text, the prices appear as lines such as
#         "20 liters of 95-octane gasoline: LL 2,810,000, an increase of ..."
#         "20 liters of 98-octane gasoline: LL 2,828,000, ..."
#         "20 liters of diesel (for vehicles): LL 2,768,000, ..."
#      Regexes below pull the LL figure; the first article in which all
#      three parse (and pass a sanity range) wins, and its URL is stored as
#      the row's source_label.
#   4. The site quotes 20-liter canister totals, so divide by 20 to store
#      LBP per liter.
#
# USD figures shown alongside LBP (e.g. on the fuel-prices endpoint) use
# a fixed LBP_PER_USD rate below rather than a live exchange-rate API —
# see the comment on that constant.

import http.client
import re
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from app.supabase_client import supabase

SITE_URL = "https://today.lorientlejour.com"
KEYWORD_LISTING_URLS = (
    f"{SITE_URL}/keyword/23993-fuel-prices",
    f"{SITE_URL}/keyword/25091-gasoline",
)
MAX_ARTICLES_TO_TRY = 8
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en",
}
LITERS_PER_PRICED_UNIT = 20
CACHE_MAX_AGE = timedelta(days=7)

# Rows scraped from the retired, stale source are never treated as fresh,
# so the next request re-scrapes even if they are only a few days old.
RETIRED_SOURCE_MARKER = "dgo.gov.lb"

# Sanity range for a per-liter price in LBP. Real prices are ~1e5 today;
# this only exists to reject a mis-parsed figure (e.g. a 10x error, or a
# USD amount picked up by mistake) instead of storing it.
MIN_PLAUSIBLE_LBP_PER_LITER = 10_000
MAX_PLAUSIBLE_LBP_PER_LITER = 1_000_000

# Lebanon has no stable official exchange rate; the parallel-market rate
# is what actually applies to everyday prices like fuel, and it moves
# often enough that a live-rate API would just be another point of
# failure for a capstone-scale app. Fixed by request; update this
# constant by hand if it drifts far from the real rate.
LBP_PER_USD = 89000

FUEL_TYPES = ("95_octane", "98_octane", "diesel")

_LL = r"(?:LL|L\.L\.)\s*(\d[\d,\.]*)"
_PRICE_PATTERNS = {
    "95_octane": re.compile(
        r"20\s*liters?\s+of\s+95[-\s]?octane(?:\s+gasoline)?\s*:\s*" + _LL, re.I
    ),
    "98_octane": re.compile(
        r"20\s*liters?\s+of\s+98[-\s]?octane(?:\s+gasoline)?\s*:\s*" + _LL, re.I
    ),
    "diesel": re.compile(
        r"20\s*liters?\s+of\s+diesel(?:\s*\(for vehicles\))?\s*:\s*" + _LL, re.I
    ),
}
_ARTICLE_HREF = re.compile(r"/article/(\d+)/([a-z0-9-]+)\.html", re.I)
_FUEL_SLUG_WORDS = (
    "fuel",
    "gasoline",
    "gas",
    "petrol",
    "diesel",
    "mazout",
    "price",
    "octane",
)


class FuelPriceError(Exception):
    """Raised when a current fuel price genuinely can't be determined —
    the scrape failed AND there's no cached price to fall back to. Its
    message is safe to show to the end user."""


def _fetch_text(url: str) -> str:
    """GETs a page and returns its text. Raises OSError / HTTPException on
    any network or HTTP-status failure (callers treat all of those as "this
    page isn't available")."""
    request = urllib.request.Request(url, headers=REQUEST_HEADERS)
    with urllib.request.urlopen(request, timeout=15.0) as response:
        return response.read().decode("utf-8", errors="replace")


_FETCH_ERRORS = (OSError, http.client.HTTPException)


def _article_id(url: str) -> int:
    return int(_ARTICLE_HREF.search(url).group(1))


def _find_article_urls(listing_html: str) -> list[str]:
    """Returns fuel-related article URLs from a keyword listing page,
    newest (highest article id) first, without duplicates."""
    soup = BeautifulSoup(listing_html, "html.parser")
    found: dict[int, str] = {}
    for link in soup.find_all("a", href=True):
        match = _ARTICLE_HREF.search(link["href"])
        if not match:
            continue
        article_id, slug = int(match.group(1)), match.group(2).lower()
        if any(word in slug for word in _FUEL_SLUG_WORDS):
            found.setdefault(article_id, urljoin(SITE_URL, link["href"]))
    return [found[article_id] for article_id in sorted(found, reverse=True)]


def _parse_prices_from_article(html: str) -> dict[str, float] | None:
    """Returns {fuel_type: price_per_liter_lbp} if the article states all
    three 20-liter prices and they look plausible, else None."""
    text = BeautifulSoup(html, "html.parser").get_text(" ")
    text = re.sub(r"\s+", " ", text.replace("\xa0", " "))

    prices = {}
    for fuel_type, pattern in _PRICE_PATTERNS.items():
        match = pattern.search(text)
        if match is None:
            return None
        try:
            total = float(match.group(1).replace(",", "").rstrip("."))
        except ValueError:
            return None
        per_liter = round(total / LITERS_PER_PRICED_UNIT, 2)
        if not MIN_PLAUSIBLE_LBP_PER_LITER <= per_liter <= MAX_PLAUSIBLE_LBP_PER_LITER:
            return None
        prices[fuel_type] = per_liter
    return prices


def scrape_fuel_prices() -> tuple[dict[str, float], str]:
    """
    Finds L'Orient Today's most recent fuel-price article and parses it.

    Returns:
        ({fuel_type: price_per_liter_lbp} for "95_octane", "98_octane",
        "diesel", the URL of the article the prices came from).

    Raises:
        FuelPriceError: if no listing can be fetched, or no recent article
            yields a full, plausible set of prices.
    """
    article_urls: list[str] = []
    listing_fetched = False
    for listing_url in KEYWORD_LISTING_URLS:
        try:
            listing_html = _fetch_text(listing_url)
        except _FETCH_ERRORS:
            continue
        listing_fetched = True
        for url in _find_article_urls(listing_html):
            if url not in article_urls:
                article_urls.append(url)

    if not listing_fetched:
        raise FuelPriceError("Could not reach the fuel price source.")

    # Newest first across all listings (article ids grow over time).
    article_urls.sort(key=_article_id, reverse=True)

    for url in article_urls[:MAX_ARTICLES_TO_TRY]:
        try:
            article_html = _fetch_text(url)
        except _FETCH_ERRORS:
            continue
        prices = _parse_prices_from_article(article_html)
        if prices is not None:
            return prices, url

    raise FuelPriceError("Could not find a current fuel price on the source page.")


def _get_cached_prices() -> dict[str, float]:
    """Returns the most recent cached price per fuel type (only for
    types that have ever been cached — may be a partial dict)."""
    cached = {}
    for fuel_type in FUEL_TYPES:
        result = (
            supabase.table("fuel_prices")
            .select("price_per_liter_lbp, scraped_at, source_label")
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
    the cache if it's fresh (scraped within the last 7 days, and not from
    the retired dgo.gov.lb source), otherwise scraping and re-caching.
    Falls back to the last cached price (of any age) if a fresh scrape
    fails.

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
        and RETIRED_SOURCE_MARKER not in (row.get("source_label") or "")
        for row in cached.values()
    )
    if is_fresh:
        return {ft: row["price_per_liter_lbp"] for ft, row in cached.items()}

    try:
        fresh_prices, source_url = scrape_fuel_prices()
    except FuelPriceError:
        if cached:
            return {ft: row["price_per_liter_lbp"] for ft, row in cached.items()}
        raise

    supabase.table("fuel_prices").insert(
        [
            {
                "fuel_type": fuel_type,
                "price_per_liter_lbp": price,
                "source_label": source_url,
            }
            for fuel_type, price in fresh_prices.items()
        ]
    ).execute()

    return fresh_prices


def lbp_to_usd(amount_lbp: float) -> float:
    """Converts an LBP amount to USD using the fixed rate above."""
    return round(amount_lbp / LBP_PER_USD, 2)
