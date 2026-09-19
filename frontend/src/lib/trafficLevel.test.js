// Tests for getTrafficLevel (CAR-46): each of the three ranges with
// sample duration pairs, the exact boundaries (10% -> Moderate, 30% ->
// Moderate, just over 30% -> Heavy), and unusable input returning null.

import { describe, expect, it } from "vitest";
import { getTrafficLevel } from "./trafficLevel.js";

describe("getTrafficLevel", () => {
  it("is Light under a 10% slowdown", () => {
    expect(getTrafficLevel(60, 62)).toEqual({ level: "light", label: "Light Traffic" });
    expect(getTrafficLevel(60, 60).level).toBe("light");
  });

  it("is Moderate for a 10-30% slowdown", () => {
    expect(getTrafficLevel(60, 72)).toEqual({
      level: "moderate",
      label: "Moderate Traffic",
    });
  });

  it("is Heavy over a 30% slowdown", () => {
    expect(getTrafficLevel(60, 90)).toEqual({ level: "heavy", label: "Heavy Traffic" });
  });

  it("treats exactly 10% as Moderate and exactly 30% as Moderate (inclusive upper bounds)", () => {
    expect(getTrafficLevel(100, 110).level).toBe("moderate");
    expect(getTrafficLevel(100, 130).level).toBe("moderate");
    expect(getTrafficLevel(100, 131).level).toBe("heavy");
    expect(getTrafficLevel(100, 109).level).toBe("light");
  });

  it("treats a traffic duration below the baseline as Light (edge case)", () => {
    expect(getTrafficLevel(60, 55).level).toBe("light");
  });

  it("returns null for an unusable baseline (no indicator rather than a wrong one)", () => {
    expect(getTrafficLevel(0, 10)).toBeNull();
    expect(getTrafficLevel(-5, 10)).toBeNull();
    expect(getTrafficLevel(undefined, 10)).toBeNull();
    expect(getTrafficLevel(60, undefined)).toBeNull();
  });
});
