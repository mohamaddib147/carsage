"""Works out a car's real-world fuel efficiency (km/L) from its Fuel Log odometer readings (CAR-61).

ASSUMPTION (fill-to-full): every fill-up fills the tank to full. Only then does
the fuel put in at a fill-up equal the fuel burned since the previous one, so
the km/L of the interval ending at fill-up N is

    (odometer at N - odometer at N-1) / liters at N

There is no "full tank" flag on `fuel_logs`; the Fuel Log page states this
assumption to the user under its history table. A partial fill-up makes its
interval read too high, which is one reason implausible intervals are dropped.

An interval only counts when:
  * both fill-ups are adjacent in date order AND both have an odometer reading
    (an older fill-up with no reading in between breaks the chain instead of
    being skipped over, because skipping it would ignore that fill-up's fuel
    and overstate km/L);
  * the reading went up (a lower or equal reading is a typo, not a distance);
  * the resulting km/L is between MIN_PLAUSIBLE_KM_PER_L and
    MAX_PLAUSIBLE_KM_PER_L (catches an extra digit, readings typed in miles
    on one fill-up and km on the next, and partial fill-ups).

The average is total km / total liters over the valid intervals (weighted by
distance), not a mean of per-interval ratios, so one short hop can't skew it.

Mirrors frontend/src/lib/odometer.js; change the two together.
"""

import math
from typing import Any

MIN_PLAUSIBLE_KM_PER_L = 2.0
MAX_PLAUSIBLE_KM_PER_L = 40.0

# Trip Planner only trusts the real average once it rests on this many valid
# intervals; below that it keeps using the car's rated fuel_efficiency.
MIN_INTERVALS_FOR_ESTIMATE = 3


def _number(value: Any) -> float | None:
    """A finite float from a DB value (int, float or numeric string), else None.

    bool is refused explicitly: it is an int subclass in Python, and True must
    never read as an odometer of 1 km.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _chronological(rows: list[dict]) -> list[dict]:
    """Oldest fill-up first: by date, then by when it was logged (same-day ties)."""
    return sorted(
        rows,
        key=lambda row: (str(row.get("filled_at") or ""), str(row.get("created_at") or "")),
    )


def valid_intervals(rows: list[dict]) -> list[tuple[float, float]]:
    """
    The usable (distance_km, liters) intervals between consecutive fill-ups.

    Args:
        rows: one car's `fuel_logs` rows, in any order, each with filled_at,
            created_at, liters and odometer_km (which may be None).

    Returns:
        A list of (distance_km, liters) pairs, oldest first; empty when no
        interval qualifies (see the module docstring for the rules).
    """
    intervals: list[tuple[float, float]] = []
    ordered = _chronological(rows)
    for previous, current in zip(ordered, ordered[1:]):
        start = _number(previous.get("odometer_km"))
        end = _number(current.get("odometer_km"))
        liters = _number(current.get("liters"))
        if start is None or end is None or liters is None or liters <= 0:
            continue
        distance = end - start
        if distance <= 0:
            continue
        if not MIN_PLAUSIBLE_KM_PER_L <= distance / liters <= MAX_PLAUSIBLE_KM_PER_L:
            continue
        intervals.append((distance, liters))
    return intervals


def real_efficiency(rows: list[dict]) -> dict | None:
    """
    The car's real-world km/L over all valid intervals.

    Args:
        rows: one car's `fuel_logs` rows (the caller must already have scoped
            them to a single user AND a single car).

    Returns:
        {"km_per_liter": float, "interval_count": int, "distance_km": float},
        or None when there is no valid interval at all. Callers decide
        whether interval_count is enough to rely on (see
        MIN_INTERVALS_FOR_ESTIMATE).
    """
    intervals = valid_intervals(rows)
    if not intervals:
        return None
    total_km = sum(distance for distance, _ in intervals)
    total_liters = sum(liters for _, liters in intervals)
    return {
        "km_per_liter": total_km / total_liters,
        "interval_count": len(intervals),
        "distance_km": total_km,
    }
