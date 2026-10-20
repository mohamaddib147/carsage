// Odometer readings in the Fuel Log (CAR-61): validating a reading, the distance
// since the previous fill-up, real-world km/L per fill-up and on average, and the
// car's latest reading. Pure functions; pages/FuelLogPage.jsx wires them up.
//
// NO FULL-TANK ASSUMPTION. The average is total km driven / total liters put in,
// over "runs" of consecutive fill-ups that all have odometer readings. Within a run
// the distance is (last reading - first reading) and the liters are the sum of every
// fill-up's liters EXCEPT the first: the fuel added at a run's first fill-up was
// burned before the run began, so it only anchors the odometer; every later fill-up's
// fuel is what carried the car across the measured distance. A partial fill just
// shifts fuel between one interval and the next, and those shifts cancel over a run,
// so the user does NOT have to fill to full. (Summing each valid step's
// (distance, later-liters) pair is the same number as the per-run formula, which is
// how this is computed.)
//
// A run breaks (and a new one starts) when a fill-up has no reading, the reading did
// not go up, or the step's km/L is outside MIN_PLAUSIBLE..MAX_PLAUSIBLE (an extra
// digit, miles mixed with km, or an extreme partial fill) -- that one step is left
// out so a single bad reading can't poison the average.
//
// The per-fill-up km/L in the table is a ROUGH guide only (a partial fill makes it
// swing); the run average is the reliable number.
//
// Mirrors backend/app/services/real_efficiency.py; change the two together (a parity
// test on shared fixtures guards that they agree).

import { LIMITS } from "./limits.js";
import { formatFillDate, sortFillUps } from "./fuelLog.js";

export const MIN_PLAUSIBLE_KM_PER_L = 2;
export const MAX_PLAUSIBLE_KM_PER_L = 40;

// Trip Planner uses the real average only once it rests on at least this many fill-ups
// after the first AND this many km of measured driving (both floors; see the backend
// gate in trip_planner.py, which is the authority). These two constants drive the
// Fuel Log's "starts using it after..." message.
export const MIN_INTERVALS_FOR_TRIP_PLANNER = 3;
export const MIN_DISTANCE_FOR_TRIP_PLANNER = 500;

/**
 * A fill-up's odometer reading as a number, or null when it has none (legacy rows)
 * or the stored value is unusable.
 * @param {{ odometer_km?: number | string | null }} entry
 * @returns {number | null}
 */
export function readingOf(entry) {
  const value = entry?.odometer_km;
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Oldest fill-up first (date, then when it was logged). Returns a new array. */
function chronological(entries) {
  return sortFillUps(entries).reverse();
}

/** "84250" -> "84,250 km". */
export function formatKm(km) {
  return `${Math.round(Number(km)).toLocaleString("en-US")} km`;
}

/** 9 -> "9.0", 16.666 -> "16.7". */
export function formatKmPerLiter(kmPerLiter) {
  return Number(kmPerLiter).toFixed(1);
}

/** True for an interval's km/L inside the plausible range (inclusive). */
function isPlausible(kmPerLiter) {
  return kmPerLiter >= MIN_PLAUSIBLE_KM_PER_L && kmPerLiter <= MAX_PLAUSIBLE_KM_PER_L;
}

/**
 * The closest readings on either side of a date: `previous` is the latest reading
 * on or before it (a same-day fill-up already logged counts as earlier), `next` the
 * earliest reading after it.
 *
 * A reading whose own interval is already flagged as unrealistic (e.g. a saved
 * typo like 846,100 instead of 84,610) is NOT used as a neighbour. Fill-ups can't
 * be edited or deleted, so treating a saved typo as the floor would make every
 * correct reading after it look "too low" forever.
 * @param {string} date - YYYY-MM-DD
 * @param {object[]} entries - one car's fill-ups.
 * @returns {{ previous: { km: number, date: string } | null, next: { km: number, date: string } | null }}
 */
function neighbourReadings(date, entries) {
  let previous = null;
  let next = null;
  const intervals = fillUpEfficiencies(entries);
  for (const entry of chronological(entries)) {
    const km = readingOf(entry);
    if (km == null) continue;
    if (intervals.get(entry.id)?.plausible === false) continue;
    if (entry.filled_at <= date) previous = { km, date: entry.filled_at };
    else if (!next) next = { km, date: entry.filled_at };
  }
  return { previous, next };
}

/**
 * Hard checks on the optional Odometer field: the shape and range the database
 * itself enforces (whole km, 1 to 2,000,000). A reading failing these can't be saved.
 * @param {string} text - the raw field text (digits only from FormattedNumberInput).
 * @returns {string | undefined} a message, or undefined when blank or valid.
 */
export function getOdometerError(text) {
  const raw = String(text ?? "").replace(/,/g, "").trim();
  if (raw === "") return undefined;
  if (!/^\d+$/.test(raw)) return "Enter the odometer as a whole number of km.";
  const km = Number(raw);
  if (km < 1) return "The odometer reading must be greater than 0.";
  if (km > LIMITS.MAX_ODOMETER_KM) {
    return `That reading is too large (the limit is ${formatKm(LIMITS.MAX_ODOMETER_KM)}). Check for an extra digit.`;
  }
  return undefined;
}

/**
 * Soft check: a reading that isn't higher than the car's previous reading, or
 * isn't lower than a later one. Odometers only go up, so this is usually a typo,
 * but it is a WARNING the user can override ("Save anyway"), not a block: if an
 * earlier saved reading is itself the typo (e.g. the very first one), blocking
 * would make every correct reading after it impossible to save, and fill-ups
 * can't be edited. This rule lives in the form only; the database does not
 * enforce reading order.
 * @param {string} text - the raw field text.
 * @param {string} date - the fill-up's date (YYYY-MM-DD).
 * @param {object[]} entries - the SAME car's existing fill-ups.
 * @returns {string | undefined} a warning, or undefined when blank, invalid
 *   (see getOdometerError) or in order.
 */
export function getOdometerOrderWarning(text, date, entries) {
  if (getOdometerError(text)) return undefined;
  const raw = String(text ?? "").replace(/,/g, "").trim();
  if (raw === "") return undefined;
  const km = Number(raw);

  const { previous, next } = neighbourReadings(date, entries);
  if (previous && km <= previous.km) {
    return `This isn't higher than your previous reading of ${formatKm(previous.km)} (${formatFillDate(previous.date)}). Odometers only go up, so check it for a typo.`;
  }
  if (next && km >= next.km) {
    return `This isn't lower than your later reading of ${formatKm(next.km)} (${formatFillDate(next.date)}). Check the reading and the date.`;
  }
  return undefined;
}

/**
 * Distance since the previous reading for a reading being typed, so a typo (an
 * extra digit) is obvious before saving; saved fill-ups can't be edited.
 * @param {string} text - the raw field text.
 * @param {string} date - the fill-up's date.
 * @param {object[]} entries - the same car's fill-ups.
 * @param {string} [litersText] - liters typed so far; used to flag an implausible km/L.
 * @returns {{ distanceKm: number, previousKm: number, implausible: boolean } | null}
 *   null when the reading is blank/invalid, out of order, or there's no earlier reading.
 */
export function distanceSincePrevious(text, date, entries, litersText = "") {
  if (getOdometerError(text)) return null;
  const raw = String(text ?? "").replace(/,/g, "").trim();
  if (raw === "") return null;
  const { previous } = neighbourReadings(date, entries);
  if (!previous) return null;
  const distanceKm = Number(raw) - previous.km;
  if (distanceKm <= 0) return null; // out of order: getOdometerOrderWarning explains it instead
  const liters = Number(litersText);
  const implausible = Number.isFinite(liters) && liters > 0 && !isPlausible(distanceKm / liters);
  return { distanceKm, previousKm: previous.km, implausible };
}

/**
 * Rough per-fill-up km/L for each fill-up that closes a measured step (distance since
 * the previous reading / this fill-up's liters). This is only a guide for the table:
 * a partial fill makes an individual figure swing; the run average (realEfficiency)
 * is the reliable number.
 * @param {object[]} entries - one car's fill-ups, any order.
 * @returns {Map<string, { distanceKm: number, kmPerLiter: number, plausible: boolean }>}
 *   keyed by entry id; a fill-up with no step (first one, no reading, or the
 *   previous fill-up has none) is simply absent.
 */
export function fillUpEfficiencies(entries) {
  const result = new Map();
  const ordered = chronological(entries);
  for (let index = 1; index < ordered.length; index += 1) {
    const start = readingOf(ordered[index - 1]);
    const end = readingOf(ordered[index]);
    const liters = Number(ordered[index].liters);
    if (start == null || end == null || !Number.isFinite(liters) || liters <= 0) continue;
    const distanceKm = end - start;
    const kmPerLiter = distanceKm / liters;
    result.set(ordered[index].id, {
      distanceKm,
      kmPerLiter,
      plausible: distanceKm > 0 && isPlausible(kmPerLiter),
    });
  }
  return result;
}

/**
 * The car's real-world km/L: total measured km / total liters over the valid steps
 * (see the module header for why this needs no full tank). intervalCount is the number
 * of fill-ups after the first that were measured.
 * @param {object[]} entries - ONE car's fill-ups.
 * @returns {{ kmPerLiter: number, intervalCount: number, distanceKm: number } | null}
 *   null when there is no valid step yet (never NaN or 0).
 */
export function realEfficiency(entries) {
  let distanceKm = 0;
  let liters = 0;
  let intervalCount = 0;
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const [id, interval] of fillUpEfficiencies(entries)) {
    if (!interval.plausible) continue;
    distanceKm += interval.distanceKm;
    liters += Number(byId.get(id).liters);
    intervalCount += 1;
  }
  if (intervalCount === 0) return null;
  return { kmPerLiter: distanceKm / liters, intervalCount, distanceKm };
}

/**
 * The car's latest odometer reading (by fill-up date), for distance-based
 * features such as maintenance reminders (CAR-62).
 * @param {object[]} entries - ONE car's fill-ups.
 * @returns {{ km: number, filledAt: string } | null} null with no reading at all.
 */
export function latestOdometer(entries) {
  const withReading = chronological(entries).filter((entry) => readingOf(entry) != null);
  const last = withReading[withReading.length - 1];
  return last ? { km: readingOf(last), filledAt: last.filled_at } : null;
}
