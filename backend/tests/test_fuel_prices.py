# Tests the Lebanon fuel price scraper/cache (CAR-50, L'Orient Today source):
# finding the newest fuel-price article from a keyword listing, parsing the
# three "20 liters of X: LL Y" prices (and dividing by 20), sanity/plausibility
# rejection, trying older articles when the newest doesn't have prices, and
# every failure path; plus the cache orchestration (fresh cache used as-is,
# stale or retired-source cache triggers a re-scrape storing the article URL as
# source_label, and a failed scrape falls back to the last cached price — or
# raises if there's no cache at all yet). Network access is mocked — these
# never hit the real site.

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from app.services import fuel_prices
from app.services.fuel_prices import (
    FuelPriceError,
    _find_article_urls,
    _parse_prices_from_article,
    get_current_fuel_prices,
    lbp_to_usd,
    scrape_fuel_prices,
)


def test_lbp_to_usd_converts_using_the_fixed_rate():
    assert lbp_to_usd(89000) == 1.0
    assert lbp_to_usd(0) == 0.0


ARTICLE_NEW = "https://today.lorientlejour.com/article/1547970/fuel-in-lebanon-mazout-price-jumps-127-in-one-week.html"
ARTICLE_OLD = "https://today.lorientlejour.com/article/1500563/fuel-prices-continue-to-rise-in-lebanon-3.html"
ARTICLE_UNRELATED = "https://today.lorientlejour.com/article/1547980/iran-war-trump-adjusts-message.html"


def _listing(*article_urls):
    links = "".join(f'<div><a href="{url}">headline</a></div>' for url in article_urls)
    return f"<html><body>{links}</body></html>"


def _article(p95="2,810,000", p98="2,828,000", diesel="2,768,000"):
    """Mirrors the real article wording, including the extra sentence that
    mentions '20 liters of diesel' without a price and the increase notes."""
    return f"""
    <html><body><article>
      <p>The Ministry of Energy and Water published new prices today:</p>
      <ul>
        <li>20 liters of 95-octane gasoline: LL {p95}, an increase of 131,000 liras
            since the last published rate last Friday</li>
        <li>20 liters of 98-octane gasoline: LL&nbsp;{p98}, also a 131,000 liras increase</li>
        <li>20 liters of diesel (for vehicles): LL {diesel}, a significant rise</li>
      </ul>
      <p>20 liters of diesel for vehicles has also crossed the symbolic $30 mark.</p>
    </article></body></html>
    """


def _fake_site(pages):
    """A _fetch_text stand-in: URL -> HTML, anything else raises like a 404."""

    def fetch(url):
        if url not in pages:
            raise OSError(f"HTTP Error 404: {url}")
        return pages[url]

    return fetch


LISTING_URL = fuel_prices.KEYWORD_LISTING_URLS[0]
SECOND_LISTING_URL = fuel_prices.KEYWORD_LISTING_URLS[1]


class TestParsing:
    def test_parses_the_three_prices_and_divides_by_20(self):
        assert _parse_prices_from_article(_article()) == {
            "95_octane": 140500.0,
            "98_octane": 141400.0,
            "diesel": 138400.0,
        }

    def test_returns_none_when_an_article_has_no_price_lines(self):
        assert _parse_prices_from_article("<p>Syria fuel price protests continue.</p>") is None

    def test_returns_none_when_one_of_the_three_prices_is_missing(self):
        html = _article().replace("20 liters of diesel (for vehicles): LL 2,768,000", "diesel n/a")
        assert _parse_prices_from_article(html) is None

    @pytest.mark.parametrize("bad_total", ["28,100", "281,000,000"])
    def test_rejects_implausible_values_instead_of_storing_them(self, bad_total):
        # ~10x / 1000x off what a real per-liter price could be.
        assert _parse_prices_from_article(_article(p95=bad_total)) is None

    def test_finds_only_fuel_related_articles_newest_first(self):
        html = _listing(ARTICLE_OLD, ARTICLE_UNRELATED, ARTICLE_NEW, ARTICLE_NEW)

        assert _find_article_urls(html) == [ARTICLE_NEW, ARTICLE_OLD]


class TestScrapeFuelPrices:
    def test_uses_the_newest_article_and_returns_its_url(self, monkeypatch):
        monkeypatch.setattr(
            fuel_prices,
            "_fetch_text",
            _fake_site(
                {
                    LISTING_URL: _listing(ARTICLE_OLD, ARTICLE_NEW),
                    SECOND_LISTING_URL: _listing(),
                    ARTICLE_NEW: _article(),
                    ARTICLE_OLD: _article("1,498,000", "1,538,000", "1,401,000"),
                }
            ),
        )

        prices, source = scrape_fuel_prices()

        assert source == ARTICLE_NEW
        assert prices["95_octane"] == 140500.0

    def test_values_are_in_line_with_known_recent_prices_not_off_by_10x(self, monkeypatch):
        # The 2024-era article from the task description (LL 1,498,000 /
        # 1,538,000 / 1,401,000 per 20L) must come out at ~70-77k LBP/L.
        monkeypatch.setattr(
            fuel_prices,
            "_fetch_text",
            _fake_site(
                {
                    LISTING_URL: _listing(ARTICLE_OLD),
                    SECOND_LISTING_URL: _listing(),
                    ARTICLE_OLD: _article("1,498,000", "1,538,000", "1,401,000"),
                }
            ),
        )

        prices, _ = scrape_fuel_prices()

        assert prices == {"95_octane": 74900.0, "98_octane": 76900.0, "diesel": 70050.0}
        assert all(50_000 < value < 200_000 for value in prices.values())

    def test_falls_through_to_an_older_article_when_the_newest_has_no_prices(
        self, monkeypatch
    ):
        monkeypatch.setattr(
            fuel_prices,
            "_fetch_text",
            _fake_site(
                {
                    LISTING_URL: _listing(ARTICLE_NEW, ARTICLE_OLD),
                    SECOND_LISTING_URL: _listing(),
                    ARTICLE_NEW: "<p>Syria fuel price hikes spark protests</p>",
                    ARTICLE_OLD: _article("1,498,000", "1,538,000", "1,401,000"),
                }
            ),
        )

        prices, source = scrape_fuel_prices()

        assert source == ARTICLE_OLD
        assert prices["95_octane"] == 74900.0

    def test_works_when_only_the_second_listing_is_reachable(self, monkeypatch):
        monkeypatch.setattr(
            fuel_prices,
            "_fetch_text",
            _fake_site({SECOND_LISTING_URL: _listing(ARTICLE_NEW), ARTICLE_NEW: _article()}),
        )

        _, source = scrape_fuel_prices()

        assert source == ARTICLE_NEW

    def test_skips_an_article_that_fails_to_load(self, monkeypatch):
        monkeypatch.setattr(
            fuel_prices,
            "_fetch_text",
            _fake_site(
                {
                    LISTING_URL: _listing(ARTICLE_NEW, ARTICLE_OLD),
                    ARTICLE_OLD: _article("1,498,000", "1,538,000", "1,401,000"),
                }
            ),
        )

        _, source = scrape_fuel_prices()

        assert source == ARTICLE_OLD

    def test_only_tries_a_bounded_number_of_articles(self, monkeypatch):
        urls = [
            f"https://today.lorientlejour.com/article/{2000000 - i}/fuel-story-{i}.html"
            for i in range(fuel_prices.MAX_ARTICLES_TO_TRY + 5)
        ]
        fetched = []

        def fetch(url):
            fetched.append(url)
            if url == LISTING_URL:
                return _listing(*urls)
            if url == SECOND_LISTING_URL:
                return _listing()
            return "<p>no prices here</p>"

        monkeypatch.setattr(fuel_prices, "_fetch_text", fetch)

        with pytest.raises(FuelPriceError, match="Could not find"):
            scrape_fuel_prices()

        article_fetches = [url for url in fetched if "/article/" in url]
        assert len(article_fetches) == fuel_prices.MAX_ARTICLES_TO_TRY

    def test_raises_clear_error_when_no_article_has_prices(self, monkeypatch):
        monkeypatch.setattr(
            fuel_prices,
            "_fetch_text",
            _fake_site(
                {
                    LISTING_URL: _listing(ARTICLE_NEW),
                    SECOND_LISTING_URL: _listing(),
                    ARTICLE_NEW: "<p>nothing useful</p>",
                }
            ),
        )

        with pytest.raises(FuelPriceError, match="Could not find"):
            scrape_fuel_prices()

    def test_raises_clear_error_on_network_failure_without_leaking_detail(
        self, monkeypatch
    ):
        def raise_network_error(url):
            raise ConnectionError("connection refused to internal-host:1234")

        monkeypatch.setattr(fuel_prices, "_fetch_text", raise_network_error)

        with pytest.raises(FuelPriceError) as excinfo:
            scrape_fuel_prices()

        assert "internal-host" not in str(excinfo.value)


def _cached_row(price, days_old, source_label=ARTICLE_NEW):
    scraped_at = (datetime.now(timezone.utc) - timedelta(days=days_old)).isoformat()
    return {
        "price_per_liter_lbp": price,
        "scraped_at": scraped_at,
        "source_label": source_label,
    }


def _mock_select_chain(row):
    """Builds a mock for supabase.table(...).select(...).eq(...).order(...).limit(...).execute()"""
    execute = MagicMock()
    execute.execute.return_value = MagicMock(data=[row] if row else [])
    limit = MagicMock(return_value=execute)
    order = MagicMock(return_value=MagicMock(limit=limit))
    eq = MagicMock(return_value=MagicMock(order=order))
    select = MagicMock(return_value=MagicMock(eq=eq))
    return select


class TestGetCurrentFuelPrices:
    def test_returns_cached_prices_without_scraping_when_cache_is_fresh(self):
        rows_by_type = {
            "95_octane": _cached_row(86950.0, days_old=1),
            "98_octane": _cached_row(88850.0, days_old=1),
            "diesel": _cached_row(73300.0, days_old=1),
        }

        def fake_table(name):
            table = MagicMock()

            def select(*args):
                fuel_type_holder = {}

                def eq(field, value):
                    fuel_type_holder["value"] = value
                    return MagicMock(
                        order=lambda *a, **k: MagicMock(
                            limit=lambda *a, **k: MagicMock(
                                execute=lambda: MagicMock(
                                    data=[rows_by_type[fuel_type_holder["value"]]]
                                )
                            )
                        )
                    )

                return MagicMock(eq=eq)

            table.select = select
            return table

        with patch("app.services.fuel_prices.supabase") as mock_supabase, patch(
            "app.services.fuel_prices.scrape_fuel_prices"
        ) as mock_scrape:
            mock_supabase.table.side_effect = fake_table

            result = get_current_fuel_prices()

        mock_scrape.assert_not_called()
        assert result == {
            "95_octane": 86950.0,
            "98_octane": 88850.0,
            "diesel": 73300.0,
        }

    def test_scrapes_and_caches_fresh_prices_when_cache_is_stale(self):
        rows_by_type = {
            "95_octane": _cached_row(1.0, days_old=30),
            "98_octane": _cached_row(1.0, days_old=30),
            "diesel": _cached_row(1.0, days_old=30),
        }
        shared_insert_mock = MagicMock(
            return_value=MagicMock(execute=MagicMock(return_value=None))
        )

        def fake_table(name):
            table = MagicMock()

            def select(*args):
                fuel_type_holder = {}

                def eq(field, value):
                    fuel_type_holder["value"] = value
                    return MagicMock(
                        order=lambda *a, **k: MagicMock(
                            limit=lambda *a, **k: MagicMock(
                                execute=lambda: MagicMock(
                                    data=[rows_by_type[fuel_type_holder["value"]]]
                                )
                            )
                        )
                    )

                return MagicMock(eq=eq)

            table.select = select
            table.insert = shared_insert_mock
            return table

        with patch("app.services.fuel_prices.supabase") as mock_supabase, patch(
            "app.services.fuel_prices.scrape_fuel_prices"
        ) as mock_scrape:
            mock_supabase.table.side_effect = fake_table
            mock_scrape.return_value = (
                {
                    "95_octane": 90000.0,
                    "98_octane": 91000.0,
                    "diesel": 75000.0,
                },
                ARTICLE_NEW,
            )

            result = get_current_fuel_prices()

        mock_scrape.assert_called_once()
        shared_insert_mock.assert_called_once()
        inserted_rows = shared_insert_mock.call_args.args[0]
        assert {row["source_label"] for row in inserted_rows} == {ARTICLE_NEW}
        assert {row["fuel_type"] for row in inserted_rows} == {
            "95_octane",
            "98_octane",
            "diesel",
        }
        assert result == {
            "95_octane": 90000.0,
            "98_octane": 91000.0,
            "diesel": 75000.0,
        }

    def test_falls_back_to_stale_cache_when_a_rescrape_fails(self):
        rows_by_type = {
            "95_octane": _cached_row(86950.0, days_old=30),
            "98_octane": _cached_row(88850.0, days_old=30),
            "diesel": _cached_row(73300.0, days_old=30),
        }

        def fake_table(name):
            table = MagicMock()

            def select(*args):
                fuel_type_holder = {}

                def eq(field, value):
                    fuel_type_holder["value"] = value
                    return MagicMock(
                        order=lambda *a, **k: MagicMock(
                            limit=lambda *a, **k: MagicMock(
                                execute=lambda: MagicMock(
                                    data=[rows_by_type[fuel_type_holder["value"]]]
                                )
                            )
                        )
                    )

                return MagicMock(eq=eq)

            table.select = select
            return table

        with patch("app.services.fuel_prices.supabase") as mock_supabase, patch(
            "app.services.fuel_prices.scrape_fuel_prices"
        ) as mock_scrape:
            mock_supabase.table.side_effect = fake_table
            mock_scrape.side_effect = FuelPriceError("site unreachable")

            result = get_current_fuel_prices()

        assert result == {
            "95_octane": 86950.0,
            "98_octane": 88850.0,
            "diesel": 73300.0,
        }

    def test_raises_when_scrape_fails_and_there_is_no_cache_at_all(self):
        def fake_table(name):
            table = MagicMock()
            table.select = MagicMock(
                return_value=MagicMock(
                    eq=lambda *a, **k: MagicMock(
                        order=lambda *a, **k: MagicMock(
                            limit=lambda *a, **k: MagicMock(
                                execute=lambda: MagicMock(data=[])
                            )
                        )
                    )
                )
            )
            return table

        with patch("app.services.fuel_prices.supabase") as mock_supabase, patch(
            "app.services.fuel_prices.scrape_fuel_prices"
        ) as mock_scrape:
            mock_supabase.table.side_effect = fake_table
            mock_scrape.side_effect = FuelPriceError("site unreachable")

            with pytest.raises(FuelPriceError):
                get_current_fuel_prices()


def _table_returning(rows_by_type, insert_mock):
    def fake_table(name):
        table = MagicMock()

        def select(*args):
            holder = {}

            def eq(field, value):
                holder["value"] = value
                return MagicMock(
                    order=lambda *a, **k: MagicMock(
                        limit=lambda *a, **k: MagicMock(
                            execute=lambda: MagicMock(data=[rows_by_type[holder["value"]]])
                        )
                    )
                )

            return MagicMock(eq=eq)

        table.select = select
        table.insert = insert_mock
        return table

    return fake_table


class TestRetiredSourceCache:
    def test_rows_from_the_retired_dgo_source_are_rescraped_even_when_recent(self):
        stale_source = "https://en.dgo.gov.lb/prices"
        rows = {
            ft: _cached_row(86950.0, days_old=1, source_label=stale_source)
            for ft in ("95_octane", "98_octane", "diesel")
        }
        insert = MagicMock(return_value=MagicMock(execute=MagicMock(return_value=None)))

        with patch("app.services.fuel_prices.supabase") as mock_supabase, patch(
            "app.services.fuel_prices.scrape_fuel_prices"
        ) as mock_scrape:
            mock_supabase.table.side_effect = _table_returning(rows, insert)
            mock_scrape.return_value = (
                {"95_octane": 140500.0, "98_octane": 141400.0, "diesel": 138400.0},
                ARTICLE_NEW,
            )

            result = get_current_fuel_prices()

        mock_scrape.assert_called_once()
        assert result["95_octane"] == 140500.0
        assert {row["source_label"] for row in insert.call_args.args[0]} == {ARTICLE_NEW}

    def test_still_falls_back_to_retired_rows_if_the_new_source_is_down(self):
        rows = {
            ft: _cached_row(86950.0, days_old=1, source_label="https://en.dgo.gov.lb/prices")
            for ft in ("95_octane", "98_octane", "diesel")
        }

        with patch("app.services.fuel_prices.supabase") as mock_supabase, patch(
            "app.services.fuel_prices.scrape_fuel_prices"
        ) as mock_scrape:
            mock_supabase.table.side_effect = _table_returning(rows, MagicMock())
            mock_scrape.side_effect = FuelPriceError("site unreachable")

            result = get_current_fuel_prices()

        assert result["95_octane"] == 86950.0
