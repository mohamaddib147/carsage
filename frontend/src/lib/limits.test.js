// Tests for the shared client-side limits (CAR-23): every validator accepts
// blank/valid values, rejects out-of-range ones at the exact boundary, and
// a database rule violation is described without leaking constraint names.

import { describe, expect, it } from "vitest";
import {
  LIMITS,
  describeSaveError,
  getCarFieldErrors,
  getCylindersError,
  getFuelEfficiencyError,
  getFuelPriceError,
  getLengthError,
} from "./limits.js";

describe("getLengthError", () => {
  it("accepts exactly the maximum, rejects one more, and measures the trimmed text", () => {
    expect(getLengthError("a".repeat(60), 60, "Make")).toBe("");
    expect(getLengthError("a".repeat(61), 60, "Make")).toBe("Make must be 60 characters or fewer.");
    expect(getLengthError("  " + "a".repeat(60) + "  ", 60, "Make")).toBe("");
    expect(getLengthError(null, 60, "Make")).toBe("");
    expect(getLengthError(undefined, 60, "Make")).toBe("");
  });
});

describe("getFuelEfficiencyError", () => {
  it.each([[""], ["  "], [null], ["0.1"], ["12.5"], ["100"], [100]])("accepts %j", (value) => {
    expect(getFuelEfficiencyError(value)).toBe("");
  });

  it.each([["0"], ["-5"], ["100.1"], ["1e9"], ["abc"], ["Infinity"], ["NaN"]])(
    "rejects %j",
    (value) => {
      expect(getFuelEfficiencyError(value)).toBe("Fuel efficiency must be between 0 and 100 km/L.");
    },
  );
});

describe("getCylindersError", () => {
  it.each([[""], [null], ["1"], ["4"], ["16"], [8]])("accepts %j", (value) => {
    expect(getCylindersError(value)).toBe("");
  });

  it.each([["0"], ["-3"], ["17"], ["5000"], ["4.5"], ["abc"]])("rejects %j", (value) => {
    expect(getCylindersError(value)).toBe("Cylinders must be a whole number between 1 and 16.");
  });
});

describe("getFuelPriceError", () => {
  it.each([[""], [null], ["1"], ["140500"], ["10000000"], [90000]])("accepts %j", (value) => {
    expect(getFuelPriceError(value)).toBe("");
  });

  it.each([["0"], ["-1"], ["0.5"], ["10000001"], ["1e300"], ["abc"], ["Infinity"]])(
    "rejects %j",
    (value) => {
      expect(getFuelPriceError(value)).toContain("Fuel price must be between 1 and 10,000,000");
    },
  );
});

describe("getCarFieldErrors", () => {
  it("returns nothing for a normal car and for an empty optional set", () => {
    expect(
      getCarFieldErrors({
        make: "Toyota", model: "Camry", engineType: "Passenger Car", drivetrain: "fwd",
        transmission: "a", licensePlate: "A 12345", vin: "1HGCM82633A004352",
        fuelEfficiency: "11.9", cylinders: "4",
      }),
    ).toEqual({});
    expect(getCarFieldErrors({})).toEqual({});
  });

  it.each([
    ["make", LIMITS.MAKE_MODEL],
    ["model", LIMITS.MAKE_MODEL],
    ["engineType", LIMITS.ENGINE_TYPE],
    ["drivetrain", LIMITS.DRIVETRAIN],
    ["transmission", LIMITS.TRANSMISSION],
    ["licensePlate", LIMITS.LICENSE_PLATE],
    ["vin", LIMITS.VIN],
  ])("flags %s only when it is over %i characters", (field, max) => {
    expect(getCarFieldErrors({ [field]: "x".repeat(max) })).toEqual({});
    expect(Object.keys(getCarFieldErrors({ [field]: "x".repeat(max + 1) }))).toEqual([field]);
  });

  it("flags out-of-range efficiency and cylinders", () => {
    const errors = getCarFieldErrors({ fuelEfficiency: "500", cylinders: "99" });

    expect(Object.keys(errors).sort()).toEqual(["cylinders", "fuelEfficiency"]);
  });
});

describe("describeSaveError", () => {
  it("describes a check-constraint violation without leaking the constraint name", () => {
    const message = describeSaveError({
      code: "23514",
      message: 'new row for relation "cars" violates check constraint "cars_year_range_check"',
    });

    expect(message).toContain("outside the allowed range or length");
    expect(message).not.toMatch(/cars_year_range_check|relation/);
  });

  it("describes other integrity violations (e.g. not-null) generically", () => {
    const message = describeSaveError({ code: "23502", message: 'null value in column "fuel_type"' });

    expect(message).toContain("missing or invalid");
    expect(message).not.toContain("fuel_type");
  });

  it("keeps the message of any other error, with a fallback", () => {
    expect(describeSaveError({ message: "Failed to fetch" })).toBe("Failed to fetch");
    expect(describeSaveError(null)).toBe("Could not save. Please try again.");
    expect(describeSaveError({})).toBe("Could not save. Please try again.");
  });
});
