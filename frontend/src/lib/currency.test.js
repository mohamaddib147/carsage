// Tests for the currency library (CAR-54): the one fixed rate (1 USD = 89,700 LBP)
// written in exactly one place, converting both ways without losing anything,
// showing money, and remembering the chosen currency — including when the
// browser's storage is empty, corrupt or blocked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY,
  LBP_PER_USD,
  convertAmount,
  formatMoney,
  isCurrency,
  otherCurrency,
  readStoredCurrency,
  storeCurrency,
} from "./currency.js";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the fixed rate", () => {
  it("is 1 USD = 89,700 LBP", () => {
    expect(LBP_PER_USD).toBe(89700);
  });

  it("is written in exactly one frontend source file (never hardcoded in several places)", () => {
    const sources = import.meta.glob("/src/**/*.{js,jsx}", { query: "?raw", import: "default", eager: true });
    const withTheRate = Object.entries(sources)
      .filter(([path]) => !/\.test\.jsx?$/.test(path))
      // the rate as 89700 / 89_700 / 89,700, and the retired 89,000 spelled the same ways
      .filter(([, text]) => /89[_,]?[07]00\b|89[_,]?000\b/.test(text))
      .map(([path]) => path);

    expect(Object.keys(sources).length).toBeGreaterThan(20); // it scanned the real source
    expect(withTheRate).toEqual(["/src/lib/currency.js"]);
  });
});

describe("convertAmount", () => {
  it("converts USD to LBP and back", () => {
    expect(convertAmount(30, "USD", "LBP")).toBe(2_691_000);
    expect(convertAmount(2_691_000, "LBP", "USD")).toBe(30);
  });

  it("leaves an amount alone when the currency is the same", () => {
    expect(convertAmount(12.345, "USD", "USD")).toBe(12.345);
    expect(convertAmount(500, "LBP", "LBP")).toBe(500);
  });

  it("loses nothing on a round trip (rounding happens only when showing)", () => {
    const back = convertAmount(convertAmount(19.6, "USD", "LBP"), "LBP", "USD");

    expect(back).toBeCloseTo(19.6, 10);
  });

  it("handles zero and small amounts", () => {
    expect(convertAmount(0, "USD", "LBP")).toBe(0);
    expect(convertAmount(0.01, "USD", "LBP")).toBeCloseTo(897, 6);
  });
});

describe("formatMoney", () => {
  it("shows USD with a dollar sign and two decimals", () => {
    expect(formatMoney(30, "USD")).toBe("$30.00");
    expect(formatMoney(1.5306, "USD")).toBe("$1.53");
    expect(formatMoney(1234567.891, "USD")).toBe("$1,234,567.89");
    expect(formatMoney(0, "USD")).toBe("$0.00");
  });

  it("shows LBP with thousands separators and no decimals", () => {
    expect(formatMoney(2691000, "LBP")).toBe("2,691,000 LBP");
    expect(formatMoney(136224.49, "LBP")).toBe("136,224 LBP");
    expect(formatMoney(0.4, "LBP")).toBe("0 LBP");
  });
});

describe("currency names", () => {
  it("knows the other currency", () => {
    expect(otherCurrency("USD")).toBe("LBP");
    expect(otherCurrency("LBP")).toBe("USD");
  });

  it.each(["USD", "LBP"])("accepts %s", (code) => {
    expect(isCurrency(code)).toBe(true);
  });

  it.each(["EUR", "usd", "", null, undefined, 5, "USD "])("rejects %j", (value) => {
    expect(isCurrency(value)).toBe(false);
  });
});

describe("remembering the choice", () => {
  it("starts on USD when nothing is saved", () => {
    expect(readStoredCurrency()).toBe(DEFAULT_CURRENCY);
    expect(DEFAULT_CURRENCY).toBe("USD");
  });

  it("stores and reads back either currency under its own key", () => {
    storeCurrency("LBP");
    expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("LBP");
    expect(readStoredCurrency()).toBe("LBP");

    storeCurrency("USD");
    expect(readStoredCurrency()).toBe("USD");
  });

  it.each(["EUR", "lbp", "", "null", "{}", "undefined"])("falls back to USD for a corrupt saved value %j", (junk) => {
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, junk);

    expect(readStoredCurrency()).toBe("USD");
  });

  it("does not throw when reading is blocked (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(readStoredCurrency()).toBe("USD");
  });

  it("does not throw when writing is blocked or the storage is full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });

    expect(() => storeCurrency("LBP")).not.toThrow();
  });

  it("does not throw when even touching localStorage throws", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(readStoredCurrency()).toBe("USD");
    expect(() => storeCurrency("LBP")).not.toThrow();
  });
});
