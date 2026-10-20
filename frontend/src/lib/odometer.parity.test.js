// Parity test (CAR-61 step 1): realEfficiency() here must compute exactly the same
// result as the backend's real_efficiency(), for every shared fixture. The fixtures
// live in backend/tests/fixtures/efficiency_cases.json and are also read by
// backend/tests/test_real_efficiency.py. If both suites pass, the two implementations
// of the no-full-tank km/L method agree on every case.
//
// It also checks the partial-fill property directly: wild per-step figures, stable
// average, first fill-up's liters excluded.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { realEfficiency, fillUpEfficiencies } from "./odometer.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesPath = resolve(here, "../../../backend/tests/fixtures/efficiency_cases.json");
const { cases } = JSON.parse(readFileSync(fixturesPath, "utf-8"));

describe("realEfficiency matches the backend on the shared fixtures", () => {
  it.each(cases)("$name", ({ rows, expected }) => {
    const got = realEfficiency(rows);
    if (expected === null) {
      expect(got).toBeNull();
      return;
    }
    expect(got).not.toBeNull();
    expect(got.intervalCount).toBe(expected.interval_count);
    expect(got.distanceKm).toBeCloseTo(expected.distance_km, 9);
    expect(got.kmPerLiter).toBeCloseTo(expected.km_per_liter, 9);
  });
});

describe("no full-tank assumption", () => {
  const row = (id, date, odometer_km, liters) => ({
    id,
    filled_at: date,
    created_at: `${date}T09:00:00Z`,
    odometer_km,
    liters: String(liters),
  });

  it("gives a stable average though the per-step figures are wild (partial fills)", () => {
    const rows = [row("a", "2026-03-01", 10000, 20), row("b", "2026-03-05", 10400, 10), row("c", "2026-03-06", 10500, 50), row("d", "2026-03-20", 11000, 25)];
    const perStep = [...fillUpEfficiencies(rows).values()].map((s) => Math.round(s.kmPerLiter * 1000) / 1000).sort((x, y) => x - y);
    expect(perStep).toEqual([2, 20, 40]); // genuinely wild per step

    const result = realEfficiency(rows);
    expect(result.distanceKm).toBeCloseTo(1000, 9);
    expect(result.kmPerLiter).toBeCloseTo(1000 / 85, 9); // the first fill's 20 L is not counted

    // Moving fuel between the same two fills (still 60 L total) leaves the average unchanged.
    const moved = [row("a", "2026-03-01", 10000, 20), row("b", "2026-03-05", 10400, 30), row("c", "2026-03-06", 10500, 30), row("d", "2026-03-20", 11000, 25)];
    expect(realEfficiency(moved).kmPerLiter).toBeCloseTo(result.kmPerLiter, 9);
  });

  it("excludes the first fill-up's liters (it only anchors the odometer)", () => {
    const rows = [row("a", "2026-01-01", 1000, 999), row("b", "2026-01-10", 1400, 40)];
    expect(realEfficiency(rows).kmPerLiter).toBeCloseTo(10, 9); // 400/40, not 400/(999+40)
  });

  it("merges a small top-up with the next fill instead of dropping it (the bias fix)", () => {
    const rows = [row("a", "2026-08-01", 10000, 30), row("b", "2026-08-10", 10500, 8), row("c", "2026-08-20", 11000, 58)];
    const result = realEfficiency(rows);
    expect(result.kmPerLiter).toBeCloseTo(1000 / 66, 9); // 15.15, not 8.6
    expect(result.distanceKm).toBeCloseTo(1000, 9);
    expect(result.intervalCount).toBe(2);
  });

  it("still excises a typo inside a run that the backwards check misses", () => {
    const rows = [row("a", "2026-09-01", 84000, 40), row("b", "2026-09-08", 84400, 40), row("c", "2026-09-15", 844500, 40), row("d", "2026-09-22", 844900, 40)];
    const result = realEfficiency(rows);
    expect(result.kmPerLiter).toBeCloseTo(10, 9);
    expect(result.distanceKm).toBeCloseTo(800, 9);
    expect(result.intervalCount).toBe(2);
  });

  it("still splits the run on a backwards reading", () => {
    const rows = [row("a", "2026-10-01", 20000, 40), row("b", "2026-10-08", 20400, 40), row("c", "2026-10-15", 20100, 40), row("d", "2026-10-22", 20500, 40)];
    const result = realEfficiency(rows);
    expect(result.kmPerLiter).toBeCloseTo(10, 9);
    expect(result.distanceKm).toBeCloseTo(800, 9); // the backwards jump is not counted
    expect(result.intervalCount).toBe(2);
  });
});
