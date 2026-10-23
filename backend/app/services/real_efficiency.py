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

A run is broken (and a new one started) when a fill-up has no odometer reading, or the
reading did not go up (a lower or equal reading is a typo or a swapped car, not a
distance). WITHIN a run the plausibility band is tested on the COMBINED span, not on
each step on its own: a small top-up gives a high per-step km/L and the next fill-up a
low one, so testing them individually would drop the top-up's distance and bias the
average. Testing the whole run lets those partial-fill swings cancel. Only when the
whole run is still implausible (a typo that slipped past the backwards check -- a reading
too high but followed by a higher one) is the single most extreme step excised and each
side of it re-tried, so one bad reading can't poison the average yet real partial fills
are kept.

`valid_intervals` below is the raw per-step view (a rough guide; it still applies the
per-step band and is what the table-style per-fill figures are built from). The average
in `real_efficiency` uses the run-merge above, so it is NOT simply the sum of
valid_intervals.

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


def _runs(rows: list[dict]) -> list[list[tuple[float, float]]]:
    """The fill-ups split into runs. Each run is a list of (distance, liters) steps
    between consecutive fill-ups whose readings both exist and strictly increase; a
    missing or non-increasing reading ends the run and re-anchors the next one. The
    first fill-up of a run is only an anchor, so its liters never appear here."""
    runs: list[list[tuple[float, float]]] = []
    run: list[tuple[float, float]] = []
    prev: float | None = None
    for row in _chronological(rows):
        reading = _number(row.get("odometer_km"))
        if reading is None:
            if run:
                runs.append(run)
                run = []
            prev = None
            continue
        if prev is None:
            prev = reading
            continue
        liters = _number(row.get("liters"))
        distance = reading - prev
        if distance <= 0 or liters is None or liters <= 0:
            if run:
                runs.append(run)
                run = []
            prev = reading
            continue
        run.append((distance, liters))
        prev = reading
    if run:
        runs.append(run)
    return runs


def _deviation(distance: float, liters: float) -> float:
    """How far a step's km/L sits outside the plausible band (0 when inside)."""
    ratio = distance / liters
    if ratio > MAX_PLAUSIBLE_KM_PER_L:
        return ratio - MAX_PLAUSIBLE_KM_PER_L
    if ratio < MIN_PLAUSIBLE_KM_PER_L:
        return MIN_PLAUSIBLE_KM_PER_L - ratio
    return 0.0


def _merge_run(intervals: list[tuple[float, float]]) -> list[tuple[float, float, int]]:
    """Committed (distance, liters, step_count) spans for one run. The whole run is
    tried first: if its combined km/L is in the band, partial fills cancel and it is
    one span. Otherwise the single most extreme step is excised and each side re-tried,
    so a typo is dropped but real partial-fill pairs survive."""
    if not intervals:
        return []
    total_distance = sum(distance for distance, _ in intervals)
    total_liters = sum(liters for _, liters in intervals)
    if MIN_PLAUSIBLE_KM_PER_L <= total_distance / total_liters <= MAX_PLAUSIBLE_KM_PER_L:
        return [(total_distance, total_liters, len(intervals))]
    worst = max(range(len(intervals)), key=lambda i: _deviation(*intervals[i]))
    return _merge_run(intervals[:worst]) + _merge_run(intervals[worst + 1:])


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
    total_distance = 0.0
    total_liters = 0.0
    count = 0
    for run in _runs(rows):
        for distance, liters, steps in _merge_run(run):
            total_distance += distance
            total_liters += liters
            count += steps
    if total_liters == 0:
        return None
    return {
        "km_per_liter": total_distance / total_liters,
        "interval_count": count,
        "distance_km": total_distance,
    }
