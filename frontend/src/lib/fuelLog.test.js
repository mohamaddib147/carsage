// Tests for the Fuel Log helpers (CAR-53): the add-a-fill-up validation (required
// and positive, at its boundaries), today's date without a time-zone slip, price
// per liter, newest-first sorting, and how dates, liters and money are shown.

import { describe, expect, it } from "vitest";
import {
  fillUpChartPoints,
  formatFillDate,
  CANISTER_LITERS,
  formatLiters,
  getFillUpErrors,
  pricePer20Liters,
  pricePerLiter,
  sortFillUps,
  todayLocal,
} from "./fuelLog.js";
import { LIMITS } from "./limits.js";
import { LBP_PER_USD } from "./currency.js";

const TODAY = "2026-09-21";
const VALID = { date: "2026-09-20", liters: "19.6", cost: "30" };

describe("todayLocal", () => {
  it("is the local calendar date, zero-padded", () => {
    expect(todayLocal(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
    expect(todayLocal(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("does not slip to another day late in the evening (a UTC conversion would)", () => {
    expect(todayLocal(new Date(2026, 8, 21, 23, 30))).toBe("2026-09-21");
    expect(todayLocal(new Date(2026, 8, 21, 0, 30))).toBe("2026-09-21");
  });
});

describe("getFillUpErrors — the normal case", () => {
  it("accepts a valid fill-up", () => {
    expect(getFillUpErrors(VALID, TODAY)).toEqual({});
  });

  it("accepts today's date and decimal values", () => {
    expect(getFillUpErrors({ date: TODAY, liters: "0.01", cost: "0.5" }, TODAY)).toEqual({});
  });
});

describe("getFillUpErrors — all three fields are required", () => {
  it("flags every empty field", () => {
    const errors = getFillUpErrors({ date: "", liters: "", cost: "" }, TODAY);

    expect(errors.date).toMatch(/choose the date/i);
    expect(errors.liters).toMatch(/required/i);
    expect(errors.cost).toMatch(/required/i);
  });

  it.each(["", "   "])("treats %j (blank or spaces) as missing", (blank) => {
    const errors = getFillUpErrors({ ...VALID, liters: blank, cost: blank }, TODAY);

    expect(errors.liters).toMatch(/required/i);
    expect(errors.cost).toMatch(/required/i);
  });

  it("copes with values that are missing altogether", () => {
    const errors = getFillUpErrors({}, TODAY);

    expect(Object.keys(errors).sort()).toEqual(["cost", "date", "liters"]);
  });
});

describe("getFillUpErrors — liters and cost must be positive numbers", () => {
  it.each(["0", "-1", "-0.01", "abc", "1e", "NaN", "Infinity", "-Infinity"])("rejects liters %j", (liters) => {
    expect(getFillUpErrors({ ...VALID, liters }, TODAY).liters).toMatch(/greater than 0/i);
  });

  it.each(["0", "-1", "-0.01", "abc", "NaN", "Infinity"])("rejects cost %j", (cost) => {
    expect(getFillUpErrors({ ...VALID, cost }, TODAY).cost).toMatch(/greater than 0/i);
  });

  it("accepts the smallest and the largest allowed liters, rejects just over", () => {
    expect(getFillUpErrors({ ...VALID, liters: "0.01" }, TODAY).liters).toBeUndefined();
    expect(getFillUpErrors({ ...VALID, liters: String(LIMITS.MAX_FILL_LITERS) }, TODAY).liters).toBeUndefined();
    expect(getFillUpErrors({ ...VALID, liters: String(LIMITS.MAX_FILL_LITERS + 0.01) }, TODAY).liters).toMatch(
      /200 or less/,
    );
  });

  it("accepts the largest allowed cost, rejects just over", () => {
    expect(getFillUpErrors({ ...VALID, cost: String(LIMITS.MAX_FILL_COST) }, TODAY).cost).toBeUndefined();
    expect(getFillUpErrors({ ...VALID, cost: String(LIMITS.MAX_FILL_COST * 10) }, TODAY).cost).toMatch(/too large/i);
  });
});

describe("getFillUpErrors — the date", () => {
  it("rejects a future date and accepts today", () => {
    expect(getFillUpErrors({ ...VALID, date: "2026-09-22" }, TODAY).date).toMatch(/future/i);
    expect(getFillUpErrors({ ...VALID, date: TODAY }, TODAY).date).toBeUndefined();
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "21/09/2026", "yesterday", "2026-9-1"])(
    "rejects the impossible or oddly written date %j",
    (date) => {
      expect(getFillUpErrors({ ...VALID, date }, TODAY).date).toMatch(/valid date/i);
    },
  );

  it("accepts 29 February in a leap year only", () => {
    expect(getFillUpErrors({ ...VALID, date: "2024-02-29" }, TODAY).date).toBeUndefined();
    expect(getFillUpErrors({ ...VALID, date: "2025-02-29" }, TODAY).date).toMatch(/valid date/i);
  });

  it("rejects a date before the database's floor and accepts the floor itself", () => {
    expect(getFillUpErrors({ ...VALID, date: "1999-12-31" }, TODAY).date).toMatch(/too far in the past/i);
    expect(getFillUpErrors({ ...VALID, date: LIMITS.MIN_FILL_DATE }, TODAY).date).toBeUndefined();
  });
});

describe("pricePerLiter", () => {
  it("divides the cost by the liters", () => {
    expect(pricePerLiter({ liters: 20, cost_amount: 30 })).toBe(1.5);
  });

  it("accepts numbers that arrive as strings (Postgres numeric)", () => {
    expect(pricePerLiter({ liters: "19.6", cost_amount: "30" })).toBeCloseTo(1.5306, 4);
  });

  it.each([{ liters: 0, cost_amount: 10 }, { liters: -5, cost_amount: 10 }, { liters: "x", cost_amount: 10 }, { liters: 5, cost_amount: "x" }])(
    "returns null instead of Infinity or NaN for %j",
    (entry) => {
      expect(pricePerLiter(entry)).toBeNull();
    },
  );
});

describe("pricePer20Liters", () => {
  it("uses the 20-liter canister Lebanese fuel prices are quoted in", () => {
    expect(CANISTER_LITERS).toBe(20);
  });

  it("is the price per liter times 20", () => {
    expect(pricePer20Liters({ liters: 20, cost_amount: 30 })).toBe(30);
    expect(pricePer20Liters({ liters: 40, cost_amount: 60 })).toBe(30);
    expect(pricePer20Liters({ liters: 10, cost_amount: 12 })).toBeCloseTo(24, 10);
  });

  it("is exact: derived from the unrounded price per liter, not from a rounded copy (19.6 L for $30 -> 30.61, not 30.60)", () => {
    const entry = { liters: 19.6, cost_amount: 30 };

    expect(pricePer20Liters(entry)).toBeCloseTo((30 / 19.6) * 20, 10);
    expect(pricePer20Liters(entry)).toBeCloseTo(30.612245, 5);
    expect(pricePer20Liters(entry)).not.toBeCloseTo(1.53 * 20, 2);
    expect(pricePer20Liters(entry)).toBeCloseTo(pricePerLiter(entry) * 20, 10);
  });

  it("accepts numbers that arrive as strings (Postgres numeric)", () => {
    expect(pricePer20Liters({ liters: "19.6", cost_amount: "30" })).toBeCloseTo(30.612245, 5);
  });

  it.each([{ liters: 0, cost_amount: 10 }, { liters: -5, cost_amount: 10 }, { liters: "x", cost_amount: 10 }, { liters: 5, cost_amount: "x" }])(
    "returns null (never Infinity or NaN) when the price per liter can't be worked out: %j",
    (entry) => {
      expect(pricePer20Liters(entry)).toBeNull();
    },
  );
});

describe("sortFillUps", () => {
  it("puts the newest date first", () => {
    const sorted = sortFillUps([
      { id: "a", filled_at: "2026-09-01" },
      { id: "c", filled_at: "2026-09-21" },
      { id: "b", filled_at: "2026-09-10" },
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["c", "b", "a"]);
  });

  it("puts the later-logged entry first when two share a date", () => {
    const sorted = sortFillUps([
      { id: "first", filled_at: "2026-09-21", created_at: "2026-09-21T08:00:00Z" },
      { id: "second", filled_at: "2026-09-21", created_at: "2026-09-21T18:00:00Z" },
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(["second", "first"]);
  });

  it("does not change the array it was given, and handles an empty list", () => {
    const original = [
      { id: "a", filled_at: "2026-09-01" },
      { id: "b", filled_at: "2026-09-02" },
    ];

    sortFillUps(original);

    expect(original.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(sortFillUps([])).toEqual([]);
  });
});

describe("fillUpChartPoints (Fuel Log bar chart)", () => {
  const A = { filled_at: "2026-09-01", liters: 30, cost_amount: 45, cost_currency: "USD", created_at: "2026-09-01T09:00:00Z" };
  const B = { filled_at: "2026-09-21", liters: 19.6, cost_amount: 30, cost_currency: "USD", created_at: "2026-09-21T09:00:00Z" };
  const LBP_ENTRY = { filled_at: "2026-09-15", liters: 25, cost_amount: 2_500_000, cost_currency: "LBP", created_at: "2026-09-15T09:00:00Z" };

  it("orders points oldest first, the opposite of the table's newest-first order", () => {
    const points = fillUpChartPoints([B, A], "USD");

    expect(points.map((point) => point.date)).toEqual(["2026-09-01", "2026-09-21"]);
  });

  it("is each entry's liters, unconverted (liters need no currency)", () => {
    const points = fillUpChartPoints([A, B], "USD");

    expect(points.map((point) => point.liters)).toEqual([30, 19.6]);
  });

  it("is each entry's cost, in the requested currency", () => {
    const points = fillUpChartPoints([A], "USD");

    expect(points[0].cost).toBe(45); // already USD
  });

  it("converts every point's cost to the same currency, so USD and LBP entries compare on one tooltip scale", () => {
    const points = fillUpChartPoints([A, LBP_ENTRY], "USD");

    expect(points[0].cost).toBeCloseTo(45, 10); // already USD
    expect(points[1].cost).toBeCloseTo(2_500_000 / LBP_PER_USD, 10); // LBP entry converted to USD
    expect(points[1].liters).toBe(25); // liters themselves are untouched by the conversion
  });

  it("converts cost to LBP just as well", () => {
    const points = fillUpChartPoints([A], "LBP");

    expect(points[0].cost).toBeCloseTo(45 * LBP_PER_USD, 6);
  });

  it("still plots a fill-up with an unpriceable entry (e.g. zero liters) — liters is the primary value, not price", () => {
    const points = fillUpChartPoints([A, { ...B, liters: 0 }], "USD");

    expect(points).toHaveLength(2);
    expect(points[1]).toMatchObject({ date: "2026-09-21", liters: 0 });
  });

  it("skips an entry whose liters figure isn't a usable number, instead of a broken bar", () => {
    const points = fillUpChartPoints([A, { ...B, liters: "not a number" }], "USD");

    expect(points).toHaveLength(1);
    expect(points[0].date).toBe("2026-09-01");
  });

  it("does not mutate the entries array it was given", () => {
    const entries = [B, A];

    fillUpChartPoints(entries, "USD");

    expect(entries).toEqual([B, A]);
  });

  it("returns an empty list for no entries", () => {
    expect(fillUpChartPoints([], "USD")).toEqual([]);
  });
});

describe("formatting", () => {
  it("shows liters with up to two decimals and no trailing zeros", () => {
    expect(formatLiters(19.6)).toBe("19.6");
    expect(formatLiters("30.00")).toBe("30");
    expect(formatLiters(12.345)).toBe("12.35");
  });

  it("shows a date as day, short month, year — with no time-zone shift", () => {
    expect(formatFillDate("2026-09-21")).toBe("21 Sep 2026");
    expect(formatFillDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatFillDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("returns something that is not a date unchanged rather than crashing", () => {
    expect(formatFillDate("not a date")).toBe("not a date");
  });
});
