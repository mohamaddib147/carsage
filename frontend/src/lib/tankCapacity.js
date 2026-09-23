// Shared sanity range and validation for a car's fuel tank capacity in
// litres (CAR-49). Used by Car Onboarding, Car Profile and the Trip
// Planner so a stray input error (e.g. "430" for a 43 L tank) is flagged
// instead of silently producing a wildly wrong figure. The database
// enforces the same range with a CHECK constraint, and the autofill
// lookup in the backend drops out-of-range values (keep all three in sync).

export const MIN_TANK_LITERS = 5;
export const MAX_TANK_LITERS = 200;

export const TANK_RANGE_MESSAGE = `Tank capacity must be between ${MIN_TANK_LITERS} and ${MAX_TANK_LITERS} liters.`;

/**
 * Validates a tank capacity typed into a form field.
 * @param {string | number | null | undefined} value - the raw field value;
 *   blank means "not set", which is allowed.
 * @returns {string} an error message, or "" if the value is blank or valid.
 */
export function getTankCapacityError(value) {
  if (value == null || String(value).trim() === "") return "";

  const liters = Number(value);
  if (!Number.isFinite(liters) || liters < MIN_TANK_LITERS || liters > MAX_TANK_LITERS) {
    return TANK_RANGE_MESSAGE;
  }
  return "";
}
