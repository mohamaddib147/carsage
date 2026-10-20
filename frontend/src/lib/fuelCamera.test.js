// Tests lib/fuelCamera.js: the client-side photo pre-check (mirrors the
// backend's MAX_FUEL_PHOTO_BYTES / ALLOWED_FUEL_PHOTO_TYPES) and the two
// plausibility warnings (price per liter vs. today's fuel price, liters
// vs. tank capacity). The third warning the plan calls for (odometer order)
// needs no new code here — it's lib/odometer.js's existing
// getOdometerOrderWarning, already tested there.

import { describe, expect, it } from "vitest";
import { getFuelPhotoError, getPricePerLiterWarning, getTankCapacityWarning } from "./fuelCamera.js";

function file(type, size) {
  return { type, size };
}

describe("getFuelPhotoError", () => {
  it("accepts a normal JPEG/PNG/WEBP photo", () => {
    expect(getFuelPhotoError(file("image/jpeg", 2_000_000))).toBe("");
    expect(getFuelPhotoError(file("image/png", 500))).toBe("");
    expect(getFuelPhotoError(file("image/webp", 500))).toBe("");
  });

  it("refuses HEIC (the backend doesn't re-encode it) and other non-image types", () => {
    expect(getFuelPhotoError(file("image/heic", 500))).toMatch(/JPEG, PNG or WEBP/);
    expect(getFuelPhotoError(file("application/pdf", 500))).toMatch(/JPEG, PNG or WEBP/);
  });

  it("refuses an oversized file (over 8 MB)", () => {
    expect(getFuelPhotoError(file("image/jpeg", 8 * 1024 * 1024 + 1))).toMatch(/too large/);
    expect(getFuelPhotoError(file("image/jpeg", 8 * 1024 * 1024))).toBe("");
  });

  it("refuses an empty file", () => {
    expect(getFuelPhotoError(file("image/jpeg", 0))).toMatch(/empty/);
  });
});

describe("getPricePerLiterWarning", () => {
  const currentPrice = 150_000; // LBP per liter

  it("says nothing for a price close to today's fuel price", () => {
    // 20 L for 3,000,000 LBP = 150,000/L, exactly today's price.
    expect(getPricePerLiterWarning(20, 3_000_000, "LBP", currentPrice)).toBe("");
  });

  it("warns when the price per liter is far below today's price (e.g. a dropped digit)", () => {
    expect(getPricePerLiterWarning(20, 300_000, "LBP", currentPrice)).toMatch(/far from today's fuel price/);
  });

  it("warns when the price per liter is far above today's price (e.g. an extra digit)", () => {
    expect(getPricePerLiterWarning(20, 30_000_000, "LBP", currentPrice)).toMatch(/far from today's fuel price/);
  });

  it("converts a USD cost before comparing against the LBP reference price", () => {
    // $33.50 for 20 L = $1.675/L; at the fixed rate that's close to 150,000 LBP/L.
    expect(getPricePerLiterWarning(20, 33.5, "USD", currentPrice)).toBe("");
  });

  it("says nothing when any input is blank, zero, or not a usable number", () => {
    expect(getPricePerLiterWarning("", 3_000_000, "LBP", currentPrice)).toBe("");
    expect(getPricePerLiterWarning(20, "", "LBP", currentPrice)).toBe("");
    expect(getPricePerLiterWarning(0, 3_000_000, "LBP", currentPrice)).toBe("");
    expect(getPricePerLiterWarning(20, 3_000_000, "LBP", null)).toBe("");
    expect(getPricePerLiterWarning(20, 3_000_000, "LBP", undefined)).toBe("");
  });
});

describe("getTankCapacityWarning", () => {
  it("says nothing when liters are within the tank's capacity", () => {
    expect(getTankCapacityWarning(45, 60)).toBe("");
    expect(getTankCapacityWarning(60, 60)).toBe(""); // exactly full is fine
  });

  it("warns when liters exceed the car's tank capacity, naming it", () => {
    expect(getTankCapacityWarning(65, 60)).toBe(
      "This is more than your car's tank capacity (60 L). Check the scanned amount, or enter it manually.",
    );
  });

  it("says nothing when liters or tank capacity are blank, zero, or not a usable number", () => {
    expect(getTankCapacityWarning("", 60)).toBe("");
    expect(getTankCapacityWarning(65, null)).toBe("");
    expect(getTankCapacityWarning(65, 0)).toBe("");
    expect(getTankCapacityWarning(0, 60)).toBe("");
  });
});
