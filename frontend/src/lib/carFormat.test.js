// CAR-79: display-only formatting of a car's drivetrain/transmission and the hero spec line. Tidies for display,
// never changes what is stored, never invents a value.

import { describe, expect, it } from "vitest";
import { formatDrivetrain, formatTransmission, heroSpecParts } from "./carFormat.js";

describe("formatDrivetrain", () => {
  it.each([
    ["fwd", "FWD"],
    ["RWD", "RWD"],
    ["  awd  ", "AWD"],
    ["4wd", "4WD"],
    ["4x4", "4x4"],
  ])("shows the known code %s in capitals", (input, expected) => {
    expect(formatDrivetrain(input)).toBe(expected);
  });

  it("capitalises an unknown value rather than guessing", () => {
    expect(formatDrivetrain("wankel-drive")).toBe("Wankel-drive");
  });

  it.each([null, undefined, "", "   "])("returns an empty string for %s", (input) => {
    expect(formatDrivetrain(input)).toBe("");
  });
});

describe("formatTransmission", () => {
  it.each([
    ["automatic", "Automatic"],
    ["Manual", "Manual"],
    ["cvt", "CVT"],
    ["DCT", "DCT"],
    ["  automatic ", "Automatic"],
  ])("shows the known word %s in its usual casing", (input, expected) => {
    expect(formatTransmission(input)).toBe(expected);
  });

  it("capitalises an unknown value", () => {
    expect(formatTransmission("tiptronic")).toBe("Tiptronic");
  });

  it.each([null, undefined, ""])("returns an empty string for %s", (input) => {
    expect(formatTransmission(input)).toBe("");
  });
});

describe("heroSpecParts", () => {
  it("lists drivetrain, transmission, engine, fuel, plate and tank in order, formatted", () => {
    expect(
      heroSpecParts({ drivetrain: "rwd", transmission: "automatic", engine_type: "1.8L Inline-4", fuel_type: "Gasoline", license_plate: "B 123456", fuel_tank_capacity_liters: 62 }),
    ).toEqual(["RWD", "Automatic", "1.8L Inline-4", "Gasoline", "B 123456", "62 L tank"]);
  });

  it("skips anything not set, with no blanks (edge case)", () => {
    expect(heroSpecParts({ drivetrain: "awd", transmission: "", engine_type: null, fuel_type: "Diesel", license_plate: "   ", fuel_tank_capacity_liters: null })).toEqual(["AWD", "Diesel"]);
  });

  it("shows a numeric tank from a Postgres string without extra zeros", () => {
    expect(heroSpecParts({ fuel_tank_capacity_liters: "50.0" })).toEqual(["50 L tank"]);
  });

  it("returns an empty list for a car with none of these set", () => {
    expect(heroSpecParts({ make: "Toyota", model: "Corolla" })).toEqual([]);
  });
});
