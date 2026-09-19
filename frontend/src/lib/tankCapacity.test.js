// Tests for the shared tank-capacity range check (CAR-49): blank is fine,
// in-range values (including the boundaries and decimals) pass, and
// anything outside 5-200 L or non-numeric is rejected with the range message.

import { describe, expect, it } from "vitest";
import {
  MAX_TANK_LITERS,
  MIN_TANK_LITERS,
  TANK_RANGE_MESSAGE,
  getTankCapacityError,
} from "./tankCapacity.js";

describe("getTankCapacityError", () => {
  it.each([[""], ["   "], [null], [undefined]])("allows a blank value (%j)", (value) => {
    expect(getTankCapacityError(value)).toBe("");
  });

  it.each([["5"], ["43"], ["43.5"], [68], ["200"]])("accepts %j", (value) => {
    expect(getTankCapacityError(value)).toBe("");
  });

  it.each([["430"], ["4.9"], ["200.1"], ["0"], ["-20"], ["abc"], ["Infinity"]])(
    "rejects %j with the range message",
    (value) => {
      expect(getTankCapacityError(value)).toBe(TANK_RANGE_MESSAGE);
    },
  );

  it("states the 5-200 range in the message", () => {
    expect(MIN_TANK_LITERS).toBe(5);
    expect(MAX_TANK_LITERS).toBe(200);
    expect(TANK_RANGE_MESSAGE).toContain("between 5 and 200");
  });
});
