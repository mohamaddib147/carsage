// Maintenance tracking (CAR-62): when each service item is next due and how urgent it
// is, today's date in Beirut, the presets, and form validation. Pure functions; the
// Maintenance page and the Dashboard card wire them to Supabase.
//
// SCHEDULE: an item's schedule starts from its latest completion (maintenance_records,
// latest by done_on, then created_at), or, if it has none, from the baseline entered
// when it was added ("last done" date and km). Next due date = that date + the
// interval in months (clamped to the month's last day: 31 Jan + 1 month = 28/29 Feb).
// Next due km = that km + the interval in km.
//
// STATUS THRESHOLDS (whichever of km and date comes first decides):
//   * Overdue  - the due date is BEFORE today, or the car's latest reading is PAST the due km.
//   * Due soon - the due date is today or within the next 14 days (DUE_SOON_DAYS), or there
//                are 500 km or fewer left (DUE_SOON_KM), including exactly at the due km.
//                A due date of today is Due soon, never Overdue.
//   * OK       - neither.
//   * "Add an odometer reading" - a km-based item on a car with no odometer reading, when
//                its date part (if any) isn't already Overdue or Due soon. (If it is, that
//                status shows, flagged as also needing a reading.)
// The car's current km is the shared CAR-61 helper, latestOdometer(), on that car's own
// fill-ups only.
//
// TODAY is always the Asia/Beirut calendar date, not the browser's time zone, and all
// date arithmetic is on calendar dates (no times), so there is no daylight-saving or
// midnight-UTC off-by-one.

import { LIMITS } from "./limits.js";
import { formatFillDate } from "./fuelLog.js";
import { formatKm, latestOdometer } from "./odometer.js";

export const DUE_SOON_DAYS = 14;
export const DUE_SOON_KM = 500;

/** Status keys, most urgent first (also the sort order). */
export const STATUS = {
  OVERDUE: "overdue",
  DUE_SOON: "due_soon",
  NEEDS_READING: "needs_reading",
  OK: "ok",
};

export const STATUS_LABELS = {
  [STATUS.OVERDUE]: "Overdue",
  [STATUS.DUE_SOON]: "Due soon",
  [STATUS.NEEDS_READING]: "Add an odometer reading",
  [STATUS.OK]: "OK",
};

const STATUS_RANK = { overdue: 0, due_soon: 1, needs_reading: 2, ok: 3 };

/**
 * Quick-start suggestions. They only fill the "Add item" form; nothing is ever
 * created from them without the user pressing Save.
 */
export const PRESETS = [
  { name: "Oil change", intervalKm: 5000, intervalMonths: 6 },
  { name: "Tire rotation", intervalKm: 10000, intervalMonths: null },
  { name: "Brake check", intervalKm: 20000, intervalMonths: 12 },
  { name: "Vehicle inspection", intervalKm: null, intervalMonths: 12 },
  { name: "Insurance renewal", intervalKm: null, intervalMonths: 12 },
];

/**
 * Today's date in Beirut as YYYY-MM-DD, whatever time zone the browser is in.
 * @param {Date} [now]
 * @returns {string}
 */
export function todayInBeirut(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Beirut",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
function isRealDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ""));
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** "2026-01-31" -> milliseconds at UTC midnight (calendar-date arithmetic only). */
function dayValue(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * A date plus whole months, clamped to the last day of the target month.
 * @param {string} isoDate - YYYY-MM-DD
 * @param {number} months
 * @returns {string} YYYY-MM-DD
 */
export function addMonths(isoDate, months) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const d = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Whole calendar days from `fromDate` to `toDate` (negative if `toDate` is earlier).
 * @param {string} fromDate - YYYY-MM-DD
 * @param {string} toDate - YYYY-MM-DD
 * @returns {number}
 */
export function daysBetween(fromDate, toDate) {
  return Math.round((dayValue(toDate) - dayValue(fromDate)) / 86_400_000);
}

/**
 * An item's latest completion: by done_on, then by when it was logged.
 * @param {{ done_on: string, created_at?: string }[] | null | undefined} records
 * @returns {object | null}
 */
export function latestRecord(records) {
  if (!records || records.length === 0) return null;
  return [...records].sort(
    (a, b) =>
      b.done_on.localeCompare(a.done_on) ||
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  )[0];
}

/** A positive finite number, or null. */
function positive(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * When an item was last done and when it is next due.
 * @param {{ interval_km?: number | null, interval_months?: number | null, baseline_date: string, baseline_km?: number | null }} item
 * @param {object[]} [records] - this item's completions.
 * @returns {{ lastDoneDate: string, lastDoneKm: number | null, fromRecord: boolean, dueDate: string | null, dueKm: number | null }}
 */
export function nextDue(item, records = []) {
  const record = latestRecord(records);
  const lastDoneDate = record ? record.done_on : item.baseline_date;
  const lastDoneKm = record ? positive(record.odometer_km) : positive(item.baseline_km);
  const months = positive(item.interval_months);
  const intervalKm = positive(item.interval_km);
  return {
    lastDoneDate,
    lastDoneKm,
    fromRecord: Boolean(record),
    dueDate: months ? addMonths(lastDoneDate, months) : null,
    dueKm: intervalKm && lastDoneKm != null ? lastDoneKm + intervalKm : null,
  };
}

/**
 * How urgent an item is (see the thresholds at the top of this file).
 * @param {object} item - a maintenance_items row.
 * @param {object[]} records - that item's completions.
 * @param {number | null} currentKm - the car's latest odometer reading (latestOdometer), or null.
 * @param {string} today - today's Beirut date (YYYY-MM-DD); a parameter so tests can pin it.
 * @returns {{ status: string, dueDate: string | null, dueKm: number | null, daysLeft: number | null,
 *   kmLeft: number | null, needsReading: boolean, lastDoneDate: string, lastDoneKm: number | null }}
 */
export function maintenanceStatus(item, records, currentKm, today) {
  const due = nextDue(item, records);
  const daysLeft = due.dueDate ? daysBetween(today, due.dueDate) : null;

  let dateStatus = null;
  if (daysLeft != null) {
    if (daysLeft < 0) dateStatus = STATUS.OVERDUE;
    else if (daysLeft <= DUE_SOON_DAYS) dateStatus = STATUS.DUE_SOON;
    else dateStatus = STATUS.OK;
  }

  const kmBased = positive(item.interval_km) != null;
  const km = positive(currentKm);
  let kmStatus = null;
  let kmLeft = null;
  let needsReading = false;
  if (kmBased) {
    if (km == null || due.dueKm == null) {
      needsReading = true;
    } else {
      kmLeft = due.dueKm - km;
      if (kmLeft < 0) kmStatus = STATUS.OVERDUE;
      else if (kmLeft <= DUE_SOON_KM) kmStatus = STATUS.DUE_SOON;
      else kmStatus = STATUS.OK;
    }
  }

  const known = [dateStatus, kmStatus].filter(Boolean);
  let status = known.sort((a, b) => STATUS_RANK[a] - STATUS_RANK[b])[0] ?? STATUS.NEEDS_READING;
  // A km-based item with no reading is never "OK": it says what's missing instead.
  if (needsReading && status === STATUS.OK) status = STATUS.NEEDS_READING;

  return {
    status,
    dueDate: due.dueDate,
    dueKm: due.dueKm,
    daysLeft,
    kmLeft,
    needsReading,
    lastDoneDate: due.lastDoneDate,
    lastDoneKm: due.lastDoneKm,
  };
}

/**
 * Most urgent first: Overdue, Due soon, Add an odometer reading, OK; then the
 * nearest due date, then the fewest km left, then the name.
 * @param {{ item: object, status: object }[]} rows
 * @returns {{ item: object, status: object }[]} a new array.
 */
export function sortByUrgency(rows) {
  const orInfinity = (value) => (value == null ? Number.POSITIVE_INFINITY : value);
  return [...rows].sort(
    (a, b) =>
      STATUS_RANK[a.status.status] - STATUS_RANK[b.status.status] ||
      orInfinity(a.status.daysLeft) - orInfinity(b.status.daysLeft) ||
      orInfinity(a.status.kmLeft) - orInfinity(b.status.kmLeft) ||
      String(a.item.name).localeCompare(String(b.item.name)),
  );
}

/**
 * "Due 1 Mar 2027 or at 95,000 km" (whichever comes first).
 * @param {{ dueDate: string | null, dueKm: number | null }} status
 * @returns {string}
 */
export function describeDue({ dueDate, dueKm }) {
  const parts = [];
  if (dueDate) parts.push(formatFillDate(dueDate));
  if (dueKm != null) parts.push(`at ${formatKm(dueKm)}`);
  if (parts.length === 0) return "Next due: needs an odometer reading";
  return `Next due: ${parts.join(" or ")}${parts.length === 2 ? ", whichever comes first" : ""}`;
}

/**
 * "12 days left", "due today", "3 days overdue", "450 km left", "120 km overdue".
 * @param {{ daysLeft: number | null, kmLeft: number | null }} status
 * @returns {string}
 */
export function describeRemaining({ daysLeft, kmLeft }) {
  const parts = [];
  if (daysLeft != null) {
    if (daysLeft === 0) parts.push("due today");
    else if (daysLeft > 0) parts.push(`${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`);
    else parts.push(`${-daysLeft} ${daysLeft === -1 ? "day" : "days"} overdue`);
  }
  if (kmLeft != null) {
    if (kmLeft >= 0) parts.push(`${formatKm(kmLeft)} left`);
    else parts.push(`${formatKm(-kmLeft)} overdue`);
  }
  return parts.join(", ");
}

/** Whole number from form text (commas allowed), or NaN; "" -> null. */
function wholeNumber(text) {
  const raw = String(text ?? "").replace(/,/g, "").trim();
  if (raw === "") return null;
  return /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/** Shared date rules: required, real, not in the future (Beirut), not before 2000. */
function dateError(value, today, what) {
  if (!value) return `Choose the date ${what}.`;
  if (!isRealDate(value)) return "That isn't a valid date.";
  if (value > today) return "The date can't be in the future.";
  if (value < LIMITS.MIN_MAINTENANCE_DATE) return "That date is too far in the past.";
  return undefined;
}

/** Shared odometer rule: whole km, 1 to 2,000,000. */
function odometerError(value) {
  if (Number.isNaN(value)) return "Enter the odometer as a whole number of km.";
  if (value < 1) return "The odometer reading must be greater than 0.";
  if (value > LIMITS.MAX_ODOMETER_KM) return "That reading is too large. Check for an extra digit.";
  return undefined;
}

/**
 * Validates the add/edit item form. Mirrors the maintenance_items CHECK constraints.
 * @param {{ name: string, intervalKm: string, intervalMonths: string, baselineDate: string, baselineKm: string, notes: string }} values
 * @param {string} today - today's Beirut date.
 * @returns {Record<string, string>} a message per invalid field; {} when valid.
 */
export function getMaintenanceItemErrors(values, today) {
  const errors = {};
  const name = String(values.name ?? "").trim();
  if (!name) errors.name = "Give the item a name.";
  else if (name.length > LIMITS.MAINTENANCE_NAME) errors.name = `Keep the name to ${LIMITS.MAINTENANCE_NAME} characters.`;

  const intervalKm = wholeNumber(values.intervalKm);
  const intervalMonths = wholeNumber(values.intervalMonths);
  if (intervalKm == null && intervalMonths == null) {
    errors.interval = "Set how often it's due: every so many km, every so many months, or both.";
  }
  if (intervalKm != null && (Number.isNaN(intervalKm) || intervalKm < LIMITS.MIN_INTERVAL_KM || intervalKm > LIMITS.MAX_INTERVAL_KM)) {
    errors.intervalKm = `Enter a whole number of km from ${LIMITS.MIN_INTERVAL_KM} to ${LIMITS.MAX_INTERVAL_KM.toLocaleString("en-US")}.`;
  }
  if (intervalMonths != null && (Number.isNaN(intervalMonths) || intervalMonths < LIMITS.MIN_INTERVAL_MONTHS || intervalMonths > LIMITS.MAX_INTERVAL_MONTHS)) {
    errors.intervalMonths = `Enter a whole number of months from ${LIMITS.MIN_INTERVAL_MONTHS} to ${LIMITS.MAX_INTERVAL_MONTHS}.`;
  }

  const baselineDateError = dateError(values.baselineDate, today, "it was last done");
  if (baselineDateError) errors.baselineDate = baselineDateError;

  const baselineKm = wholeNumber(values.baselineKm);
  if (baselineKm == null) {
    if (intervalKm != null) errors.baselineKm = "Enter the odometer when it was last done, so the km schedule can start.";
  } else {
    const message = odometerError(baselineKm);
    if (message) errors.baselineKm = message;
  }

  if (String(values.notes ?? "").length > LIMITS.MAINTENANCE_NOTES) {
    errors.notes = `Keep notes to ${LIMITS.MAINTENANCE_NOTES} characters.`;
  }
  return errors;
}

/**
 * Validates the "Mark as done" form. Mirrors the maintenance_records CHECK constraints.
 * @param {{ doneOn: string, odometer: string, note: string }} values
 * @param {string} today - today's Beirut date.
 * @param {boolean} kmBased - the item has a km interval, so the odometer is required
 *   (without it the next due km can't be worked out).
 * @returns {Record<string, string>}
 */
export function getCompletionErrors(values, today, kmBased) {
  const errors = {};
  const doneOnError = dateError(values.doneOn, today, "it was done");
  if (doneOnError) errors.doneOn = doneOnError;

  const odometer = wholeNumber(values.odometer);
  if (odometer == null) {
    if (kmBased) errors.odometer = "Enter the odometer reading, so the next due km can be worked out.";
  } else {
    const message = odometerError(odometer);
    if (message) errors.odometer = message;
  }

  if (String(values.note ?? "").length > LIMITS.MAINTENANCE_NOTES) {
    errors.note = `Keep the note to ${LIMITS.MAINTENANCE_NOTES} characters.`;
  }
  return errors;
}

/**
 * A non-blocking warning for the "Mark as done" odometer: lower than the car's latest
 * Fuel Log reading, when the done-on date is on or after that reading's date (a reading
 * can only have gone up since). A BACKDATED completion may legitimately be lower, so it
 * gets no warning; neither does the item form's "last done" km, which belongs to the item.
 * @param {string} odometer - the odometer text as typed or scanned.
 * @param {string} doneOn - the done-on date (YYYY-MM-DD).
 * @param {{ km: number, filledAt: string } | null} latest - latestOdometer() of the car's fill-ups.
 * @returns {string} the warning, or "".
 */
export function getCompletionOdometerWarning(odometer, doneOn, latest) {
  const km = wholeNumber(odometer);
  if (!Number.isFinite(km) || !latest || !doneOn) return "";
  if (doneOn < latest.filledAt) return "";
  if (km >= latest.km) return "";
  return `Lower than your latest reading of ${formatKm(latest.km)} (${formatFillDate(latest.filledAt)}). Check the reading.`;
}

/**
 * The item row to save from the form's values (only call once it validates).
 * @returns {{ name: string, interval_km: number | null, interval_months: number | null, baseline_date: string, baseline_km: number | null, notes: string | null }}
 */
export function itemFromForm(values) {
  const notes = String(values.notes ?? "").trim();
  return {
    name: String(values.name).trim(),
    interval_km: wholeNumber(values.intervalKm),
    interval_months: wholeNumber(values.intervalMonths),
    baseline_date: values.baselineDate,
    baseline_km: wholeNumber(values.baselineKm),
    notes: notes === "" ? null : notes,
  };
}

/** The id an item's card carries on the Maintenance page, so the Dashboard can link to it. */
export function itemAnchorId(itemId) {
  return `maintenance-item-${itemId}`;
}

/**
 * Every item that is Overdue or Due soon, most urgent first, plus how many items
 * across all cars need an odometer reading.
 * @param {object[]} items - maintenance_items rows (with maintenance_records), any car.
 * @param {object[]} readings - fuel_logs rows (car_id, odometer_km, ...), any car.
 * @param {string} today - today's Beirut date.
 * @returns {{ due: { item: object, status: object }[], needsReading: number, total: number }}
 */
export function dashboardMaintenance(items, readings, today) {
  const latestByCar = new Map();
  const kmFor = (carId) => {
    if (!latestByCar.has(carId)) {
      latestByCar.set(carId, latestOdometer(readings.filter((reading) => reading.car_id === carId))?.km ?? null);
    }
    return latestByCar.get(carId);
  };
  const rows = items.map((item) => ({
    item,
    status: maintenanceStatus(item, item.maintenance_records ?? [], kmFor(item.car_id), today),
  }));
  return {
    due: sortByUrgency(rows.filter((row) => row.status.status === STATUS.OVERDUE || row.status.status === STATUS.DUE_SOON)),
    needsReading: rows.filter((row) => row.status.status === STATUS.NEEDS_READING).length,
    total: rows.length,
  };
}

