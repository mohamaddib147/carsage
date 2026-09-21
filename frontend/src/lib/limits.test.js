// Tests for the shared client-side limits (CAR-23): every validator accepts
// blank/valid values, rejects out-of-range ones at the exact boundary, and
// a database rule violation is described without leaking constraint names.

import { describe, expect, it } from "vitest";
import {
  GENERIC_ERROR_MESSAGE,
  LIMITS,
  NETWORK_ERROR_MESSAGE,
  PERMISSION_ERROR_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  describeActionError,
  describeAuthError,
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

  it("never shows the raw text of an unclassified error (CAR-25) — a generic sentence instead", () => {
    expect(describeSaveError({ message: 'relation "public.cars" does not exist' })).toBe(
      "Could not save. Please try again.",
    );
    expect(describeSaveError(null)).toBe("Could not save. Please try again.");
    expect(describeSaveError({})).toBe("Could not save. Please try again.");
  });

  it("describes a network failure, an ended session and a permission rejection in plain words", () => {
    expect(describeSaveError({ message: "TypeError: Failed to fetch" })).toBe(NETWORK_ERROR_MESSAGE);
    expect(describeSaveError({ code: "PGRST301", message: "JWT expired" })).toBe(SESSION_EXPIRED_MESSAGE);
    expect(
      describeSaveError({ code: "42501", message: 'new row violates row-level security policy for table "cars"' }),
    ).toBe(PERMISSION_ERROR_MESSAGE);
  });
});

describe("describeActionError (CAR-25)", () => {
  it("uses the caller's fallback for anything it cannot classify, never the raw message", () => {
    const message = describeActionError({ code: "XX000", message: "internal: /srv/app/db.c:12" }, "Could not delete.");

    expect(message).toBe("Could not delete.");
  });

  it("classifies network failures, expired sessions and permission errors before the fallback", () => {
    expect(describeActionError({ name: "AuthRetryableFetchError", message: "x" }, "f")).toBe(NETWORK_ERROR_MESSAGE);
    expect(describeActionError({ message: "Load failed" }, "f")).toBe(NETWORK_ERROR_MESSAGE);
    expect(describeActionError({ code: "PGRST303", message: "x" }, "f")).toBe(SESSION_EXPIRED_MESSAGE);
    expect(describeActionError({ code: "42501" }, "f")).toBe(PERMISSION_ERROR_MESSAGE);
  });

  it("copes with no error object at all", () => {
    expect(describeActionError(undefined, "Fallback text")).toBe("Fallback text");
  });
});

describe("describeAuthError (CAR-25)", () => {
  it.each([
    ["invalid_credentials", "Invalid login credentials"],
    ["user_already_exists", "User already registered"],
    ["email_exists", "User already registered"],
    ["weak_password", "That password is too weak or too easy to guess. Please choose a stronger one."],
    ["over_email_send_rate_limit", "Too many attempts. Please wait a moment and try again."],
    ["over_request_rate_limit", "Too many attempts. Please wait a moment and try again."],
    ["email_address_invalid", "Please enter a valid email address."],
  ])("maps the Supabase Auth code %s to a plain sentence", (code, expected) => {
    expect(describeAuthError({ code, message: "raw provider wording that is not shown" })).toBe(expected);
  });

  it.each([
    "Invalid login credentials",
    "User already registered",
    "Email not confirmed",
    "Password should be at least 6 characters.",
  ])("keeps the user-meant Supabase message %j when it carries no code", (message) => {
    expect(describeAuthError({ message })).toBe(message);
  });

  it.each([
    "Database error saving new user",
    "Error sending confirmation email",
    "duplicate key value violates unique constraint \"users_email_key\"",
    "Internal server error at /var/app/gotrue/api.go:214",
  ])("replaces server-side wording %j with a generic sentence", (message) => {
    const shown = describeAuthError({ message });

    expect(shown).toBe(GENERIC_ERROR_MESSAGE);
    expect(shown).not.toContain(message);
  });

  it("describes a network failure in plain words and copes with no error object", () => {
    expect(describeAuthError({ name: "AuthRetryableFetchError", message: "Failed to fetch" })).toBe(
      NETWORK_ERROR_MESSAGE,
    );
    expect(describeAuthError(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
