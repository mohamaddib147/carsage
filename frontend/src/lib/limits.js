// Client-side input limits and validators (CAR-23), shared by Sign Up, Car
// Onboarding, Car Profile and the Trip Planner. They exist for fast, friendly
// feedback only — the SAME limits are enforced by the server and can't be
// skipped: the FastAPI backend (backend/app/validation.py) and the database
// CHECK constraints (docs/db_migrations/). Change all three together.

export const LIMITS = {
  // cars text columns
  MAKE_MODEL: 60,
  ENGINE_TYPE: 60,
  DRIVETRAIN: 60,
  TRANSMISSION: 60,
  LICENSE_PLATE: 20,
  VIN: 32,
  // cars numbers
  MAX_FUEL_EFFICIENCY: 100, // km/L
  MIN_CYLINDERS: 1,
  MAX_CYLINDERS: 16,
  // trips
  PLACE: 300,
  MAX_FUEL_PRICE_LBP: 10_000_000,
  // sign up (Supabase Auth enforces 6+; bcrypt only uses the first 72 bytes)
  EMAIL: 254,
  PASSWORD_MIN: 6,
  PASSWORD_MAX: 72,
};

/**
 * @param {string | null | undefined} value
 * @param {number} max
 * @param {string} label - e.g. "Engine type"
 * @returns {string} an error message, or "" if within the limit.
 */
export function getLengthError(value, max, label) {
  return (value ?? "").trim().length > max
    ? `${label} must be ${max} characters or fewer.`
    : "";
}

/**
 * Optional fuel efficiency in km/L: blank is fine, otherwise 0 < value <= 100.
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export function getFuelEfficiencyError(value) {
  if (value == null || String(value).trim() === "") return "";
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= LIMITS.MAX_FUEL_EFFICIENCY
    ? ""
    : `Fuel efficiency must be between 0 and ${LIMITS.MAX_FUEL_EFFICIENCY} km/L.`;
}

/**
 * Optional cylinder count: blank is fine, otherwise a whole number 1-16.
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export function getCylindersError(value) {
  if (value == null || String(value).trim() === "") return "";
  const number = Number(value);
  return Number.isInteger(number) &&
    number >= LIMITS.MIN_CYLINDERS &&
    number <= LIMITS.MAX_CYLINDERS
    ? ""
    : `Cylinders must be a whole number between ${LIMITS.MIN_CYLINDERS} and ${LIMITS.MAX_CYLINDERS}.`;
}

/**
 * The Trip Planner's optional fuel price override (raw digits, LBP per liter):
 * blank is fine (the current default is used), otherwise 1-10,000,000.
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export function getFuelPriceError(value) {
  if (value == null || String(value).trim() === "") return "";
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= LIMITS.MAX_FUEL_PRICE_LBP
    ? ""
    : `Fuel price must be between 1 and ${LIMITS.MAX_FUEL_PRICE_LBP.toLocaleString()} LBP per liter.`;
}

/**
 * Length / range errors for a car form's optional fields and its make and
 * model (required-ness is checked by each form itself).
 * @param {{ make?: string, model?: string, engineType?: string, drivetrain?: string,
 *   transmission?: string, licensePlate?: string, vin?: string,
 *   fuelEfficiency?: string, cylinders?: string }} values
 * @returns {Record<string, string>} field name (camelCase) -> message.
 */
export function getCarFieldErrors(values) {
  const errors = {};
  const lengthChecks = [
    ["make", LIMITS.MAKE_MODEL, "Make"],
    ["model", LIMITS.MAKE_MODEL, "Model"],
    ["engineType", LIMITS.ENGINE_TYPE, "Engine type"],
    ["drivetrain", LIMITS.DRIVETRAIN, "Drivetrain"],
    ["transmission", LIMITS.TRANSMISSION, "Transmission"],
    ["licensePlate", LIMITS.LICENSE_PLATE, "License plate"],
    ["vin", LIMITS.VIN, "VIN"],
  ];
  for (const [field, max, label] of lengthChecks) {
    const message = getLengthError(values[field], max, label);
    if (message) errors[field] = message;
  }

  const efficiencyError = getFuelEfficiencyError(values.fuelEfficiency);
  if (efficiencyError) errors.fuelEfficiency = efficiencyError;
  const cylindersError = getCylindersError(values.cylinders);
  if (cylindersError) errors.cylinders = cylindersError;
  return errors;
}

/**
 * A user-facing message for a failed save. A database rule violation (Postgres
 * class 23: check / not-null / etc.) is described in plain words instead of
 * leaking the constraint name; other errors keep their own message.
 * @param {{ code?: string, message?: string } | null | undefined} error
 * @returns {string}
 */
export function describeSaveError(error) {
  const code = String(error?.code ?? "");
  if (code === "23514") {
    return "Some values are outside the allowed range or length. Please check the form and try again.";
  }
  if (code.startsWith("23")) {
    return "Some required information is missing or invalid. Please check the form and try again.";
  }
  return error?.message || "Could not save. Please try again.";
}
