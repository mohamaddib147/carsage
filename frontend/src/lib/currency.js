// Currency handling for the whole app (CAR-54): the ONE conversion rate, converting
// between US dollars and Lebanese pounds, formatting money, and remembering which
// currency the user wants shown first. Everything that shows a price (Trip Planner,
// Fuel Log) goes through here, so the rate lives in exactly one place.
//
// The backend keeps its own copy of the rate (backend/app/services/fuel_prices.py)
// for the USD figures in its API replies; backend/tests/test_currency_rate.py fails
// if the two ever differ, so change them together.

/** The fixed conversion rate: 1 US dollar = 89,700 Lebanese pounds. The only place this number is written in the frontend. */
export const LBP_PER_USD = 89_700;

export const CURRENCIES = ["USD", "LBP"];
export const DEFAULT_CURRENCY = "USD";

/** Where the chosen primary currency is kept in the browser (localStorage). */
export const CURRENCY_STORAGE_KEY = "carsage.currency";

/** @param {unknown} value @returns {boolean} true for "USD" or "LBP". */
export function isCurrency(value) {
  return CURRENCIES.includes(value);
}

/** The other one: USD -> LBP, LBP -> USD. */
export function otherCurrency(currency) {
  return currency === "USD" ? "LBP" : "USD";
}

/**
 * Converts an amount between USD and LBP at the fixed rate. No rounding: round
 * only when showing (formatMoney), so nothing is lost by converting twice.
 * @param {number} amount
 * @param {"USD" | "LBP"} from - the currency `amount` is in.
 * @param {"USD" | "LBP"} to
 * @returns {number}
 */
export function convertAmount(amount, from, to) {
  if (from === to) return amount;
  return from === "USD" ? amount * LBP_PER_USD : amount / LBP_PER_USD;
}

/**
 * An amount in its currency: "$30.00" for USD, "2,691,000 LBP" for LBP (Lebanese
 * pounds have no useful decimals).
 * @param {number} amount
 * @param {"USD" | "LBP"} currency
 * @returns {string}
 */
export function formatMoney(amount, currency) {
  if (currency === "LBP") return `${Math.round(amount).toLocaleString("en-US")} LBP`;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The browser's localStorage, or null where it is blocked (some private modes throw on access). */
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * The saved primary currency, or the default (USD) when nothing valid is saved
 * or storage is unavailable. Never throws.
 * @returns {"USD" | "LBP"}
 */
export function readStoredCurrency() {
  try {
    const stored = getStorage()?.getItem(CURRENCY_STORAGE_KEY);
    return isCurrency(stored) ? stored : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

/**
 * Remembers the primary currency for the next visit. If storage is blocked or
 * full the choice simply isn't remembered — the app still works. Never throws.
 * @param {"USD" | "LBP"} currency
 */
export function storeCurrency(currency) {
  try {
    getStorage()?.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}
