// Helpers for the Fuel Log (CAR-53): validating the "add a fill-up" form, today's
// date, price per liter, sorting, and showing dates, liters and money. Pure
// functions so they are easy to test; the page (pages/FuelLogPage.jsx) wires
// them to Supabase.
//
// The limits mirror the database CHECK constraints on `fuel_logs`
// (docs/db_migrations/2026-09-21_car53_fuel_logs.sql), which are the real
// server-side check because the browser writes to the table directly. They
// live in limits.js next to the other mirrored limits — change them together.

import { LIMITS } from "./limits.js";

export const CURRENCIES = ["USD", "LBP"];

/**
 * Today's date as YYYY-MM-DD in the user's own time zone. (toISOString would
 * give the UTC date, which is "tomorrow" or "yesterday" for part of the day.)
 * @param {Date} [now]
 * @returns {string}
 */
export function todayLocal(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
function isRealDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * Validates the add-a-fill-up form. All three fields are required and the two
 * numbers must be positive.
 * @param {{ date: string, liters: string, cost: string }} values - raw form text.
 * @param {string} [today] - today's date (YYYY-MM-DD); a parameter so tests can pin it.
 * @returns {{ date?: string, liters?: string, cost?: string }} a message per invalid field; {} when valid.
 */
export function getFillUpErrors({ date, liters, cost }, today = todayLocal()) {
  const errors = {};

  if (!date) {
    errors.date = "Choose the date of the fill-up.";
  } else if (!isRealDate(date)) {
    errors.date = "That isn't a valid date.";
  } else if (date > today) {
    errors.date = "The date can't be in the future.";
  } else if (date < LIMITS.MIN_FILL_DATE) {
    errors.date = "That date is too far in the past.";
  }

  const litersText = String(liters ?? "").trim();
  const litersNumber = Number(litersText);
  if (litersText === "") {
    errors.liters = "Liters are required.";
  } else if (!Number.isFinite(litersNumber) || litersNumber <= 0) {
    errors.liters = "Liters must be a number greater than 0.";
  } else if (litersNumber > LIMITS.MAX_FILL_LITERS) {
    errors.liters = `Liters must be ${LIMITS.MAX_FILL_LITERS} or less.`;
  }

  const costText = String(cost ?? "").trim();
  const costNumber = Number(costText);
  if (costText === "") {
    errors.cost = "Cost is required.";
  } else if (!Number.isFinite(costNumber) || costNumber <= 0) {
    errors.cost = "Cost must be a number greater than 0.";
  } else if (costNumber > LIMITS.MAX_FILL_COST) {
    errors.cost = "That cost is too large.";
  }

  return errors;
}

/**
 * What a liter cost on this fill-up, in the currency the cost was entered in.
 * @param {{ liters: number | string, cost_amount: number | string }} entry
 * @returns {number | null} null when the liters are missing or not positive.
 */
export function pricePerLiter(entry) {
  const liters = Number(entry.liters);
  const cost = Number(entry.cost_amount);
  if (!Number.isFinite(liters) || liters <= 0 || !Number.isFinite(cost)) return null;
  return cost / liters;
}

/**
 * Newest fill-up first: by the date filled, then by when it was logged (so two
 * fill-ups on the same day keep the later entry on top). Returns a new array.
 * @param {{ filled_at: string, created_at?: string }[]} entries
 */
export function sortFillUps(entries) {
  return [...entries].sort(
    (a, b) =>
      b.filled_at.localeCompare(a.filled_at) ||
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );
}

/**
 * An amount in its own currency: "$30.00" for USD, "2,691,000 LBP" for LBP
 * (Lebanese pounds have no useful decimals).
 * @param {number} amount
 * @param {"USD" | "LBP"} currency
 * @returns {string}
 */
export function formatFillUpMoney(amount, currency) {
  if (currency === "LBP") return `${Math.round(amount).toLocaleString("en-US")} LBP`;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Liters with up to two decimals and no trailing zeros: 19.6 -> "19.6", 30 -> "30". */
export function formatLiters(liters) {
  return Number(liters).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Fixed month names: Intl's short month differs between browsers and versions
// ("Sep" vs "Sept"), and a log reads better when every date looks the same.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-21" -> "21 Sep 2026". Built from the text's own parts, so there is
 * no time-zone shift (parsing it as a Date would treat it as UTC midnight).
 * @param {string} isoDate - YYYY-MM-DD
 * @returns {string} the original text if it isn't a real date.
 */
export function formatFillDate(isoDate) {
  if (!isRealDate(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}
