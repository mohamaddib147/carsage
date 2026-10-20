// Client-side helpers for the Fuel Log's two camera buttons (Step 2, no
// Jira task yet): scanning a fuel pump's display and a car's odometer via
// the backend (POST /fuel-log/scan-pump, /fuel-log/scan-odometer), which
// read the photo through Gemini vision and never store it.
//
// Three plausibility warnings the scanned fields get checked against
// before the user saves (never auto-saved — these only ever add a
// dismissible warning next to the field, same "Save anyway" pattern as
// the existing odometer-order warning in lib/odometer.js):
//   - the price per liter is far from today's known fuel price (catches a
//     misread digit, e.g. an extra zero)
//   - the liters scanned are more than the car's own tank capacity
//   - the odometer reading isn't higher than the car's previous one —
//     this one needs no new code: lib/odometer.js's existing
//     getOdometerOrderWarning already runs on whatever is in the field,
//     scanned or typed.

import { convertAmount } from "./currency.js";

export const MAX_FUEL_PHOTO_BYTES = 8 * 1024 * 1024;
export const ALLOWED_FUEL_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Client-side pre-check for a pump/odometer photo, before it's uploaded.
 * Mirrors the backend's own check (backend/app/validation.py's
 * MAX_FUEL_PHOTO_BYTES/ALLOWED_FUEL_PHOTO_TYPES) — this is just fast,
 * friendly feedback; the backend's check still applies regardless.
 * @param {File} file
 * @returns {string} an error message, or "" if the file looks fine.
 */
export function getFuelPhotoError(file) {
  if (!ALLOWED_FUEL_PHOTO_TYPES.has(file.type)) {
    return "Please choose a JPEG, PNG or WEBP photo.";
  }
  if (file.size > MAX_FUEL_PHOTO_BYTES) {
    return "That image is too large. Please use a photo under 8 MB.";
  }
  if (file.size === 0) {
    return "That image appears to be empty. Please try again.";
  }
  return "";
}

// A scanned price per liter outside this band of today's known price is
// flagged rather than trusted outright — wide enough that it only ever
// catches a real misread (e.g. a missing/extra digit), never a normal
// price difference between fuel types or stations.
const PRICE_WARNING_RATIO_LOW = 0.5;
const PRICE_WARNING_RATIO_HIGH = 2;

/**
 * Warns when a fill-up's price per liter is far from today's known fuel
 * price — most often a sign the pump photo was misread (e.g. a dropped or
 * doubled digit), rather than an actual price difference.
 * @param {string | number} liters
 * @param {string | number} costAmount
 * @param {"USD" | "LBP"} costCurrency
 * @param {number | null | undefined} currentPriceLbpPerLiter - today's known price, in LBP (e.g. 95-octane's).
 * @returns {string} a warning message, or "" if there's nothing to flag.
 */
export function getPricePerLiterWarning(liters, costAmount, costCurrency, currentPriceLbpPerLiter) {
  const litersNumber = Number(liters);
  const costNumber = Number(costAmount);
  if (!Number.isFinite(litersNumber) || litersNumber <= 0) return "";
  if (!Number.isFinite(costNumber) || costNumber <= 0) return "";
  if (!Number.isFinite(currentPriceLbpPerLiter) || currentPriceLbpPerLiter <= 0) return "";

  const costLbp = convertAmount(costNumber, costCurrency, "LBP");
  const pricePerLiter = costLbp / litersNumber;
  if (
    pricePerLiter < currentPriceLbpPerLiter * PRICE_WARNING_RATIO_LOW ||
    pricePerLiter > currentPriceLbpPerLiter * PRICE_WARNING_RATIO_HIGH
  ) {
    return "This price per liter looks far from today's fuel price. Check the scanned amount, or enter it manually.";
  }
  return "";
}

/**
 * Warns when the liters scanned from a pump photo are more than the
 * car's own tank capacity — a sign of a misread digit rather than a real
 * fill-up (no car can take more than its own tank holds).
 * @param {string | number} liters
 * @param {number | null | undefined} tankCapacityLiters
 * @returns {string} a warning message, or "" if there's nothing to flag.
 */
export function getTankCapacityWarning(liters, tankCapacityLiters) {
  const litersNumber = Number(liters);
  const tankNumber = Number(tankCapacityLiters);
  if (!Number.isFinite(litersNumber) || litersNumber <= 0) return "";
  if (!Number.isFinite(tankNumber) || tankNumber <= 0) return "";
  if (litersNumber > tankNumber) {
    return `This is more than your car's tank capacity (${tankNumber} L). Check the scanned amount, or enter it manually.`;
  }
  return "";
}
