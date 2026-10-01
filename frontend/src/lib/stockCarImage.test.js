// Tests for CAR-59's stock car image URL builder: with/without a
// configured key, missing make/model, optional year, and that special
// characters (spaces, hyphens) end up correctly URL-encoded.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStockCarImageUrl, getStockImageApiKey } from "./stockCarImage.js";

const ORIGINAL_ENV = { ...import.meta.env };

function setApiKey(value) {
  import.meta.env.VITE_IMAGIN_STUDIO_KEY = value;
}

beforeEach(() => {
  import.meta.env.VITE_IMAGIN_STUDIO_KEY = "";
});

afterEach(() => {
  import.meta.env.VITE_IMAGIN_STUDIO_KEY = ORIGINAL_ENV.VITE_IMAGIN_STUDIO_KEY;
});

describe("getStockImageApiKey", () => {
  it("returns the configured key", () => {
    setApiKey("test-customer-key");
    expect(getStockImageApiKey()).toBe("test-customer-key");
  });

  it("returns an empty string when unset (edge case)", () => {
    setApiKey("");
    expect(getStockImageApiKey()).toBe("");
  });
});

describe("getStockCarImageUrl (CAR-59)", () => {
  it("builds a URL with make, model and year when a key is configured (normal case)", () => {
    setApiKey("test-customer-key");

    const url = getStockCarImageUrl("Toyota", "Corolla", 2020);

    expect(url).toContain("https://cdn.imagin.studio/getImage?");
    const params = new URL(url).searchParams;
    expect(params.get("customer")).toBe("test-customer-key");
    expect(params.get("make")).toBe("Toyota");
    expect(params.get("modelFamily")).toBe("Corolla");
    expect(params.get("modelYear")).toBe("2020");
  });

  it("omits modelYear when no year is given, rather than sending an empty value", () => {
    setApiKey("test-customer-key");

    const url = getStockCarImageUrl("Toyota", "Corolla");

    expect(new URL(url).searchParams.has("modelYear")).toBe(false);
  });

  it("returns null when no API key is configured (edge case)", () => {
    setApiKey("");
    expect(getStockCarImageUrl("Toyota", "Corolla", 2020)).toBeNull();
  });

  it.each([
    ["", "Corolla"],
    ["Toyota", ""],
    ["   ", "Corolla"],
    [null, "Corolla"],
    [undefined, undefined],
  ])("returns null when make or model is missing (%j, %j)", (make, model) => {
    setApiKey("test-customer-key");
    expect(getStockCarImageUrl(make, model, 2020)).toBeNull();
  });

  it("URL-encodes a make/model with spaces and special characters", () => {
    setApiKey("test-customer-key");

    const url = getStockCarImageUrl("Mercedes-Benz", "C 230");

    const params = new URL(url).searchParams;
    expect(params.get("make")).toBe("Mercedes-Benz");
    expect(params.get("modelFamily")).toBe("C 230");
  });

  it("trims surrounding whitespace from make and model", () => {
    setApiKey("test-customer-key");

    const url = getStockCarImageUrl("  Honda  ", "  Civic  ");

    const params = new URL(url).searchParams;
    expect(params.get("make")).toBe("Honda");
    expect(params.get("modelFamily")).toBe("Civic");
  });
});
