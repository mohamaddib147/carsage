// Tests for the car-brand theme lookup (CAR-55): known makes return their
// own palette, an unrecognized or missing make falls back to the default
// CarSage theme, and matching is case/whitespace-insensitive.

import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, RECOGNIZED_MAKES, getBrandTheme } from "./carBrandThemes.js";

describe("getBrandTheme", () => {
  it("returns a distinct palette for each recognized make (normal case)", () => {
    const ferrari = getBrandTheme("Ferrari");
    const bmw = getBrandTheme("BMW");

    expect(ferrari).not.toEqual(DEFAULT_THEME);
    expect(bmw).not.toEqual(DEFAULT_THEME);
    expect(ferrari).not.toEqual(bmw);
    expect(ferrari["--color-primary"]).toBe("#d40000");
    expect(bmw["--color-primary"]).toBe("#0066b2");
  });

  it("matches regardless of case or surrounding whitespace", () => {
    expect(getBrandTheme("ferrari")).toEqual(getBrandTheme("FERRARI"));
    expect(getBrandTheme(" Ferrari ")).toEqual(getBrandTheme("Ferrari"));
  });

  it("falls back to the default theme for an unrecognized make (edge case)", () => {
    expect(getBrandTheme("Yugo")).toEqual(DEFAULT_THEME);
  });

  it("falls back to the default theme for null, undefined, or an empty string (edge case)", () => {
    expect(getBrandTheme(null)).toEqual(DEFAULT_THEME);
    expect(getBrandTheme(undefined)).toEqual(DEFAULT_THEME);
    expect(getBrandTheme("")).toEqual(DEFAULT_THEME);
  });

  it("every recognized-make palette only overrides the same keys DEFAULT_THEME defines", () => {
    const defaultKeys = Object.keys(DEFAULT_THEME).sort();
    for (const make of RECOGNIZED_MAKES) {
      expect(Object.keys(getBrandTheme(make)).sort()).toEqual(defaultKeys);
    }
  });

  it("lists at least the makes named in CAR-55's acceptance criteria", () => {
    for (const make of ["mercedes-benz", "ferrari", "bmw", "toyota"]) {
      expect(RECOGNIZED_MAKES).toContain(make);
    }
  });
});
