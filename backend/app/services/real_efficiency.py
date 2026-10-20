"""Works out a car's real-world fuel efficiency (km/L) from its Fuel Log odometer readings (CAR-61).

NO FULL-TANK ASSUMPTION. The average is total km driven / total liters put in, over
"runs" of consecutive fill-ups that all have odometer readings. Within a run the
distance is (last reading - first reading) and the liters are the sum of every
fill-up's liters EXCEPT the first: the fuel added at the first fill-up of a run was
burned before the run began (we have no distance for it), so it only anchors the
odometer. Every later fill-up's fuel is what carried the car across the measured
distance.

Why this works without filling to full: a partial fill just shifts fuel between one
interval and the next (you measure a bit less distance for the liters you added this
time, a bit more next time). Over a run those shifts cancel, because the total liters
added between the first and last reading is exactly the fuel that produced the total
distance (the tank's start and end levels differ by at most a tank, which is small
against a run of several fill-ups). Summing the per-interval (distance, later-liters)
pairs is algebraically the same number as the per-run formula, which is what this
module does.

A run is broken (and a new one started) when:
  * a fill-up has no odometer reading (we can't measure across it);
  * the reading did not go up (a lower or equal reading is a typo or a swapped car,
    not a distance);
  * the step's km/L is outside MIN_PLAUSIBLE_KM_PER_L..MAX_PLAUSIBLE_KM_PER_L (an
    extra digit, miles vs km, or an extreme partial fill) -- that one step is
    excluded so a single bad reading can't poison the average.

The per-fill-up figure shown in the table is a ROUGH guide only (a partial fill makes
it swing); the run average is the reliable number.

Mirrors frontend/src/lib/odometer.js; change the two together (a parity test on
shared fixtures, backend/tests/fixtures/efficiency_cases.json, guards that they agree).
"""

import math
from typing import Any

MIN_PLAUSIBLE_KM_PER_L = 2.0
MAX_PLAUSIBLE_KM_PER_L = 40.0

# Trip Planner trusts the real average only once it rests on at least this many
# fill-ups after the first (i.e. this many measured intervals) AND this many km of
# measured driving; below either floor it keeps using the car's rated fuel_efficiency.
MIN_INTERVALS_FOR_ESTIMATE = 3
MIN_DISTANCE_KM_FOR_ESTIMATE = 500.0


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
    The usable (distance_km, liters) steps between consecutive fill-ups.

    Each step pairs two adjacent fill-ups (date order) and contributes the distance
    between their readings and the LATER fill-up's liters (the first fill-up of any
    run is only ever a `previous`, so its liters are never counted -- this is the
    "exclude the first fill-up's liters" rule). A step that breaks a run (see the
    module docstring) is simply left out, which also starts the next run.

    Args:
        rows: one car's `fuel_logs` rows, in any order, each with filled_at,
            created_at, liters and odometer_km (which may be None).

    Returns:
        A list of (distance_km, liters) pairs, oldest first; empty when no
        step qualifies.
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
    The car's real-world km/L: total measured km / total liters (see module docstring).

    Args:
        rows: one car's `fuel_logs` rows (the caller must already have scoped
            them to a single user AND a single car).

    Returns:
        {"km_per_liter": float, "interval_count": int, "distance_km": float},
        or None when there is no valid step at all. interval_count is the number
        of fill-ups after the first that were measured. Callers decide whether
        that and distance_km are enough to rely on (see MIN_INTERVALS_FOR_ESTIMATE
        and MIN_DISTANCE_KM_FOR_ESTIMATE).
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
