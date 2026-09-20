# Looks up a car's real factory fuel tank capacity (liters) from
# auto-data.net for Car Onboarding's autofill. None of the other spec
# sources we use (API Ninjas free tier, NHTSA vPIC, fueleconomy.gov) has a
# tank field, and an AI guess isn't accurate enough, so this reads the
# published spec sheet instead.
#
# Scraping approach (documented because it WILL break if the site's
# markup changes; every step degrades to "not found" -> None, and the
# caller falls back to the clearly-flagged AI estimate):
#   1. /en/allbrands lists every make as <a href="/en/<slug>-brand-<id>">.
#      Match the make by its slug (letters/digits only, so "Mercedes-Benz"
#      == "mercedes-benz").
#   2. The brand page lists models as <a href="/en/<slug>-model-<id>">
#      with the model name as text. Match by name: exact first, else the
#      shortest model whose name starts with what the user typed.
#   3. The model page lists generations, each an <a href="...-generation-
#      <id>"> whose text starts with its production years ("2014 - 2017",
#      or "2023 -" while still in production). Pick the generation(s)
#      whose years contain the car's model year, preferring the main
#      generations — those named "<model> <generation number>", e.g.
#      "Corolla XI (E170)" — over body/market spin-offs ("Corolla Fielder
#      XI" wagon, "Corolla Touring Sports"), which have different tanks.
#   4. A generation page links its trims (engine/gearbox variants); each
#      trim page has a "Fuel tank capacity" row like "64 l". We sample a
#      few trims and use the most common value (the user's exact trim is
#      unknown, and they can always edit the result).
# Results (including "not found") are cached in memory so repeat lookups
# don't hit the site again. The requests are few, sequential except for
# the parallel trim fetches, and sent with a plain browser User-Agent.

import re
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

import httpx
from bs4 import BeautifulSoup

BASE_URL = "https://www.auto-data.net"
REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en",
}
REQUEST_TIMEOUT = 8.0
MAX_GENERATIONS = 2
MAX_TRIMS_PER_GENERATION = 4

# Same realistic range as the frontend (lib/tankCapacity.js), the
# cars.fuel_tank_capacity_liters CHECK, and the LLM estimate.
MIN_TANK_LITERS = 5
MAX_TANK_LITERS = 200

_YEAR_RANGE = re.compile(r"^\s*(\d{4})\s*-\s*(\d{4})?")
_TANK_ROW = re.compile(r"Fuel tank capacity\s*([\d.,]+)\s*l\b", re.I)

_cache: dict[tuple[str, str, int], float | None] = {}
_brand_links: dict[str, str] | None = None


def _normalize(text: str) -> str:
    """Lowercases and strips everything but letters and digits, so
    "Mercedes-Benz" == "mercedes benz" == "MercedesBenz"."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


class _FetchFailed(Exception):
    """A page couldn't be fetched (network error or HTTP error). Kept
    distinct from "the car isn't listed" so a transient failure is never
    cached as a permanent not-found."""


def _get(path_or_url: str) -> str:
    """GETs a page (path relative to the site, or a full URL); returns
    its HTML, raises _FetchFailed on any network/HTTP failure."""
    url = path_or_url if path_or_url.startswith("http") else BASE_URL + path_or_url
    try:
        response = httpx.get(
            url, headers=REQUEST_HEADERS, timeout=REQUEST_TIMEOUT, follow_redirects=True
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise _FetchFailed() from error
    return response.text


def _get_or_none(path: str) -> str | None:
    """Like _get, but a failed page is just None (used for the parallel
    trim fetches, where one missing trim shouldn't abort the lookup)."""
    try:
        return _get(path)
    except _FetchFailed:
        return None


def _pick_by_name(candidates: dict[str, str], wanted: str) -> str | None:
    """From {normalized name: href}, returns the href of the exact match
    for `wanted`, else of the shortest name that starts with it."""
    wanted = _normalize(wanted)
    if not wanted:
        return None
    if wanted in candidates:
        return candidates[wanted]
    starts = [name for name in candidates if name.startswith(wanted)]
    return candidates[min(starts, key=len)] if starts else None


def _find_brand_href(make: str) -> str | None:
    """Finds the brand page path for a make, reading (and remembering) the
    site's all-brands list."""
    global _brand_links
    if _brand_links is None:
        html = _get("/en/allbrands")
        links = {}
        for link in BeautifulSoup(html, "html.parser").find_all("a", href=True):
            match = re.fullmatch(r"/en/([a-z0-9-]+)-brand-\d+", link["href"])
            if match:
                links.setdefault(_normalize(match.group(1)), link["href"])
        _brand_links = links
    return _pick_by_name(_brand_links, make)


def _find_model_href(brand_html: str, model: str) -> str | None:
    """Finds the model page path for a model name on a brand page."""
    candidates = {}
    for link in BeautifulSoup(brand_html, "html.parser").find_all("a", href=True):
        if re.fullmatch(r"/en/[a-z0-9-]+-model-\d+", link["href"]):
            name = _normalize(link.get_text(" ", strip=True))
            if name:
                candidates.setdefault(name, link["href"])
    return _pick_by_name(candidates, model)


def _find_generation_hrefs(model_html: str, year: int, model_href: str) -> list[str]:
    """Generation page paths (newest first, as listed) whose production
    years contain `year`. An open-ended range ("2023 -") runs to next year.
    Main generations (slug = <model>-<roman numeral>-...) are preferred;
    if there are none, any matching generation is used."""
    open_ended_until = datetime.now().year + 1
    model_prefix = model_href.rsplit("-model-", 1)[0]
    main_generation = re.compile(re.escape(model_prefix) + r"-[ivx]+-")
    found = []
    for link in BeautifulSoup(model_html, "html.parser").find_all("a", href=True):
        if not re.fullmatch(r"/en/[a-z0-9-]+-generation-\d+", link["href"]):
            continue
        match = _YEAR_RANGE.match(link.get_text(" ", strip=True))
        if not match:
            continue
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else open_ended_until
        if start <= year <= end and link["href"] not in found:
            found.append(link["href"])
    main = [href for href in found if main_generation.match(href)]
    return (main or found)[:MAX_GENERATIONS]


def _find_trim_hrefs(generation_html: str, generation_href: str) -> list[str]:
    """Trim page paths linked from a generation page — hrefs that share
    the generation's slug prefix but aren't generation/model/brand pages."""
    prefix = generation_href.rsplit("-generation-", 1)[0] + "-"
    found = []
    for link in BeautifulSoup(generation_html, "html.parser").find_all("a", href=True):
        href = link["href"]
        if (
            href.startswith(prefix)
            and re.fullmatch(r"/en/[a-z0-9.\-]+-\d+", href)
            and not re.search(r"-(generation|model|brand)-\d+$", href)
            and href not in found
        ):
            found.append(href)
    return found[:MAX_TRIMS_PER_GENERATION]


def _parse_tank_liters(trim_html: str) -> float | None:
    """Reads the "Fuel tank capacity  64 l" row from a trim page; None if
    the row is missing (e.g. "Log in to see") or outside the 5-200 L range."""
    text = BeautifulSoup(trim_html, "html.parser").get_text(" ", strip=True)
    match = _TANK_ROW.search(text)
    if match is None:
        return None
    try:
        liters = float(match.group(1).replace(",", "."))
    except ValueError:
        return None
    return liters if MIN_TANK_LITERS <= liters <= MAX_TANK_LITERS else None


def _lookup(make: str, model: str, year: int) -> float | None:
    """Uncached lookup — see lookup_tank_capacity."""
    brand_href = _find_brand_href(make)
    if brand_href is None:
        return None
    model_href = _find_model_href(_get(brand_href), model)
    if model_href is None:
        return None
    model_html = _get(model_href)

    trim_hrefs = []
    for generation_href in _find_generation_hrefs(model_html, year, model_href):
        trim_hrefs += _find_trim_hrefs(_get(generation_href), generation_href)
    if not trim_hrefs:
        return None

    with ThreadPoolExecutor(max_workers=len(trim_hrefs)) as pool:
        pages = list(pool.map(_get_or_none, trim_hrefs))
    values = [
        liters
        for html in pages
        if html is not None and (liters := _parse_tank_liters(html)) is not None
    ]
    if not values:
        return None

    # Most common value across the sampled trims; on a tie the earliest
    # one (trims are listed in the site's own order) wins.
    counts = Counter(values)
    best = max(counts.values())
    return next(value for value in values if counts[value] == best)


def lookup_tank_capacity(make: str, model: str, year: int) -> float | None:
    """
    Looks up a car's factory fuel tank capacity in liters from auto-data.net.

    Args:
        make: Vehicle make, e.g. "Toyota".
        model: Vehicle model, e.g. "Camry".
        year: Model year.

    Returns:
        Liters (5-200), or None if the make/model/year can't be matched or
        the spec isn't published. Never raises — this is a best-effort
        autofill that must never block Car Onboarding. Results, including
        "not found", are cached for the life of the process.
    """
    key = (_normalize(make), _normalize(model), year)
    if key in _cache:
        return _cache[key]

    try:
        result = _lookup(make, model, year)
    except Exception:  # noqa: BLE001 - best effort: any surprise means "unknown"
        return None  # not cached, so a transient failure can be retried

    _cache[key] = result
    return result
