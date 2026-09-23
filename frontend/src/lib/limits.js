// Client-side input limits and validators (CAR-23), shared by Sign Up, Car
// Onboarding, Car Profile and the Trip Planner. They exist for fast, friendly
// feedback only — the SAME limits are enforced by the server and can't be
// skipped: the FastAPI backend (backend/app/validation.py) and the database
// CHECK constraints (docs/db_migrations/). Change all three together.
// Also home of the plain-language error messages (CAR-25) — see below.

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
  // fuel_logs (CAR-53): one fill-up is at most the largest tank the app allows
  MAX_FILL_LITERS: 200,
  MAX_FILL_COST: 1_000_000_000_000,
  MIN_FILL_DATE: "2000-01-01",
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

// ---------------------------------------------------------------------------
// User-facing error text (CAR-25). Errors from Supabase (database or Auth) carry
// technical wording — table and constraint names, "row-level security policy",
// "JWT expired", "Database error saving new user". None of that is shown: each
// error is CLASSIFIED (by its code, or by pattern-matching its message) and
// replaced with a fixed plain-language sentence. An error nobody has classified
// gets a generic one — the raw text is never displayed.
// ---------------------------------------------------------------------------

export const NETWORK_ERROR_MESSAGE = "Could not reach the server. Check your connection and try again.";
export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please log in again.";
export const PERMISSION_ERROR_MESSAGE = "You don't have permission to do that.";
export const GENERIC_SAVE_ERROR = "Could not save. Please try again.";
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** True for a request that never got an answer (offline, DNS, server down). */
function isNetworkFailure(error) {
  const text = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /failed to fetch|networkerror|network request failed|load failed|retryablefetch/i.test(text);
}

/**
 * A user-facing message for a failed database action (save, delete, ...) that
 * covers the causes shared by every action: no network, an ended session, no
 * permission. Anything else gets the caller's `fallback`, never the raw text.
 * @param {{ code?: string, message?: string, name?: string } | null | undefined} error
 * @param {string} [fallback] - what to show for an unclassified error
 * @returns {string}
 */
export function describeActionError(error, fallback = GENERIC_SAVE_ERROR) {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  if (isNetworkFailure(error)) return NETWORK_ERROR_MESSAGE;
  if (code === "PGRST301" || code === "PGRST303" || /jwt/i.test(message)) {
    return SESSION_EXPIRED_MESSAGE;
  }
  // 42501 = insufficient privilege; it is also what a row-level security
  // rejection is reported as.
  if (code === "42501") return PERMISSION_ERROR_MESSAGE;
  return fallback;
}

/**
 * A user-facing message for a failed save. A database rule violation (Postgres
 * class 23: check / not-null / etc.) is described in plain words instead of
 * leaking the constraint name; every other error goes through
 * `describeActionError`, so its raw text is never shown.
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
  return describeActionError(error, GENERIC_SAVE_ERROR);
}

const RATE_LIMIT_MESSAGE = "Too many attempts. Please wait a moment and try again.";

// Supabase Auth error codes (supabase-js exposes `error.code`) -> plain wording.
// The two most common keep GoTrue's own familiar phrasing.
const AUTH_MESSAGES_BY_CODE = {
  invalid_credentials: "Invalid login credentials",
  user_already_exists: "User already registered",
  email_exists: "User already registered",
  email_not_confirmed: "Email not confirmed. Check your inbox for the confirmation link.",
  weak_password: "That password is too weak or too easy to guess. Please choose a stronger one.",
  over_email_send_rate_limit: RATE_LIMIT_MESSAGE,
  over_request_rate_limit: RATE_LIMIT_MESSAGE,
  email_address_invalid: "Please enter a valid email address.",
  validation_failed: "Please check your email and password and try again.",
};

// Older responses carry no code, only a message. These exact GoTrue messages
// are written for end users and safe to show; matched by prefix, lower-cased.
const SAFE_AUTH_MESSAGE_PREFIXES = [
  "invalid login credentials",
  "user already registered",
  "email not confirmed",
  "password should be at least",
  "unable to validate email address",
  "signup requires a valid password",
];

/**
 * A user-facing message for a failed Sign Up / Log In. Known, user-meant
 * Supabase Auth messages are kept; everything else (including server-side
 * wording such as "Database error saving new user") becomes a generic sentence.
 * @param {{ code?: string, message?: string, name?: string } | null | undefined} error
 * @returns {string}
 */
export function describeAuthError(error) {
  if (isNetworkFailure(error)) return NETWORK_ERROR_MESSAGE;
  const byCode = AUTH_MESSAGES_BY_CODE[String(error?.code ?? "")];
  if (byCode) return byCode;
  const message = String(error?.message ?? "");
  if (SAFE_AUTH_MESSAGE_PREFIXES.some((prefix) => message.toLowerCase().startsWith(prefix))) {
    return message;
  }
  return GENERIC_ERROR_MESSAGE;
}
