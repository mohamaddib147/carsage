// Tests lib/costs.js (CAR-64): categories, month keys taken from the date text (first
// and last day of a month, year boundaries), the 6 always-present chart slots, monthly
// sums with mixed USD/LBP entries converted through the ONE shared rate, empty vs zero,
// the per-category breakdown, form validation (incl. a future date in Beirut), and a
// source-scan guard that the cost code never introduces a second rate.

import { describe, expect, it } from "vitest";
import {
  categoryLabel,
  CHART_MONTHS,
  EXPENSE_CATEGORIES,
  formatAxisMoney,
  formatMonth,
  getExpenseErrors,
  hasChartData,
  monthlyChartPoints,
  monthlySummary,
  monthOf,
  monthsEndingWith,
  sortExpenses,
} from "./costs.js";
import { convertAmount, LBP_PER_USD } from "./currency.js";

const TODAY = "2026-10-20";

const fuel = (date, amount, currency = "USD") => ({ filled_at: date, cost_amount: String(amount), cost_currency: currency });
const expense = (date, category, amount, currency = "USD", created = "T09:00:00Z") => ({
  id: `${date}-${category}-${amount}`, spent_on: date, category, amount: String(amount), currency, created_at: `${date}${created}`,
});

describe("categories", () => {
  it("are the fixed list (keys match the database CHECK), including Fines and Other", () => {
    expect(EXPENSE_CATEGORIES.map((category) => category.key)).toEqual([
      "repair", "maintenance", "insurance", "registration", "parking", "car_wash", "tolls", "fines", "other",
    ]);
    expect(categoryLabel("registration")).toBe("Registration / Mécanique");
    expect(categoryLabel("car_wash")).toBe("Car wash");
    expect(categoryLabel("fines")).toBe("Fines");
  });
});

describe("months from the date text", () => {
  it("takes the month from the first and the LAST day of a month without slipping", () => {
    expect(monthOf("2026-10-01")).toBe("2026-10");
    expect(monthOf("2026-10-31")).toBe("2026-10");
    expect(monthOf("2026-12-31")).toBe("2026-12");
    expect(monthOf("2027-01-01")).toBe("2027-01");
  });

  it("refuses anything that isn't a date string", () => {
    for (const value of [null, undefined, "", "2026-10", "2026-10-31T23:30:00Z", 20261031]) {
      expect(monthOf(value)).toBeNull();
    }
  });

  it("always gives 6 slots ending with the current month, across a year boundary", () => {
    expect(CHART_MONTHS).toBe(6);
    expect(monthsEndingWith("2026-10")).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(monthsEndingWith("2027-02")).toEqual(["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  it("formats month names", () => {
    expect(formatMonth("2026-10")).toBe("October 2026");
    expect(formatMonth("2026-10", true)).toBe("Oct 2026");
  });
});

describe("monthlySummary", () => {
  it("adds fuel and other costs for the month, converting each from its own currency (mixed USD/LBP)", () => {
    const fuelLogs = [fuel("2026-10-01", 30), fuel("2026-10-31", 2_691_000, "LBP"), fuel("2026-09-30", 999)];
    const expenses = [expense("2026-10-15", "parking", 5), expense("2026-10-20", "insurance", 448_500, "LBP"), expense("2026-11-01", "repair", 777)];

    const usd = monthlySummary(fuelLogs, expenses, "2026-10", "USD");
    expect(usd.fuel).toBeCloseTo(60, 10); // $30 + 2,691,000 LBP (= $30)
    expect(usd.other).toBeCloseTo(10, 10); // $5 + 448,500 LBP (= $5)
    expect(usd.total).toBeCloseTo(70, 10);
    expect(usd.fuelCount).toBe(2);
    expect(usd.expenseCount).toBe(2);

    const lbp = monthlySummary(fuelLogs, expenses, "2026-10", "LBP");
    expect(lbp.total).toBeCloseTo(70 * LBP_PER_USD, 4); // same money, other currency
  });

  it("uses exactly the shared convertAmount (no second rate)", () => {
    const summary = monthlySummary([fuel("2026-10-05", 1_000_000, "LBP")], [], "2026-10", "USD");
    expect(summary.fuel).toBe(convertAmount(1_000_000, "LBP", "USD"));
  });

  it("counts an entry on the last day of the month in THAT month, and the 1st of the next in the next", () => {
    const expenses = [expense("2026-10-31", "tolls", 3), expense("2026-11-01", "tolls", 4)];
    expect(monthlySummary([], expenses, "2026-10", "USD").other).toBe(3);
    expect(monthlySummary([], expenses, "2026-11", "USD").other).toBe(4);
  });

  it("is null (never 0 or NaN) for a month with nothing, and keeps each side null when empty", () => {
    expect(monthlySummary([], [], "2026-10", "USD")).toMatchObject({ fuel: null, other: null, total: null });
    const onlyFuel = monthlySummary([fuel("2026-10-02", 25)], [], "2026-10", "USD");
    expect(onlyFuel).toMatchObject({ fuel: 25, other: null, total: 25 });
    const onlyOther = monthlySummary([], [expense("2026-10-02", "parking", 2)], "2026-10", "USD");
    expect(onlyOther).toMatchObject({ fuel: null, other: 2, total: 2 });
  });

  it("ignores unusable rows rather than producing NaN", () => {
    const summary = monthlySummary([fuel("2026-10-02", "abc"), fuel("not-a-date", 10)], [expense("2026-10-03", "parking", 0)], "2026-10", "USD");
    expect(summary).toMatchObject({ fuel: null, other: null, total: null });
  });

  it("breaks other costs down by category, largest first, mixed currencies converted", () => {
    const expenses = [
      expense("2026-10-01", "parking", 5),
      expense("2026-10-02", "parking", 448_500, "LBP"),
      expense("2026-10-03", "insurance", 200),
      expense("2026-10-04", "fines", 50),
    ];
    const { byCategory } = monthlySummary([], expenses, "2026-10", "USD");
    expect(byCategory.map(({ key, label }) => [key, label])).toEqual([["insurance", "Insurance"], ["fines", "Fines"], ["parking", "Parking"]]);
    expect(byCategory[2].amount).toBeCloseTo(10, 10);
  });
});

describe("monthlyChartPoints", () => {
  it("keeps all 6 slots, with empty months as null (an empty slot, not a skipped or zero bar)", () => {
    const months = monthsEndingWith("2026-10");
    const points = monthlyChartPoints([fuel("2026-10-03", 40)], [expense("2026-07-15", "repair", 120)], months, "USD");

    expect(points.map((point) => point.label)).toEqual(["May 2026", "Jun 2026", "Jul 2026", "Aug 2026", "Sep 2026", "Oct 2026"]);
    expect(points[2]).toMatchObject({ month: "2026-07", fuel: null, other: 120 });
    expect(points[5]).toMatchObject({ month: "2026-10", fuel: 40, other: null });
    expect(points[0]).toMatchObject({ fuel: null, other: null });
    expect(hasChartData(points)).toBe(true);
  });

  it("labels the money axis compactly so big LBP amounts fit", () => {
    expect(formatAxisMoney(14_000_000, "LBP")).toBe("14M LBP");
    expect(formatAxisMoney(3_500_000, "LBP")).toBe("3.5M LBP");
    expect(formatAxisMoney(150, "USD")).toBe("$150");
    expect(formatAxisMoney(1_200, "USD")).toBe("$1.2K");
    expect(formatAxisMoney(0, "USD")).toBe("$0");
  });

  it("has nothing to draw with no data at all", () => {
    expect(hasChartData(monthlyChartPoints([], [], monthsEndingWith("2026-10"), "USD"))).toBe(false);
  });
});

describe("getExpenseErrors", () => {
  const valid = { date: TODAY, category: "parking", amount: "5", note: "" };

  it("accepts a valid expense dated today", () => {
    expect(getExpenseErrors(valid, TODAY)).toEqual({});
  });

  it.each([
    ["a date TOMORROW in Beirut", { date: "2026-10-21" }, "date", "The date can't be in the future."],
    ["no date", { date: "" }, "date", "Choose the date of the expense."],
    ["an impossible date", { date: "2026-02-30" }, "date", "That isn't a valid date."],
    ["a date before 2000", { date: "1999-12-31" }, "date", "That date is too far in the past."],
    ["no category", { category: "" }, "category", "Choose a category."],
    ["an unknown category", { category: "snacks" }, "category", "Choose one of the listed categories."],
    ["no amount", { amount: "" }, "amount", "Amount is required."],
    ["amount 0", { amount: "0" }, "amount", "Amount must be a number greater than 0."],
    ["a negative amount", { amount: "-3" }, "amount", "Amount must be a number greater than 0."],
    ["an absurd amount", { amount: "10000000000000" }, "amount", "That amount is too large."],
    ["a 301-character note", { note: "x".repeat(301) }, "note", "Keep the note to 300 characters."],
  ])("refuses %s", (_label, patch, field, message) => {
    expect(getExpenseErrors({ ...valid, ...patch }, TODAY)[field]).toBe(message);
  });

  it("accepts the boundaries (a 300-character note, 0.01)", () => {
    expect(getExpenseErrors({ ...valid, amount: "0.01", note: "x".repeat(300) }, TODAY)).toEqual({});
  });
});

describe("sortExpenses", () => {
  it("puts the newest first, later-logged first on the same day", () => {
    const sorted = sortExpenses([
      expense("2026-10-01", "parking", 1),
      expense("2026-10-05", "tolls", 2, "USD", "T08:00:00Z"),
      expense("2026-10-05", "fines", 3, "USD", "T18:00:00Z"),
    ]);
    expect(sorted.map((row) => row.category)).toEqual(["fines", "tolls", "parking"]);
  });
});

describe("one shared rate (source-scan guard, like CAR-54's)", () => {
  // The cost code must convert money only through convertAmount() in lib/currency.js.
  const COST_FILES = ["/src/lib/costs.js", "/src/pages/ExpensesPage.jsx", "/src/pages/DashboardPage.jsx"];
  const sources = import.meta.glob(["/src/lib/costs.js", "/src/pages/ExpensesPage.jsx", "/src/pages/DashboardPage.jsx"], {
    query: "?raw",
    import: "default",
    eager: true,
  });
  /** The source with comments removed, so prose about rates can't trip the guard. */
  const code = (path) => sources[path].replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("scanned all three cost files", () => {
    expect(Object.keys(sources).sort()).toEqual([...COST_FILES].sort());
  });

  it.each(COST_FILES)("%s contains no exchange rate and never multiplies or divides by a big literal", (path) => {
    const text = code(path);
    expect(text).not.toMatch(/89[_,]?\d00\b/); // the rate, however it's spelled
    expect(text).not.toMatch(/[*/]\s*\d[\d_,]{2,}/); // "* 89700", "/ 1_000", ...
    expect(text).not.toMatch(/\d[\d_,]{2,}\s*[*/]/); // "89700 *", ...
    expect(text).not.toMatch(/\bLBP_PER_USD\b/); // use convertAmount, not the raw constant
  });

  it("the cost logic gets its conversion from lib/currency.js", () => {
    expect(sources["/src/lib/costs.js"]).toMatch(/import \{ convertAmount \} from "\.\/currency\.js";/);
  });
});

describe("expenses are never created automatically (source-scan guard)", () => {
  it("only the Expenses page inserts into car_expenses (not the Fuel Log, Maintenance or anything else)", () => {
    const sources = import.meta.glob("/src/**/*.{js,jsx}", { query: "?raw", import: "default", eager: true });
    const inserting = Object.entries(sources)
      .filter(([path]) => !/\.test\.jsx?$/.test(path))
      // a car_expenses query whose builder chain (within a few lines) calls .insert(
      .filter(([, text]) => /from\("car_expenses"\)[\s\S]{0,200}?\.insert\(/.test(text))
      .map(([path]) => path);

    expect(Object.keys(sources).length).toBeGreaterThan(20); // it scanned the real source
    expect(inserting).toEqual(["/src/pages/ExpensesPage.jsx"]);
  });
});
