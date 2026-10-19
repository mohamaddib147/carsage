# Tests app/services/real_efficiency.py (CAR-61): real-world km/L from Fuel Log
# odometer readings, under the fill-to-full assumption. Covers the normal case,
# the weighted average, legacy rows with no reading, a lower/equal reading, a
# single fill-up, implausible intervals (an extra digit, miles mixed with km, a
# partial fill-up), ordering, and DB value shapes (numeric strings, bools, NaN).

import pytest

from app.services.real_efficiency import (
    MAX_PLAUSIBLE_KM_PER_L,
    MIN_PLAUSIBLE_KM_PER_L,
    real_efficiency,
    valid_intervals,
)


def row(day, odometer, liters=10, created="10:00"):
    """One fill-up on 2026-09-<day>."""
    return {
        "filled_at": f"2026-09-{day:02d}",
        "created_at": f"2026-09-{day:02d}T{created}:00+00:00",
        "liters": liters,
        "odometer_km": odometer,
    }


def test_the_ticket_example_is_9_km_per_liter():
    # 84,250 -> 84,610 = 360 km on 40 L.
    result = real_efficiency([row(1, 84250, liters=35), row(9, 84610, liters=40)])

    assert result == {"km_per_liter": 9.0, "interval_count": 1, "distance_km": 360}


def test_the_average_is_weighted_by_distance_not_a_mean_of_ratios():
    # 100 km on 10 L (10 km/L), then 400 km on 20 L (20 km/L).
    # Weighted: 500 km / 30 L = 16.67. A plain mean of ratios would be 15.
    result = real_efficiency([row(1, 1000), row(2, 1100, liters=10), row(3, 1500, liters=20)])

    assert result["km_per_liter"] == pytest.approx(500 / 30)
    assert result["interval_count"] == 2


def test_no_rows_and_a_single_fill_up_give_no_figure():
    assert real_efficiency([]) is None
    assert real_efficiency([row(1, 84250)]) is None


def test_legacy_rows_without_a_reading_give_no_figure():
    assert real_efficiency([row(1, None), row(2, None), row(3, None)]) is None


def test_a_fill_up_with_no_reading_in_between_breaks_the_chain():
    # 1000 -> (no reading, 10 L) -> 1180. Skipping the middle row would credit
    # 180 km to only the last 10 L (18 km/L) and ignore the middle fill-up's
    # fuel; the honest answer is "no measured interval here".
    assert valid_intervals([row(1, 1000), row(2, None), row(3, 1180)]) == []


def test_a_lower_or_equal_reading_is_never_an_interval():
    assert valid_intervals([row(1, 5000), row(2, 4900)]) == []
    assert valid_intervals([row(1, 5000), row(2, 5000)]) == []


@pytest.mark.parametrize(
    "label, readings",
    [
        # (1000 -> 10,090) / 10 L = 909 km/L: an extra digit typed.
        ("extra digit", [row(1, 1000), row(2, 10090)]),
        # Readings in miles then km: 600 mi -> 1,100 km "looks" like 500 km on
        # 10 L = 50 km/L, above the 40 km/L ceiling.
        ("miles then km", [row(1, 600), row(2, 1100)]),
        # 15 km on 10 L = 1.5 km/L: below the 2 km/L floor (e.g. a typo or a
        # topped-up tank after a short hop).
        ("too low", [row(1, 1000), row(2, 1015)]),
    ],
)
def test_implausible_intervals_are_dropped(label, readings):
    assert valid_intervals(readings) == [], label


def test_the_plausible_range_boundaries_are_inclusive():
    assert valid_intervals([row(1, 1000), row(2, 1000 + int(MIN_PLAUSIBLE_KM_PER_L * 10))]) == [(20, 10)]
    assert valid_intervals([row(1, 1000), row(2, 1000 + int(MAX_PLAUSIBLE_KM_PER_L * 10))]) == [(400, 10)]


def test_rows_are_put_in_date_order_first():
    # Same data shuffled: still 90 km per interval.
    shuffled = [row(3, 1180), row(1, 1000), row(2, 1090)]

    assert valid_intervals(shuffled) == [(90, 10), (90, 10)]


def test_same_day_fill_ups_are_ordered_by_when_they_were_logged():
    rows = [row(2, 1180, created="18:00"), row(1, 1000), row(2, 1090, created="08:00")]

    assert valid_intervals(rows) == [(90, 10), (90, 10)]


def test_numeric_strings_from_the_database_are_read_as_numbers():
    rows = [
        {"filled_at": "2026-09-01", "created_at": "a", "liters": "35.5", "odometer_km": "84250"},
        {"filled_at": "2026-09-09", "created_at": "b", "liters": "40.0", "odometer_km": "84610"},
    ]

    assert real_efficiency(rows)["km_per_liter"] == pytest.approx(9.0)


@pytest.mark.parametrize("bad", [True, "abc", float("nan"), float("inf")])
def test_unusable_values_are_ignored_not_crashed_on(bad):
    assert valid_intervals([row(1, 1000), row(2, bad)]) == []
    assert valid_intervals([row(1, 1000), {**row(2, 1090), "liters": bad}]) == []


def test_zero_liters_never_divides_by_zero():
    assert valid_intervals([row(1, 1000), row(2, 1090, liters=0)]) == []
