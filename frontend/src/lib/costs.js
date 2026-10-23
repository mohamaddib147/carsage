// Costs beyond fuel (CAR-64): expense categories, the monthly cost of ownership (fuel
// from fuel_logs + other costs from car_expenses), the 6-month chart data, and the
// add-an-expense form's validation. Pure functions; pages/ExpensesPage.jsx and the
// Dashboard's "All cars, this month" tile wire them to Supabase.
//
// MONEY: every amount is stored exactly as typed with its currency (USD or LBP) and is
// converted ONLY through convertAmount() in lib/currency.js, which holds the one rate
// (LBP_PER_USD). This file never contains a rate or multiplies/divides money by a
// literal; a source-scan guard (costs.test.js) fails if it ever does.
//
// MONTHS: a month is the first 7 characters of the date TEXT ("2026-10-31" -> "2026-10").
// Dates are never parsed into Date objects or UTC timestamps here, so an entry on the
// last day of a month can't slip into the next one. "This month" comes from today's
// Beirut date (todayInBeirut in lib/maintenance.js).
//
// EMPTY vs ZERO: a month (or a side of it) with nothing logged is null, never 0, so the
// UI can say "nothing logged" instead of showing a fake $0.00 or NaN.

import { convertAmount } from "./currency.js";
import { LIMITS } from "./limits.js";

/** The fixed category list, in display order. Keys match the car_expenses CHECK constraint. */
export const EXPENSE_CATEGORIES = [
  { key: "repair", label: "Repair" },
  { key: "maintenance", label: "Maintenance" },
  { key: "insurance", label: "Insurance" },
  { key: "registration", label: "Registration / Inspection" },
  { key: "parking", label: "Parking" },
  { key: "car_wash", label: "Car wash" },
  { key: "tolls", label: "Tolls" },
  { key: "fines", label: "Fines" },
  { key: "other", label: "Other" },
];

const CATEGORY_KEYS = new Set(EXPENSE_CATEGORIES.map((category) => category.key));

/** How many month slots the chart always shows (ending with the current month). */
export const CHART_MONTHS = 6;

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "car_wash" -> "Car wash"; an unknown key is shown as-is (never hidden). */
export function categoryLabel(key) {
  return EXPENSE_CATEGORIES.find((category) => category.key === key)?.label ?? String(key ?? "");
}

/**
 * The month of a date written YYYY-MM-DD, taken from the text itself.
 * @param {string} isoDate
 * @returns {string | null} "YYYY-MM", or null for anything that isn't a date string.
 */
export function monthOf(isoDate) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(isoDate ?? "")) ? isoDate.slice(0, 7) : null;
}

/**
 * The `count` months ending with `month`, oldest first, by string arithmetic only.
 * @param {string} month - "YYYY-MM"
 * @param {number} [count]
 * @returns {string[]}
 */
export function monthsEndingWith(month, count = CHART_MONTHS) {
  const [year, monthNumber] = month.split("-").map(Number);
  const months = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const index = year * 12 + (monthNumber - 1) - back;
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`);
  }
  return months;
}

/** "2026-10" -> "October 2026" (or "Oct 2026" when `short`). */
export function formatMonth(month, short = false) {
  const [year, monthNumber] = month.split("-").map(Number);
  const name = MONTH_NAMES[monthNumber - 1];
  return `${short ? name.slice(0, 3) : name} ${year}`;
}

/** A usable positive amount, or null. */
function amountOf(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Fuel logs and expenses as one shape: { kind, date, amount, currency, category }. */
function entriesOf(fuelLogs, expenses) {
  const fuel = (fuelLogs ?? []).map((log) => ({
    kind: "fuel",
    date: log.filled_at,
    amount: amountOf(log.cost_amount),
    currency: log.cost_currency,
  }));
  const other = (expenses ?? []).map((expense) => ({
    kind: "other",
    date: expense.spent_on,
    amount: amountOf(expense.amount),
    currency: expense.currency,
    category: expense.category,
  }));
  return [...fuel, ...other].filter((entry) => entry.amount != null && monthOf(entry.date));
}

/**
 * One month's cost of ownership, converted to `currency`.
 * @param {object[]} fuelLogs - fuel_logs rows (filled_at, cost_amount, cost_currency).
 * @param {object[]} expenses - car_expenses rows (spent_on, category, amount, currency).
 * @param {string} month - "YYYY-MM"
 * @param {"USD" | "LBP"} currency - what to express the sums in.
 * @returns {{ fuel: number | null, other: number | null, total: number | null,
 *   fuelCount: number, expenseCount: number, byCategory: { key: string, label: string, amount: number }[] }}
 *   Each sum is null when nothing of that kind was logged that month.
 */
export function monthlySummary(fuelLogs, expenses, month, currency) {
  let fuel = null;
  let other = null;
  let fuelCount = 0;
  let expenseCount = 0;
  const byCategory = new Map();
  for (const entry of entriesOf(fuelLogs, expenses)) {
    if (monthOf(entry.date) !== month) continue;
    const value = convertAmount(entry.amount, entry.currency, currency);
    if (entry.kind === "fuel") {
      fuel = (fuel ?? 0) + value;
      fuelCount += 1;
    } else {
      other = (other ?? 0) + value;
      expenseCount += 1;
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + value);
    }
  }
  const total = fuel == null && other == null ? null : (fuel ?? 0) + (other ?? 0);
  return {
    fuel,
    other,
    total,
    fuelCount,
    expenseCount,
    byCategory: [...byCategory.entries()]
      .map(([key, amount]) => ({ key, label: categoryLabel(key), amount }))
      .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label)),
  };
}

/**
 * The chart's data: one slot per month (always all of `months`, oldest first), with
 * fuel and other costs converted to `currency`. A month with nothing logged keeps its
 * slot with null values, so the axis never skips a month and no zero-height bar is drawn.
 * @param {object[]} fuelLogs
 * @param {object[]} expenses
 * @param {string[]} months - "YYYY-MM" slots (see monthsEndingWith).
 * @param {"USD" | "LBP"} currency
 * @returns {{ month: string, label: string, fuel: number | null, other: number | null }[]}
 */
export function monthlyChartPoints(fuelLogs, expenses, months, currency) {
  return months.map((month) => {
    const summary = monthlySummary(fuelLogs, expenses, month, currency);
    return { month, label: formatMonth(month, true), fuel: summary.fuel, other: summary.other };
  });
}

/**
 * A short label for the chart's money axis ("$150", "$1.2K", "3.5M LBP"), so big LBP
 * amounts fit without wrapping. Only for the axis: exact amounts are shown elsewhere.
 * @param {number} value - already in `currency`.
 * @param {"USD" | "LBP"} currency
 * @returns {string}
 */
export function formatAxisMoney(value, currency) {
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return currency === "USD" ? `$${compact}` : `${compact} LBP`;
}

/** True when any slot has something to draw. */
export function hasChartData(points) {
  return points.some((point) => point.fuel != null || point.other != null);
}

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30). */
function isRealDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? ""));
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Validates the add-an-expense form. Mirrors the car_expenses CHECK constraints, plus
 * the one rule the database can't check: the date can't be in the future (Beirut).
 * @param {{ date: string, category: string, amount: string, note: string }} values
 * @param {string} today - today's Beirut date (YYYY-MM-DD).
 * @returns {Record<string, string>} a message per invalid field; {} when valid.
 */
export function getExpenseErrors({ date, category, amount, note }, today) {
  const errors = {};
  if (!date) errors.date = "Choose the date of the expense.";
  else if (!isRealDate(date)) errors.date = "That isn't a valid date.";
  else if (date > today) errors.date = "The date can't be in the future.";
  else if (date < LIMITS.MIN_FILL_DATE) errors.date = "That date is too far in the past.";

  if (!category) errors.category = "Choose a category.";
  else if (!CATEGORY_KEYS.has(category)) errors.category = "Choose one of the listed categories.";

  const amountText = String(amount ?? "").trim();
  const amountNumber = Number(amountText);
  if (amountText === "") errors.amount = "Amount is required.";
  else if (!Number.isFinite(amountNumber) || amountNumber <= 0) errors.amount = "Amount must be a number greater than 0.";
  else if (amountNumber > LIMITS.MAX_FILL_COST) errors.amount = "That amount is too large.";

  if (String(note ?? "").length > LIMITS.EXPENSE_NOTE) {
    errors.note = `Keep the note to ${LIMITS.EXPENSE_NOTE} characters.`;
  }
  return errors;
}

/**
 * Newest first: by date, then by when it was logged. Returns a new array.
 * @param {{ spent_on: string, created_at?: string }[]} expenses
 */
export function sortExpenses(expenses) {
  return [...expenses].sort(
    (a, b) =>
      b.spent_on.localeCompare(a.spent_on) ||
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
  );
}
