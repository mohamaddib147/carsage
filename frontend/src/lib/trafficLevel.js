// Classifies how much traffic is slowing a route (CAR-46) by comparing
// the no-traffic baseline duration against the traffic-adjusted one —
// both already returned by the Google Maps integration, so this needs no
// new API call. The thresholds are the ticket's starting point (adjust
// here if they don't feel right against real data).

/** Upper bound (inclusive) of "Light": under 10% slower than baseline. */
export const LIGHT_MAX_INCREASE = 0.1;
/** Upper bound (inclusive) of "Moderate": 10–30% slower; above is Heavy. */
export const MODERATE_MAX_INCREASE = 0.3;

/**
 * @param {number} durationMin - baseline (no-traffic) duration, minutes
 * @param {number} durationInTrafficMin - traffic-adjusted duration, minutes
 * @returns {{ level: "light" | "moderate" | "heavy", label: string } | null}
 *   null when the baseline is unusable (missing/non-positive), so callers
 *   simply show no indicator rather than a misleading one. A traffic
 *   duration below the baseline (rounding noise) counts as Light.
 */
export function getTrafficLevel(durationMin, durationInTrafficMin) {
  if (
    !Number.isFinite(durationMin) ||
    !Number.isFinite(durationInTrafficMin) ||
    durationMin <= 0
  ) {
    return null;
  }

  const increase = (durationInTrafficMin - durationMin) / durationMin;

  if (increase < LIGHT_MAX_INCREASE) {
    return { level: "light", label: "Light Traffic" };
  }
  if (increase <= MODERATE_MAX_INCREASE) {
    return { level: "moderate", label: "Moderate Traffic" };
  }
  return { level: "heavy", label: "Heavy Traffic" };
}
