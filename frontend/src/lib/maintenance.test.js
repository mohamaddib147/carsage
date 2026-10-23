// Tests lib/maintenance.js (CAR-62): Beirut "today", month arithmetic, the schedule
// (latest completion vs the baseline), every status threshold on both sides
// (14/15 days, due today, 500/501 km, exactly at the due km), date-only, km-only,
// both (the worse wins), no odometer reading, urgency sorting, the due/remaining
// wording, presets, and both forms' validation (including future dates in Beirut).

import { describe, expect, it } from "vitest";
import {
  getCompletionOdometerWarning,
  addMonths,
  dashboardMaintenance,
  itemAnchorId,
  daysBetween,
  DUE_SOON_DAYS,
  DUE_SOON_KM,
  describeDue,
  describeRemaining,
  getCompletionErrors,
  getMaintenanceItemErrors,
  itemFromForm,
  latestRecord,
  maintenanceStatus,
  nextDue,
  PRESETS,
  sortByUrgency,
  STATUS,
  todayInBeirut,
} from "./maintenance.js";

const TODAY = "2026-10-19";

function item(overrides = {}) {
  return { id: "i1", name: "Oil change", interval_km: null, interval_months: null, baseline_date: "2026-04-19", baseline_km: null, ...overrides };
}

describe("todayInBeirut", () => {
  it("is Beirut's date, not UTC's, around midnight", () => {
    // 22:30 UTC on 19 Oct is already 01:30 on 20 Oct in Beirut (UTC+3 in October).
    expect(todayInBeirut(new Date("2026-10-19T22:30:00Z"))).toBe("2026-10-20");
    // 20:59 UTC is 23:59 in Beirut: still the 19th.
    expect(todayInBeirut(new Date("2026-10-19T20:59:00Z"))).toBe("2026-10-19");
  });

  it("follows Beirut's winter time too (UTC+2)", () => {
    // 22:30 UTC on 15 Jan is 00:30 on 16 Jan in Beirut.
    expect(todayInBeirut(new Date("2027-01-15T22:30:00Z"))).toBe("2027-01-16");
    expect(todayInBeirut(new Date("2027-01-15T21:30:00Z"))).toBe("2027-01-15");
  });
});

describe("addMonths and daysBetween", () => {
  it("adds months, clamping to the end of a shorter month", () => {
    expect(addMonths("2026-04-19", 6)).toBe("2026-10-19");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15"); // across a year
    expect(addMonths("2026-01-10", 120)).toBe("2036-01-10");
  });

  it("counts calendar days in either direction, across daylight-saving changes", () => {
    expect(daysBetween("2026-10-19", "2026-11-02")).toBe(14);
    expect(daysBetween("2026-10-19", "2026-10-18")).toBe(-1);
    expect(daysBetween("2026-03-25", "2026-04-01")).toBe(7); // Beirut's clocks change in late March
  });
});

describe("nextDue / latestRecord", () => {
  it("starts from the baseline when there is no completion yet", () => {
    expect(nextDue(item({ interval_km: 5000, interval_months: 6, baseline_km: 84000 }), [])).toEqual({
      lastDoneDate: "2026-04-19",
      lastDoneKm: 84000,
      fromRecord: false,
      dueDate: "2026-10-19",
      dueKm: 89000,
    });
  });

  it("starts from the LATEST completion (by date, then by when it was logged), ignoring the baseline", () => {
    const records = [
      { id: "r1", done_on: "2026-06-01", odometer_km: 86000, created_at: "2026-06-01T10:00:00Z" },
      { id: "r3", done_on: "2026-08-01", odometer_km: 88100, created_at: "2026-08-01T18:00:00Z" },
      { id: "r2", done_on: "2026-08-01", odometer_km: 88000, created_at: "2026-08-01T09:00:00Z" },
    ];
    expect(latestRecord(records).id).toBe("r3");
    expect(nextDue(item({ interval_km: 5000, interval_months: 6, baseline_km: 84000 }), records)).toMatchObject({
      lastDoneDate: "2026-08-01",
      lastDoneKm: 88100,
      fromRecord: true,
      dueDate: "2027-02-01",
      dueKm: 93100,
    });
  });

  it("has no due km when the latest completion has no odometer", () => {
    const records = [{ id: "r1", done_on: "2026-08-01", odometer_km: null }];
    expect(nextDue(item({ interval_km: 5000, baseline_km: 84000 }), records).dueKm).toBeNull();
  });
});

describe("maintenanceStatus: by date", () => {
  const monthly = (baseline) => item({ interval_months: 1, baseline_date: baseline });

  it.each([
    ["due yesterday", "2026-09-18", STATUS.OVERDUE, -1],
    ["due TODAY (Due soon, not Overdue)", "2026-09-19", STATUS.DUE_SOON, 0],
    ["due in 14 days (the edge)", "2026-10-02", STATUS.DUE_SOON, 14], // due 2 Nov
    ["due in 15 days", "2026-10-03", STATUS.OK, 15], // due 3 Nov
  ])("%s", (_label, baseline, status, daysLeft) => {
    const result = maintenanceStatus(monthly(baseline), [], null, TODAY);
    expect(result.status).toBe(status);
    expect(result.daysLeft).toBe(daysLeft);
    expect(result.needsReading).toBe(false); // date-only: no reading needed
  });

  it("uses the documented thresholds", () => {
    expect(DUE_SOON_DAYS).toBe(14);
    expect(DUE_SOON_KM).toBe(500);
  });
});

describe("maintenanceStatus: by km", () => {
  const every5000 = item({ interval_km: 5000, baseline_km: 84000 }); // due at 89,000

  it.each([
    ["1 km past the due km", 89001, STATUS.OVERDUE, -1],
    ["exactly AT the due km", 89000, STATUS.DUE_SOON, 0],
    ["500 km left (the edge)", 88500, STATUS.DUE_SOON, 500],
    ["501 km left", 88499, STATUS.OK, 501],
  ])("%s", (_label, currentKm, status, kmLeft) => {
    const result = maintenanceStatus(every5000, [], currentKm, TODAY);
    expect(result.status).toBe(status);
    expect(result.kmLeft).toBe(kmLeft);
  });

  it("asks for an odometer reading instead of saying OK when the car has none", () => {
    const result = maintenanceStatus(every5000, [], null, TODAY);
    expect(result.status).toBe(STATUS.NEEDS_READING);
    expect(result.needsReading).toBe(true);
    expect(result.kmLeft).toBeNull();
  });
});

describe("maintenanceStatus: km AND date, whichever comes first", () => {
  // Every 5,000 km or 6 months from 19 Apr 2026 at 84,000 km: due 19 Oct 2026 or 89,000 km.
  const both = item({ interval_km: 5000, interval_months: 6, baseline_km: 84000 });

  it("date says Due soon (today), km says OK: Due soon", () => {
    expect(maintenanceStatus(both, [], 85000, TODAY).status).toBe(STATUS.DUE_SOON);
  });

  it("date says OK, km says Overdue: Overdue", () => {
    const later = { ...both, baseline_date: "2026-09-01" };
    expect(maintenanceStatus(later, [], 89500, TODAY).status).toBe(STATUS.OVERDUE);
  });

  it("no reading but the date is already Overdue: shows Overdue, flagged as needing a reading", () => {
    const old = { ...both, baseline_date: "2025-01-01" };
    const result = maintenanceStatus(old, [], null, TODAY);
    expect(result.status).toBe(STATUS.OVERDUE);
    expect(result.needsReading).toBe(true);
  });

  it("no reading and the date is OK: 'Add an odometer reading', never OK", () => {
    const recent = { ...both, baseline_date: "2026-09-01" };
    expect(maintenanceStatus(recent, [], null, TODAY).status).toBe(STATUS.NEEDS_READING);
  });
});

describe("sortByUrgency", () => {
  it("orders Overdue, Due soon, Add an odometer reading, OK; then nearest due first", () => {
    const row = (name, status, daysLeft = null, kmLeft = null) => ({ item: { name }, status: { status, daysLeft, kmLeft } });
    const sorted = sortByUrgency([
      row("ok far", STATUS.OK, 100),
      row("needs reading", STATUS.NEEDS_READING),
      row("soon later", STATUS.DUE_SOON, 10),
      row("overdue", STATUS.OVERDUE, -3),
      row("soon first", STATUS.DUE_SOON, 2),
      row("ok near", STATUS.OK, 20),
    ]);
    expect(sorted.map((r) => r.item.name)).toEqual(["overdue", "soon first", "soon later", "needs reading", "ok near", "ok far"]);
  });
});

describe("wording", () => {
  it("describes the next due date and/or km", () => {
    expect(describeDue({ dueDate: "2027-03-01", dueKm: 89000 })).toBe("Next due: 1 Mar 2027 or at 89,000 km, whichever comes first");
    expect(describeDue({ dueDate: "2027-03-01", dueKm: null })).toBe("Next due: 1 Mar 2027");
    expect(describeDue({ dueDate: null, dueKm: 89000 })).toBe("Next due: at 89,000 km");
    expect(describeDue({ dueDate: null, dueKm: null })).toBe("Next due: needs an odometer reading");
  });

  it("describes what is left or overdue", () => {
    expect(describeRemaining({ daysLeft: 0, kmLeft: null })).toBe("due today");
    expect(describeRemaining({ daysLeft: 1, kmLeft: 450 })).toBe("1 day left, 450 km left");
    expect(describeRemaining({ daysLeft: -3, kmLeft: -120 })).toBe("3 days overdue, 120 km overdue");
  });
});

describe("PRESETS", () => {
  it("are the ticket's five suggestions with their intervals", () => {
    expect(PRESETS).toEqual([
      { name: "Oil change", intervalKm: 5000, intervalMonths: 6 },
      { name: "Tire rotation", intervalKm: 10000, intervalMonths: null },
      { name: "Brake check", intervalKm: 20000, intervalMonths: 12 },
      { name: "Vehicle inspection", intervalKm: null, intervalMonths: 12 },
      { name: "Insurance renewal", intervalKm: null, intervalMonths: 12 },
    ]);
  });
});

describe("getMaintenanceItemErrors", () => {
  const valid = { name: "Oil change", intervalKm: "5000", intervalMonths: "6", baselineDate: TODAY, baselineKm: "84000", notes: "" };

  it("accepts a valid item, and a date-only item with no km at all", () => {
    expect(getMaintenanceItemErrors(valid, TODAY)).toEqual({});
    expect(getMaintenanceItemErrors({ ...valid, intervalKm: "", baselineKm: "" }, TODAY)).toEqual({});
  });

  it.each([
    ["a blank name", { name: "   " }, "name"],
    ["a 61-character name", { name: "x".repeat(61) }, "name"],
    ["no interval at all", { intervalKm: "", intervalMonths: "" }, "interval"],
    ["interval_km 99", { intervalKm: "99" }, "intervalKm"],
    ["interval_km 200,001", { intervalKm: "200001" }, "intervalKm"],
    ["interval_months 0", { intervalMonths: "0" }, "intervalMonths"],
    ["interval_months 121", { intervalMonths: "121" }, "intervalMonths"],
    ["a decimal interval", { intervalMonths: "6.5" }, "intervalMonths"],
    ["a km interval with no baseline km", { baselineKm: "" }, "baselineKm"],
    ["a baseline km of 0", { baselineKm: "0" }, "baselineKm"],
    ["a baseline km over 2,000,000", { baselineKm: "2000001" }, "baselineKm"],
    ["a baseline date TOMORROW in Beirut", { baselineDate: "2026-10-20" }, "baselineDate"],
    ["a missing baseline date", { baselineDate: "" }, "baselineDate"],
    ["an impossible date", { baselineDate: "2026-02-30" }, "baselineDate"],
    ["a date before 2000", { baselineDate: "1999-12-31" }, "baselineDate"],
    ["501-character notes", { notes: "x".repeat(501) }, "notes"],
  ])("refuses %s", (_label, patch, field) => {
    expect(getMaintenanceItemErrors({ ...valid, ...patch }, TODAY)).toHaveProperty(field);
  });

  it("allows a baseline date of today, and the boundary values", () => {
    expect(getMaintenanceItemErrors({ ...valid, baselineDate: TODAY, intervalKm: "100", intervalMonths: "120", name: "x".repeat(60) }, TODAY)).toEqual({});
    expect(getMaintenanceItemErrors({ ...valid, intervalKm: "200,000", intervalMonths: "1" }, TODAY)).toEqual({});
  });

  it("turns the form into a row (trimmed name, numbers, empty notes as null)", () => {
    expect(itemFromForm({ ...valid, name: "  Oil change  ", intervalKm: "5,000", notes: "  " })).toEqual({
      name: "Oil change", interval_km: 5000, interval_months: 6, baseline_date: TODAY, baseline_km: 84000, notes: null,
    });
    expect(itemFromForm({ ...valid, intervalKm: "", baselineKm: "" })).toMatchObject({ interval_km: null, baseline_km: null });
  });
});

describe("getCompletionErrors", () => {
  it("accepts today, and no odometer for a date-only item", () => {
    expect(getCompletionErrors({ doneOn: TODAY, odometer: "89100", note: "" }, TODAY, true)).toEqual({});
    expect(getCompletionErrors({ doneOn: TODAY, odometer: "", note: "" }, TODAY, false)).toEqual({});
  });

  it("refuses a date in the future (Beirut), and a missing or too-old date", () => {
    expect(getCompletionErrors({ doneOn: "2026-10-20", odometer: "", note: "" }, TODAY, false).doneOn).toBe("The date can't be in the future.");
    expect(getCompletionErrors({ doneOn: "", odometer: "", note: "" }, TODAY, false)).toHaveProperty("doneOn");
    expect(getCompletionErrors({ doneOn: "1999-01-01", odometer: "", note: "" }, TODAY, false)).toHaveProperty("doneOn");
  });

  it("requires the odometer for a km-based item, and checks its range", () => {
    expect(getCompletionErrors({ doneOn: TODAY, odometer: "", note: "" }, TODAY, true)).toHaveProperty("odometer");
    expect(getCompletionErrors({ doneOn: TODAY, odometer: "0", note: "" }, TODAY, false)).toHaveProperty("odometer");
    expect(getCompletionErrors({ doneOn: TODAY, odometer: "2000001", note: "" }, TODAY, false)).toHaveProperty("odometer");
    expect(getCompletionErrors({ doneOn: TODAY, odometer: "", note: "x".repeat(501) }, TODAY, false)).toHaveProperty("note");
  });
});

describe("dashboardMaintenance (across cars)", () => {
  // Car A is at 88,800 km, car B at 10,200 km. Both have the same item "due at 89,000 km".
  const readings = [
    { id: "fa", car_id: "car-a", filled_at: "2026-10-10", created_at: "2026-10-10T09:00:00Z", liters: 40, odometer_km: 88800 },
    { id: "fb", car_id: "car-b", filled_at: "2026-10-12", created_at: "2026-10-12T09:00:00Z", liters: 30, odometer_km: 10200 },
  ];
  const kmItem = (id, carId, baselineKm) => ({ id, car_id: carId, name: `Oil ${id}`, interval_km: 5000, interval_months: null, baseline_date: "2026-05-01", baseline_km: baselineKm, maintenance_records: [] });

  it("uses each car's OWN latest reading: the same due km is Due soon on one car and OK on the other", () => {
    const result = dashboardMaintenance([kmItem("a1", "car-a", 84000), kmItem("b1", "car-b", 84000)], readings, TODAY);

    // a1: 89,000 - 88,800 = 200 km left -> Due soon. b1: 89,000 - 10,200 -> OK (not listed).
    expect(result.due.map((row) => row.item.id)).toEqual(["a1"]);
    expect(result.due[0].status.kmLeft).toBe(200);
    expect(result.total).toBe(2);
  });

  it("never borrows another car's reading for a car with none", () => {
    const result = dashboardMaintenance([kmItem("c1", "car-c", 84000)], readings, TODAY);

    expect(result.due).toEqual([]);
    expect(result.needsReading).toBe(1);
  });

  it("lists Overdue before Due soon and leaves OK items out", () => {
    const overdue = { id: "d1", car_id: "car-a", name: "Vehicle inspection", interval_km: null, interval_months: 12, baseline_date: "2025-09-01", baseline_km: null, maintenance_records: [] };
    const ok = { id: "o1", car_id: "car-a", name: "Brakes", interval_km: null, interval_months: 12, baseline_date: "2026-09-01", baseline_km: null, maintenance_records: [] };
    const result = dashboardMaintenance([kmItem("a1", "car-a", 84000), ok, overdue], readings, TODAY);

    expect(result.due.map((row) => row.item.id)).toEqual(["d1", "a1"]);
  });

  it("is empty for a user with no items", () => {
    expect(dashboardMaintenance([], [], TODAY)).toEqual({ due: [], needsReading: 0, total: 0 });
  });

  it("gives each item a stable anchor id", () => {
    expect(itemAnchorId("abc")).toBe("maintenance-item-abc");
  });
});

describe("getCompletionOdometerWarning (Mark as done only)", () => {
  const latest = { km: 89100, filledAt: "2026-10-10" };

  it("warns when the reading is lower than the latest and the date is on or after the latest's date", () => {
    const expected = "Lower than your latest reading of 89,100 km (10 Oct 2026). Check the reading.";
    expect(getCompletionOdometerWarning("85000", "2026-10-19", latest)).toBe(expected);
    expect(getCompletionOdometerWarning("85000", "2026-10-10", latest)).toBe(expected); // the same day counts
  });

  it("says nothing for a reading equal to or above the latest", () => {
    expect(getCompletionOdometerWarning("89100", "2026-10-19", latest)).toBe("");
    expect(getCompletionOdometerWarning("90000", "2026-10-19", latest)).toBe("");
  });

  it("says nothing for a backdated completion (before the latest reading's date), where lower is normal", () => {
    expect(getCompletionOdometerWarning("85000", "2026-10-09", latest)).toBe("");
  });

  it("says nothing without a reading, a date, or a car reading to compare with", () => {
    expect(getCompletionOdometerWarning("", "2026-10-19", latest)).toBe("");
    expect(getCompletionOdometerWarning("85000", "", latest)).toBe("");
    expect(getCompletionOdometerWarning("85000", "2026-10-19", null)).toBe("");
    expect(getCompletionOdometerWarning("abc", "2026-10-19", latest)).toBe("");
  });
});
