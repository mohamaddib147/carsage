// CAR-78: lib/carSnapshot.js. Each figure comes from the existing helpers, from this car's rows only, and is never
// NaN, zero or made up. The economy follows the Trip Planner's rule; the shared backend fixtures prove the real
// figure is the one Trip Planner would use, and the floor constants are checked against the backend's.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { carSnapshot, ECONOMY_LABELS, ECONOMY_SOURCE, economyOf } from "./carSnapshot.js";
import { MIN_DISTANCE_FOR_TRIP_PLANNER, MIN_INTERVALS_FOR_TRIP_PLANNER, realEfficiency } from "./odometer.js";

const here = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(resolve(here, "../../../backend/tests/fixtures/efficiency_cases.json"), "utf-8"));
const backendGate = readFileSync(resolve(here, "../../../backend/app/services/real_efficiency.py"), "utf-8");

const TODAY = "2026-10-22";
const CAR = { id: "car-1", make: "Toyota", model: "Corolla", fuel_efficiency: 12 };
const fill = (id, date, odometer, liters, extra = {}) => ({
  id,
  car_id: "car-1",
  filled_at: date,
  created_at: `${date}T09:00:00Z`,
  odometer_km: odometer,
  liters: String(liters),
  cost_amount: "45",
  cost_currency: "USD",
  ...extra,
});
// 3 measured intervals over 1,200 km at 10 km/L: over both Trip Planner floors.
const ENOUGH = [fill("a", "2026-09-01", 10000, 40), fill("b", "2026-09-08", 10400, 40), fill("c", "2026-09-15", 10800, 40), fill("d", "2026-09-22", 11200, 40)];
const snap = (car, fuelLogs, maintenanceItems = []) => carSnapshot(car, { fuelLogs, maintenanceItems, today: TODAY });

function expectNoBadNumber(snapshot) {
  for (const value of [snapshot.odometer?.km, snapshot.economy.kmPerLiter, snapshot.lastFillUp?.liters, snapshot.lastFillUp?.costAmount]) {
    if (value == null) continue;
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  }
}

describe("the economy follows the Trip Planner rule (shared backend fixtures)", () => {
  it("uses the same floors as the backend gate", () => {
    expect(backendGate).toMatch(new RegExp(`^MIN_INTERVALS_FOR_ESTIMATE = ${MIN_INTERVALS_FOR_TRIP_PLANNER}$`, "m"));
    expect(backendGate).toMatch(new RegExp(`^MIN_DISTANCE_KM_FOR_ESTIMATE = ${MIN_DISTANCE_FOR_TRIP_PLANNER}(\\.0)?$`, "m"));
  });

  it.each(cases)("$name", ({ rows, expected }) => {
    const economy = economyOf(rows, 7);
    const tripPlannerUsesReal =
      expected !== null &&
      expected.interval_count >= MIN_INTERVALS_FOR_TRIP_PLANNER &&
      expected.distance_km >= MIN_DISTANCE_FOR_TRIP_PLANNER;
    if (tripPlannerUsesReal) {
      expect(economy.source).toBe(ECONOMY_SOURCE.REAL);
      expect(economy.kmPerLiter).toBeCloseTo(expected.km_per_liter, 9);
    } else {
      expect(economy).toMatchObject({ source: ECONOMY_SOURCE.RATED, kmPerLiter: 7 });
    }
  });
});

describe("carSnapshot", () => {
  it("no data at all: every figure is absent and the economy says why, in words (edge case)", () => {
    const snapshot = snap({ ...CAR, fuel_efficiency: null }, []);
    expect(snapshot).toMatchObject({ odometer: null, lastFillUp: null, nextService: null, fuelLogsFailed: false, maintenanceFailed: false });
    expect(snapshot.economy).toMatchObject({ source: ECONOMY_SOURCE.NONE, kmPerLiter: null });
    expect(ECONOMY_LABELS[snapshot.economy.source]).toBe("Not enough data yet");
  });

  it("a car with no fuel logs but a rated figure shows the rated figure, labelled as rated", () => {
    const snapshot = snap(CAR, []);
    expect(snapshot.economy).toMatchObject({ source: ECONOMY_SOURCE.RATED, kmPerLiter: 12 });
    expect(snapshot.odometer).toBeNull();
    expect(snapshot.lastFillUp).toBeNull();
  });

  it("one reading: the odometer and last fill-up show, the economy stays rated (no interval yet)", () => {
    const snapshot = snap(CAR, [fill("a", "2026-09-01", 84250, 30)]);
    expect(snapshot.odometer).toEqual({ km: 84250, filledAt: "2026-09-01" });
    expect(snapshot.lastFillUp).toEqual({ filledAt: "2026-09-01", liters: 30, costAmount: 45, costCurrency: "USD" });
    expect(snapshot.economy).toMatchObject({ source: ECONOMY_SOURCE.RATED, kmPerLiter: 12, intervalCount: 0 });
  });

  it("below the floor (2 intervals): rated, as Trip Planner does, though a real average exists", () => {
    const rows = ENOUGH.slice(0, 3);
    expect(realEfficiency(rows)).not.toBeNull();
    expect(snap(CAR, rows).economy).toMatchObject({ source: ECONOMY_SOURCE.RATED, kmPerLiter: 12, intervalCount: 2 });
  });

  it("over both floors: the real average, the same number realEfficiency gives", () => {
    const economy = snap(CAR, ENOUGH).economy;
    expect(economy.source).toBe(ECONOMY_SOURCE.REAL);
    expect(economy.kmPerLiter).toBeCloseTo(realEfficiency(ENOUGH).kmPerLiter, 12);
    expect(economy.kmPerLiter).toBeCloseTo(10, 9);
  });

  it("partial fills: the per-step figures swing but the average is the stable run average", () => {
    const rows = [fill("a", "2026-03-01", 10000, 20), fill("b", "2026-03-05", 10400, 10), fill("c", "2026-03-06", 10500, 50), fill("d", "2026-03-20", 11000, 25)];
    expect(snap(CAR, rows).economy.kmPerLiter).toBeCloseTo(1000 / 85, 9);
  });

  it("an unrealistic km/L (a typo reading) is ignored, as the Fuel Log ignores it", () => {
    const rows = [...ENOUGH, fill("e", "2026-09-29", 91600, 40)]; // 80,400 km on 40 L
    const economy = snap(CAR, rows).economy;
    expect(economy.kmPerLiter).toBeCloseTo(10, 9);
    expectNoBadNumber(snap(CAR, rows));
  });

  it("the last fill-up is the newest by date, then by when it was logged; bad numbers become null, never NaN or 0", () => {
    const rows = [
      fill("a", "2026-09-01", null, 30),
      fill("b", "2026-09-21", null, "abc", { cost_amount: "0", created_at: "2026-09-21T08:00:00Z" }),
      fill("c", "2026-09-21", null, 25, { cost_amount: "", created_at: "2026-09-21T10:00:00Z" }),
    ];
    expect(snap(CAR, rows).lastFillUp).toEqual({ filledAt: "2026-09-21", liters: 25, costAmount: null, costCurrency: "USD" });
    expect(snap(CAR, [rows[1]]).lastFillUp).toEqual({ filledAt: "2026-09-21", liters: null, costAmount: null, costCurrency: "USD" });
  });

  it("uses only this car's rows, whatever else is passed in", () => {
    const otherCar = ENOUGH.map((row) => ({ ...row, id: `x-${row.id}`, car_id: "car-2", odometer_km: row.odometer_km + 50000, liters: "20" }));
    const items = [
      { id: "m1", car_id: "car-2", name: "Brakes", interval_months: 1, baseline_date: "2026-01-01" },
      { id: "m2", car_id: "car-1", name: "Oil change", interval_months: 6, baseline_date: "2026-08-01" },
    ];
    const snapshot = snap(CAR, [...otherCar, ...ENOUGH], items);
    expect(snapshot.odometer.km).toBe(11200);
    expect(snapshot.economy.kmPerLiter).toBeCloseTo(10, 9);
    expect(snapshot.nextService.item.name).toBe("Oil change");
    expect(snap({ ...CAR, id: "car-3" }, [...otherCar, ...ENOUGH], items)).toMatchObject({ odometer: null, lastFillUp: null, nextService: null });
  });

  it("the next service is the most urgent item, using this car's own latest reading", () => {
    const items = [
      { id: "m1", car_id: "car-1", name: "Oil change", interval_km: 5000, baseline_date: "2026-01-01", baseline_km: 6500 },
      { id: "m2", car_id: "car-1", name: "Inspection", interval_months: 12, baseline_date: "2026-03-01" },
    ];
    const { nextService } = snap(CAR, ENOUGH, items);
    expect(nextService.item.name).toBe("Oil change");
    expect(nextService.status).toMatchObject({ status: "due_soon", kmLeft: 300 });
  });

  it("fill-ups that failed to load: no odometer or fill-up, the rated figure stays (as Trip Planner falls back)", () => {
    const snapshot = snap(CAR, null);
    expect(snapshot).toMatchObject({ fuelLogsFailed: true, odometer: null, lastFillUp: null });
    expect(snapshot.economy).toMatchObject({ source: ECONOMY_SOURCE.RATED, kmPerLiter: 12 });
    expect(snap({ ...CAR, fuel_efficiency: 0 }, null).economy).toMatchObject({ source: ECONOMY_SOURCE.UNAVAILABLE, kmPerLiter: null });
  });

  it("maintenance that failed to load: no next service, flagged", () => {
    expect(carSnapshot(CAR, { fuelLogs: ENOUGH, maintenanceItems: null, today: TODAY })).toMatchObject({ nextService: null, maintenanceFailed: true });
  });

  it.each([0, -5, "", "abc", null, undefined, true, Number.NaN, Number.POSITIVE_INFINITY])(
    "a rated figure of %s is never shown as a number",
    (rated) => {
      expect(economyOf([], rated)).toMatchObject({ source: ECONOMY_SOURCE.NONE, kmPerLiter: null });
    },
  );
});
