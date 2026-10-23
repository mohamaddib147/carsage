// Display-only formatting of a car's drivetrain and transmission for the Dashboard hero's specs line (CAR-79).
// The stored values are free text (the Car Profile form takes "fwd, rwd, awd" and "Automatic" etc.), so this only
// tidies them for display: it never changes what is saved and never invents a value. An unrecognised value is shown
// with its first letter capitalised; an empty value returns "".

/** Known drivetrain codes shown in capitals; anything else is capitalised as a word. */
const DRIVETRAIN_CODES = new Map([
  ["fwd", "FWD"],
  ["rwd", "RWD"],
  ["awd", "AWD"],
  ["4wd", "4WD"],
  ["4x4", "4x4"],
]);

/** Known transmission words shown in their usual casing; anything else is capitalised as a word. */
const TRANSMISSION_WORDS = new Map([
  ["automatic", "Automatic"],
  ["manual", "Manual"],
  ["cvt", "CVT"],
  ["semi-automatic", "Semi-automatic"],
  ["dual-clutch", "Dual-clutch"],
  ["dct", "DCT"],
]);

/** Capitalises the first letter, leaving the rest untouched: "automatic" -> "Automatic", "wankel" -> "Wankel". */
function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * @param {string | null | undefined} drivetrain - the stored `cars.drivetrain`.
 * @returns {string} e.g. "RWD", "AWD", "Wankel"; "" when nothing is set.
 */
export function formatDrivetrain(drivetrain) {
  const trimmed = String(drivetrain ?? "").trim();
  if (!trimmed) return "";
  return DRIVETRAIN_CODES.get(trimmed.toLowerCase()) ?? capitalise(trimmed);
}

/**
 * @param {string | null | undefined} transmission - the stored `cars.transmission`.
 * @returns {string} e.g. "Automatic", "CVT"; "" when nothing is set.
 */
export function formatTransmission(transmission) {
  const trimmed = String(transmission ?? "").trim();
  if (!trimmed) return "";
  return TRANSMISSION_WORDS.get(trimmed.toLowerCase()) ?? capitalise(trimmed);
}

/**
 * The hero's one-line spec summary, in order, skipping anything the car doesn't have set.
 * Display only: drivetrain and transmission are tidied by the two helpers above; the rest is shown as stored.
 * @param {object} car - a `cars` row.
 * @returns {string[]} the parts to join with " · ", e.g. ["RWD", "Automatic", "1.8L Inline-4", "Gasoline", "B 123456", "62 L tank"].
 */
export function heroSpecParts(car) {
  return [
    formatDrivetrain(car.drivetrain),
    formatTransmission(car.transmission),
    car.engine_type,
    car.fuel_type,
    car.license_plate,
    car.fuel_tank_capacity_liters != null ? `${Number(car.fuel_tank_capacity_liters)} L tank` : "",
  ].filter((part) => typeof part === "string" && part.trim() !== "");
}
