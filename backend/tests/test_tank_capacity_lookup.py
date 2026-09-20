# Tests the auto-data.net tank capacity lookup (real spec-sheet source for
# Car Onboarding's autofill): brand -> model -> generation (by year) ->
# trim page navigation, main-generation preference, most-common-value
# selection across trims, unit/range handling, and every failure path
# returning None without raising or caching a transient failure. The site
# is mocked with small HTML fixtures shaped like the real pages — these
# never hit the network.

from datetime import datetime

import pytest

from app.services import tank_capacity_lookup as lookup


def _links(*items):
    """Builds <a> tags from (href, text) pairs."""
    return "".join(f'<a href="{href}">{text}</a>' for href, text in items)


def _trim_page(tank):
    """A trim page; tank=None mimics a row the site hides behind a login."""
    row = f"<tr><td>Fuel tank capacity</td><td>{tank} l<br>16.9 US gal</td></tr>" if tank else (
        "<tr><td>Fuel tank capacity</td><td>Log in to see.</td></tr>"
    )
    return f"<html><body><table><tr><td>Kerb Weight</td><td>1579 kg</td></tr>{row}</table></body></html>"


CAMRY_MODEL = "/en/toyota-camry-model-476"
GEN_XV50F = "/en/toyota-camry-vii-xv50-facelift-2014-generation-4697"
GEN_XV70 = "/en/toyota-camry-viii-xv70-generation-5811"
GEN_XV80 = "/en/toyota-camry-ix-xv80-generation-9999"
GEN_SOLARA = "/en/toyota-camry-solara-ii-facelift-2006-generation-5818"


def _site(overrides=None):
    """A fake auto-data.net: {path: html}."""
    pages = {
        "/en/allbrands": _links(
            ("/en/toyota-brand-40", "Toyota"),
            ("/en/mercedes-benz-brand-3", "Mercedes-Benz"),
            ("/en/honda-brand-9", "Honda"),
        ),
        "/en/toyota-brand-40": _links(
            (CAMRY_MODEL, "Camry"),
            ("/en/toyota-corolla-model-407", "Corolla"),
            ("/en/toyota-land-cruiser-prado-model-500", "Land Cruiser Prado"),
        ),
        "/en/mercedes-benz-brand-3": _links(("/en/mercedes-benz-c-class-model-77", "C-Class")),
        CAMRY_MODEL: (
            # Each generation appears twice, like the real page: a name
            # link and an info link that starts with the production years.
            _links(
                (GEN_XV80, "Toyota Camry IX (XV80)"),
                (GEN_XV80, "2023 - Sedan Power: from 173 to 232 Hp"),
                (GEN_XV70, "Toyota Camry VIII (XV70)"),
                (GEN_XV70, "2017 - 2020 Sedan Power: from 150 to 301 Hp"),
                (GEN_XV50F, "Toyota Camry VII (XV50, facelift 2014)"),
                (GEN_XV50F, "2014 - 2017 Sedan Power: from 150 to 268 Hp"),
                (GEN_SOLARA, "Toyota Camry Solara II (facelift 2006)"),
                (GEN_SOLARA, "2006 - 2008 Coupe Power: from 155 to 210 Hp"),
            )
        ),
        GEN_XV50F: _links(
            ("/en/toyota-camry-vii-xv50-facelift-2014-3.5-v6-268hp-automatic-31144", "3.5 V6"),
            ("/en/toyota-camry-vii-xv50-facelift-2014-2.5-181hp-automatic-22779", "2.5"),
            ("/en/toyota-camry-vii-xv50-facelift-2014-2.0-150hp-automatic-22777", "2.0"),
            # Not trims: must be ignored.
            (GEN_XV70, "next generation"),
            ("/en/allbrands", "brands"),
        ),
        "/en/toyota-camry-vii-xv50-facelift-2014-3.5-v6-268hp-automatic-31144": _trim_page(64),
        "/en/toyota-camry-vii-xv50-facelift-2014-2.5-181hp-automatic-22779": _trim_page(64),
        "/en/toyota-camry-vii-xv50-facelift-2014-2.0-150hp-automatic-22777": _trim_page(70),
    }
    pages.update(overrides or {})
    return pages


@pytest.fixture(autouse=True)
def fake_site(monkeypatch):
    """Point the module at a fake site with fresh caches for every test;
    the fetched paths are recorded on `fake_site.calls`."""
    lookup._cache.clear()
    monkeypatch.setattr(lookup, "_brand_links", None)
    state = {"pages": _site(), "calls": [], "fail": set()}

    def fake_get(path):
        state["calls"].append(path)
        if path in state["fail"] or path not in state["pages"]:
            raise lookup._FetchFailed()
        return state["pages"][path]

    monkeypatch.setattr(lookup, "_get", fake_get)
    return state


def test_returns_the_tank_capacity_for_a_make_model_year(fake_site):
    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) == 64.0


def test_uses_the_most_common_value_across_the_sampled_trims(fake_site):
    # Two trims say 64 L, one says 70 L.
    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) == 64.0


def test_matches_make_and_model_names_loosely(fake_site):
    assert lookup.lookup_tank_capacity("  TOYOTA ", "camry", 2016) == 64.0
    # "Prado" typed for "Land Cruiser Prado" is a starts-with match only in
    # one direction, so a longer typed name than the site's must not match.
    assert lookup._pick_by_name({"camry": "/x"}, "camry xle") is None


def test_make_with_a_hyphen_matches(fake_site):
    fake_site["pages"].update(
        {
            "/en/mercedes-benz-c-class-model-77": _links(
                ("/en/mercedes-benz-c-class-w203-generation-1", "Mercedes-Benz C-Class (W203)"),
                ("/en/mercedes-benz-c-class-w203-generation-1", "2000 - 2007 Sedan"),
            ),
        }
    )
    # No trims are wired for that generation, so nothing is found — but it
    # must get as far as the generation page for the hyphenated make.
    assert lookup.lookup_tank_capacity("Mercedes Benz", "C-Class", 2005) is None
    assert "/en/mercedes-benz-c-class-model-77" in fake_site["calls"]


def test_a_year_outside_every_generation_finds_nothing(fake_site):
    assert lookup.lookup_tank_capacity("Toyota", "Camry", 1975) is None


def test_an_open_ended_generation_covers_this_year_and_next(fake_site):
    fake_site["pages"].update(
        {
            GEN_XV80: _links(("/en/toyota-camry-ix-xv80-2.5-hybrid-1", "2.5 hybrid")),
            "/en/toyota-camry-ix-xv80-2.5-hybrid-1": _trim_page(50),
        }
    )
    this_year = datetime.now().year

    assert lookup.lookup_tank_capacity("Toyota", "Camry", this_year) == 50.0
    assert lookup.lookup_tank_capacity("Toyota", "Camry", this_year + 1) == 50.0


def test_prefers_main_generations_over_body_or_market_spin_offs(fake_site):
    # A wagon spin-off overlapping the same years with a different tank
    # must not be mixed in with the main sedan generation.
    spin_off = "/en/toyota-camry-fielder-xi-generation-7047"
    fake_site["pages"][CAMRY_MODEL] += _links(
        (spin_off, "Toyota Camry Fielder XI"),
        (spin_off, "2012 - 2016 Station wagon (estate) Power: from 103 to 140 Hp"),
    )
    fake_site["pages"][spin_off] = _links(("/en/toyota-camry-fielder-xi-1.8-1", "1.8"))
    fake_site["pages"]["/en/toyota-camry-fielder-xi-1.8-1"] = _trim_page(42)

    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2015) == 64.0


def test_falls_back_to_a_spin_off_generation_when_there_is_no_main_one(fake_site):
    fake_site["pages"][CAMRY_MODEL] = _links(
        (GEN_SOLARA, "Toyota Camry Solara II (facelift 2006)"),
        (GEN_SOLARA, "2006 - 2008 Coupe Power: from 155 to 210 Hp"),
    )
    fake_site["pages"][GEN_SOLARA] = _links(("/en/toyota-camry-solara-ii-facelift-2006-3.3-1", "3.3"))
    fake_site["pages"]["/en/toyota-camry-solara-ii-facelift-2006-3.3-1"] = _trim_page(70)

    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2007) == 70.0


def test_skips_trims_that_hide_the_value_but_uses_the_others(fake_site):
    fake_site["pages"][
        "/en/toyota-camry-vii-xv50-facelift-2014-3.5-v6-268hp-automatic-31144"
    ] = _trim_page(None)
    fake_site["pages"][
        "/en/toyota-camry-vii-xv50-facelift-2014-2.5-181hp-automatic-22779"
    ] = _trim_page(None)

    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) == 70.0


def test_returns_none_when_no_trim_publishes_a_tank_capacity(fake_site):
    for path in list(fake_site["pages"]):
        if "automatic-" in path or "150hp" in path:
            fake_site["pages"][path] = _trim_page(None)

    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) is None


@pytest.mark.parametrize("bad", [430, 3])
def test_drops_a_value_outside_the_5_to_200_litre_range(fake_site, bad):
    for path in list(fake_site["pages"]):
        if "automatic-" in path or "150hp" in path:
            fake_site["pages"][path] = _trim_page(bad)

    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) is None


@pytest.mark.parametrize(
    "make, model",
    [("Asdf", "Qwerty"), ("Toyota", "Nonexistent"), ("", "Camry"), ("Toyota", "")],
)
def test_unknown_or_blank_make_or_model_returns_none(fake_site, make, model):
    assert lookup.lookup_tank_capacity(make, model, 2016) is None


def test_a_page_that_fails_to_load_returns_none_without_raising(fake_site):
    fake_site["fail"].add(CAMRY_MODEL)

    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) is None


def test_a_transient_failure_is_not_cached_so_the_next_call_can_succeed(fake_site):
    fake_site["fail"].add("/en/allbrands")
    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) is None

    fake_site["fail"].clear()
    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) == 64.0


def test_results_are_cached_including_not_found(fake_site):
    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) == 64.0
    calls_after_first = len(fake_site["calls"])
    assert lookup.lookup_tank_capacity("toyota", "CAMRY", 2016) == 64.0
    assert len(fake_site["calls"]) == calls_after_first

    assert lookup.lookup_tank_capacity("Toyota", "Nonexistent", 2016) is None
    calls_after_miss = len(fake_site["calls"])
    assert lookup.lookup_tank_capacity("Toyota", "Nonexistent", 2016) is None
    assert len(fake_site["calls"]) == calls_after_miss


def test_garbage_html_never_raises(fake_site):
    fake_site["pages"]["/en/allbrands"] = "<<<not html at all"
    fake_site["pages"][CAMRY_MODEL] = None  # would blow up parsing if reached

    assert lookup.lookup_tank_capacity("Toyota", "Camry", 2016) is None


def test_parse_tank_liters_reads_the_row_and_handles_comma_decimals():
    assert lookup._parse_tank_liters(_trim_page(64)) == 64.0
    assert lookup._parse_tank_liters(_trim_page("47,5")) == 47.5
    assert lookup._parse_tank_liters("<p>no such row</p>") is None
