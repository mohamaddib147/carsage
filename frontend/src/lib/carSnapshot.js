// One car at a glance for the Dashboard (CAR-78): its odometer, fuel economy, last fill-up and next
// service. Pure; built only from the existing helpers, so each figure is the one the other screens show:
//   * odometer     - latestOdometer(), as the Maintenance page uses;
//   * economy      - realEfficiency() under the Trip Planner's rule (meetsTripPlannerFloor, mirroring the
//                    backend gate): the real average once it rests on enough fill-ups and km, else the car's
//                    rated km/L, else "not enough data yet". The same choice Trip Planner makes for its estimate,
//                    including falling back to the rated figure when the fill-ups could not be read;
//   * lastFillUp   - the newest fill-up by sortFillUps(), as the Fuel Log lists them;
//   * nextService  - the most urgent maintenance item by maintenanceStatus() and sortByUrgency().
// Every figure comes from THIS car's rows only (filtered by car_id here, whatever the caller passes), and is
// never NaN, zero or made up: a missing figure is null, and the economy says which source it is.

import { sortFillUps } from "./fuelLog.js";
import { maintenanceStatus, sortByUrgency } from "./maintenance.js";
import { latestOdometer, meetsTripPlannerFloor, realEfficiency } from "./odometer.js";

export const ECONOMY_SOURCE = {
  REAL: "real",
  RATED: "rated",
  NONE: "none", // not enough fill-ups and no rated figure
  UNAVAILABLE: "unavailable", // the fill-ups could not be read and there is no rated figure
};

/** The words that go with each economy source. */
export const ECONOMY_LABELS = {
  [ECONOMY_SOURCE.REAL]: "Real average",
  [ECONOMY_SOURCE.RATED]: "Rated",
  [ECONOMY_SOURCE.NONE]: "Not enough data yet",
  [ECONOMY_SOURCE.UNAVAILABLE]: "Couldn't load your fill-ups",
};

/** A positive finite number, or null. */
function positive(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * The car's economy under the Trip Planner rule.
 * @param {object[] | null} fillUps - this car's fill-ups, or null when they could not be read.
 * @param {number | string | null | undefined} rated - the car's fuel_efficiency.
 * @returns {{ source: string, kmPerLiter: number | null, intervalCount: number, distanceKm: number }}
 */
export function economyOf(fillUps, rated) {
  const real = fillUps ? realEfficiency(fillUps) : null;
  const measured = { intervalCount: real?.intervalCount ?? 0, distanceKm: real?.distanceKm ?? 0 };
  if (meetsTripPlannerFloor(real) && positive(real.kmPerLiter) != null) {
    return { source: ECONOMY_SOURCE.REAL, kmPerLiter: real.kmPerLiter, ...measured };
  }
  const ratedKmPerLiter = positive(rated);
  if (ratedKmPerLiter != null) return { source: ECONOMY_SOURCE.RATED, kmPerLiter: ratedKmPerLiter, ...measured };
  return { source: fillUps ? ECONOMY_SOURCE.NONE : ECONOMY_SOURCE.UNAVAILABLE, kmPerLiter: null, ...measured };
}

/**
 * @param {object} car - a `cars` row.
 * @param {{ fuelLogs: object[] | null, maintenanceItems: object[] | null, today: string }} data -
 *   the user's fill-ups and maintenance items (any car; null when that request failed) and today's Beirut date.
 * @returns {{
 *   odometer: { km: number, filledAt: string } | null,
 *   economy: { source: string, kmPerLiter: number | null, intervalCount: number, distanceKm: number },
 *   lastFillUp: { filledAt: string, liters: number | null, costAmount: number | null, costCurrency: string | null } | null,
 *   nextService: { item: object, status: object } | null,
 *   fuelLogsFailed: boolean,
 *   maintenanceFailed: boolean,
 * }}
 */
export function carSnapshot(car, { fuelLogs, maintenanceItems, today }) {
  const fillUps = fuelLogs ? fuelLogs.filter((row) => row.car_id === car.id) : null;
  const odometer = fillUps ? latestOdometer(fillUps) : null;

  const newest = fillUps && fillUps.length > 0 ? sortFillUps(fillUps)[0] : null;
  const lastFillUp = newest
    ? {
        filledAt: newest.filled_at,
        liters: positive(newest.liters),
        costAmount: positive(newest.cost_amount),
        costCurrency: newest.cost_currency ?? null,
      }
    : null;

  let nextService = null;
  if (maintenanceItems) {
    const rows = maintenanceItems
      .filter((item) => item.car_id === car.id)
      .map((item) => ({ item, status: maintenanceStatus(item, item.maintenance_records ?? [], odometer?.km ?? null, today) }));
    nextService = sortByUrgency(rows)[0] ?? null;
  }

  return {
    odometer,
    economy: economyOf(fillUps, car.fuel_efficiency),
    lastFillUp,
    nextService,
    fuelLogsFailed: fuelLogs === null,
    maintenanceFailed: maintenanceItems === null,
  };
}
