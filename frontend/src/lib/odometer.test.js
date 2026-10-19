// Tests lib/odometer.js (CAR-61): validating a reading (blank, not a whole number,
// 0, above the 2,000,000 km database ceiling, lower or equal to the previous
// reading, higher than a later one, a backdated reading between two others), the
// distance-since-last hint and its typo warning, per-fill-up km/L (legacy rows with
// no reading, a gap that breaks the chain, implausible intervals), the weighted real
// average, and the car's latest reading. Mirrors backend/tests/test_real_efficiency.py.

import { describe, expect, it } from "vitest";
import {
  distanceSincePrevious,
  fillUpEfficiencies,
  formatKm,
  formatKmPerLiter,
  getOdometerError,
  getOdometerOrderWarning,
  latestOdometer,
  readingOf,
  realEfficiency,
} from "./odometer.js";

/** One fill-up on 2026-09-<day>. */
function entry(id, day, odometer, liters = 10, time = "10:00") {
  const date = `2026-09-${String(day).padStart(2, "0")}`;
  return { id, filled_at: date, created_at: `${date}T${time}:00Z`, liters: String(liters), odometer_km: odometer };
}

describe("readingOf", () => {
  it("reads numbers and numeric strings, and treats missing or unusable values as no reading", () => {
    expect(readingOf({ odometer_km: 84250 })).toBe(84250);
    expect(readingOf({ odometer_km: "84250" })).toBe(84250);
    for (const value of [null, undefined, "", "abc", 0, -5, true, Number.NaN]) {
      expect(readingOf({ odometer_km: value })).toBeNull();
    }
  });
});

describe("getOdometerError (hard checks: what the database itself refuses)", () => {
  it("is optional: a blank field is fine", () => {
    expect(getOdometerError("")).toBeUndefined();
  });

  it("refuses anything that isn't a whole number of km", () => {
    for (const text of ["84250.5", "84k", "-100"]) {
      expect(getOdometerError(text)).toBe("Enter the odometer as a whole number of km.");
    }
  });

  it("refuses 0 and anything above the 2,000,000 km database limit", () => {
    expect(getOdometerError("0")).toBe("The odometer reading must be greater than 0.");
    expect(getOdometerError("2000001")).toMatch(/too large .*2,000,000 km.*extra digit/);
    expect(getOdometerError("2000000")).toBeUndefined();
  });

  it("does NOT judge reading order (that is only a warning, see below)", () => {
    expect(getOdometerError("1")).toBeUndefined();
  });
});

describe("getOdometerOrderWarning (soft check, overridable with Save anyway)", () => {
  // 750 km on 60 L = 12.5 km/L: a realistic interval, so both readings count.
  const log = [entry("a", 1, 84250), entry("b", 20, 85000, 60)];

  it("says nothing for a reading between the previous and the next one (normal case)", () => {
    expect(getOdometerOrderWarning("84610", "2026-09-10", log)).toBeUndefined();
  });

  it("says nothing for a blank or invalid reading (the hard check reports that)", () => {
    expect(getOdometerOrderWarning("", "2026-09-10", log)).toBeUndefined();
    expect(getOdometerOrderWarning("0", "2026-09-10", log)).toBeUndefined();
  });

  it("warns about a reading lower than OR equal to the previous one, naming it", () => {
    expect(getOdometerOrderWarning("84000", "2026-09-10", log)).toBe(
      "This isn't higher than your previous reading of 84,250 km (1 Sep 2026). Odometers only go up, so check it for a typo.",
    );
    expect(getOdometerOrderWarning("84250", "2026-09-10", log)).toMatch(/^This isn't higher than your previous reading of 84,250 km/);
  });

  it("warns about a backdated reading that isn't below a LATER reading", () => {
    expect(getOdometerOrderWarning("85000", "2026-09-10", log)).toBe(
      "This isn't lower than your later reading of 85,000 km (20 Sep 2026). Check the reading and the date.",
    );
  });

  it("treats an existing same-day fill-up as earlier than the one being added", () => {
    expect(getOdometerOrderWarning("84250", "2026-09-01", log)).toMatch(/^This isn't higher/);
    expect(getOdometerOrderWarning("84300", "2026-09-01", log)).toBeUndefined();
  });

  it("doesn't use an already-flagged (saved typo) reading as the previous one", () => {
    // 84,250 -> 846,100 (an extra digit, already flagged) -> the real 84,900 needs no warning.
    const withTypo = [entry("a", 1, 84250, 35), entry("b", 9, 846100, 40)];
    expect(getOdometerOrderWarning("84900", "2026-09-15", withTypo)).toBeUndefined();
    expect(getOdometerOrderWarning("84000", "2026-09-15", withTypo)).toMatch(/previous reading of 84,250 km/);
  });

  it("ignores fill-ups without a reading when looking for the previous one", () => {
    const withLegacy = [entry("a", 1, 84250), entry("b", 5, null)];
    expect(getOdometerOrderWarning("84200", "2026-09-10", withLegacy)).toMatch(/84,250 km/);
  });
});

describe("distanceSincePrevious", () => {
  const log = [entry("a", 1, 84250)];

  it("gives the km since the last reading, for the typo-spotting hint", () => {
    expect(distanceSincePrevious("84610", "2026-09-09", log, "40")).toEqual({
      distanceKm: 360,
      previousKm: 84250,
      implausible: false,
    });
  });

  it("flags an extra digit as implausible for the liters typed", () => {
    // 842,610 - 84,250 = 758,360 km on 40 L.
    expect(distanceSincePrevious("842610", "2026-09-09", log, "40").implausible).toBe(true);
  });

  it("doesn't flag anything before liters are typed", () => {
    expect(distanceSincePrevious("842610", "2026-09-09", log, "").implausible).toBe(false);
  });

  it("is null with no earlier reading, a blank field, or an invalid reading", () => {
    expect(distanceSincePrevious("84610", "2026-09-09", [], "40")).toBeNull();
    expect(distanceSincePrevious("", "2026-09-09", log, "40")).toBeNull();
    expect(distanceSincePrevious("84000", "2026-09-09", log, "40")).toBeNull();
  });
});

describe("fillUpEfficiencies", () => {
  it("gives km/L on the later of two fill-ups that both have a reading (the ticket's example)", () => {
    const result = fillUpEfficiencies([entry("a", 1, 84250, 35), entry("b", 9, 84610, 40)]);

    expect(result.get("a")).toBeUndefined(); // the first fill-up has nothing before it
    expect(result.get("b")).toEqual({ distanceKm: 360, kmPerLiter: 9, plausible: true });
  });

  it("gives nothing for legacy fill-ups without readings", () => {
    expect(fillUpEfficiencies([entry("a", 1, null), entry("b", 2, null)]).size).toBe(0);
  });

  it("does not skip over a fill-up with no reading (that would overstate km/L)", () => {
    const result = fillUpEfficiencies([entry("a", 1, 1000), entry("b", 2, null), entry("c", 3, 1180)]);

    expect(result.size).toBe(0);
  });

  it("marks an implausible interval (an extra digit, miles mixed with km) instead of hiding it", () => {
    const extraDigit = fillUpEfficiencies([entry("a", 1, 1000), entry("b", 2, 10090)]);
    const milesThenKm = fillUpEfficiencies([entry("a", 1, 600), entry("b", 2, 1100)]);

    expect(extraDigit.get("b").plausible).toBe(false);
    expect(milesThenKm.get("b").plausible).toBe(false); // 500 km on 10 L = 50 km/L
  });

  it("works on the fill-ups in date order whatever order they arrive in", () => {
    const result = fillUpEfficiencies([entry("c", 3, 1180), entry("a", 1, 1000), entry("b", 2, 1090)]);

    expect(result.get("b").kmPerLiter).toBe(9);
    expect(result.get("c").kmPerLiter).toBe(9);
  });

  it("orders same-day fill-ups by when they were logged (filled_at, then created_at)", () => {
    // Two fill-ups on day 2: logged 08:00 (1,090 km) and 18:00 (1,180 km).
    // Ordered by created_at they are both 90 km intervals; reversed, the 18:00
    // one would come first and both intervals would be wrong.
    const result = fillUpEfficiencies([
      entry("late", 2, 1180, 10, "18:00"),
      entry("first", 1, 1000),
      entry("early", 2, 1090, 10, "08:00"),
    ]);

    expect(result.get("early")).toEqual({ distanceKm: 90, kmPerLiter: 9, plausible: true });
    expect(result.get("late")).toEqual({ distanceKm: 90, kmPerLiter: 9, plausible: true });
  });
});

describe("realEfficiency", () => {
  it("weights by distance: total km / total liters, not a mean of ratios", () => {
    // 100 km on 10 L (10 km/L) then 400 km on 20 L (20 km/L): 500 / 30 = 16.67, not 15.
    const result = realEfficiency([entry("a", 1, 1000), entry("b", 2, 1100, 10), entry("c", 3, 1500, 20)]);

    expect(result.kmPerLiter).toBeCloseTo(500 / 30);
    expect(result.intervalCount).toBe(2);
    expect(result.distanceKm).toBe(500);
  });

  it("is null (never 0 or NaN) with no fill-ups, one fill-up, or only legacy ones", () => {
    expect(realEfficiency([])).toBeNull();
    expect(realEfficiency([entry("a", 1, 84250)])).toBeNull();
    expect(realEfficiency([entry("a", 1, null), entry("b", 2, null)])).toBeNull();
  });

  it("leaves implausible intervals out of the average", () => {
    const result = realEfficiency([entry("a", 1, 1000), entry("b", 2, 1090), entry("c", 3, 99999)]);

    expect(result).toEqual({ kmPerLiter: 9, intervalCount: 1, distanceKm: 90 });
  });
});

describe("latestOdometer", () => {
  it("is the latest reading by fill-up date, skipping fill-ups without one", () => {
    const log = [entry("b", 9, 84610), entry("c", 12, null), entry("a", 1, 84250)];

    expect(latestOdometer(log)).toEqual({ km: 84610, filledAt: "2026-09-09" });
  });

  it("is null when no fill-up has a reading", () => {
    expect(latestOdometer([])).toBeNull();
    expect(latestOdometer([entry("a", 1, null)])).toBeNull();
  });
});

describe("formatting", () => {
  it("formats km with separators and km/L with one decimal", () => {
    expect(formatKm(84250)).toBe("84,250 km");
    expect(formatKmPerLiter(9)).toBe("9.0");
    expect(formatKmPerLiter(500 / 30)).toBe("16.7");
  });
});
