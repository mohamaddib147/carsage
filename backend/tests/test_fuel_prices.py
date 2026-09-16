# Tests the Lebanon fuel price scraper/cache: HTML parsing (normal case,
# the real "some blocks render as 0 placeholders" edge case, and no
# parseable block at all), and the cache orchestration (fresh cache used
# as-is, stale cache triggers a re-scrape, and a failed scrape falls back
# to the last cached price — or raises if there's no cache at all yet).

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.services.fuel_prices import (
    FuelPriceError,
    get_current_fuel_prices,
    lbp_to_usd,
    scrape_fuel_prices,
)


def test_lbp_to_usd_converts_using_the_fixed_rate():
    assert lbp_to_usd(89000) == 1.0
    assert lbp_to_usd(0) == 0.0


def _counter_block(octane_95, octane_98, gaz, diesel):
    """Builds one "Daily Fuel Prices" block of 4 counters, matching the
    real site's markup (see fuel_prices.py's module docstring)."""

    def counter(value, label):
        return f"""
        <div class="counter-wrapper">
          <div class="counter-value"><h4>LBP <span class="counter-up" data-count="{value}">0</span></h4></div>
          <div class="counter-title"><h5>{label}</h5></div>
        </div>
        """

    return (
        counter(octane_95, "Octane 95")
        + counter(octane_98, "Octane 98")
        + counter(gaz, "Gaz")
        + counter(diesel, "Diesel oil (for motor vehicles)")
    )


def _page(*blocks):
    return "<html><body>" + "".join(blocks) + "</body></html>"


def _mock_response(text):
    response = MagicMock()
    response.text = text
    response.raise_for_status.return_value = None
    return response


class TestScrapeFuelPrices:
    def test_parses_prices_from_the_most_recent_block_and_converts_per_liter(
        self, monkeypatch
    ):
        html = _page(_counter_block(1739000, 1777000, 889000, 1466000))
        monkeypatch.setattr(
            "app.services.fuel_prices.httpx.get",
            lambda *a, **k: _mock_response(html),
        )

        prices = scrape_fuel_prices()

        assert prices == {
            "95_octane": 86950.0,
            "98_octane": 88850.0,
            "diesel": 73300.0,
        }

    def test_skips_zero_placeholder_blocks_and_uses_the_next_populated_one(
        self, monkeypatch
    ):
        # Mirrors what the real site actually does: the newest block(s)
        # sometimes render as unpopulated "0" placeholders.
        html = _page(
            _counter_block(0, 0, 0, 0),
            _counter_block(0, 0, 0, 0),
            _counter_block(1739000, 1777000, 889000, 1466000),
        )
        monkeypatch.setattr(
            "app.services.fuel_prices.httpx.get",
            lambda *a, **k: _mock_response(html),
        )

        prices = scrape_fuel_prices()

        assert prices["95_octane"] == 86950.0

    def test_raises_clear_error_when_no_block_is_fully_populated(self, monkeypatch):
        html = _page(_counter_block(0, 0, 0, 0))
        monkeypatch.setattr(
            "app.services.fuel_prices.httpx.get",
            lambda *a, **k: _mock_response(html),
        )

        with pytest.raises(FuelPriceError, match="Could not find"):
            scrape_fuel_prices()

    def test_raises_clear_error_on_network_failure_without_leaking_detail(
        self, monkeypatch
    ):
        def raise_network_error(*args, **kwargs):
            raise httpx.ConnectError("connection refused to internal-host:1234")

        monkeypatch.setattr("app.services.fuel_prices.httpx.get", raise_network_error)

        with pytest.raises(FuelPriceError) as excinfo:
            scrape_fuel_prices()

        assert "internal-host" not in str(excinfo.value)


def _cached_row(price, days_old):
    scraped_at = (datetime.now(timezone.utc) - timedelta(days=days_old)).isoformat()
    return {"price_per_liter_lbp": price, "scraped_at": scraped_at}


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
            mock_scrape.return_value = {
                "95_octane": 90000.0,
                "98_octane": 91000.0,
                "diesel": 75000.0,
            }

            result = get_current_fuel_prices()

        mock_scrape.assert_called_once()
        shared_insert_mock.assert_called_once()
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
