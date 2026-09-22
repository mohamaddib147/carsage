// Tests for the Dashboard's DIY fix-rate helpers (mentor feedback, no Jira
// task): the percentage among answered suggestions only, the most recently
// confirmed fix, and the relative "how long ago" text.

import { describe, expect, it } from "vitest";
import { diyFixRate, latestFixedMessage, timeAgo } from "./diySuccess.js";

describe("diyFixRate", () => {
  it("returns null — not 0 or NaN — when nobody has given feedback yet", () => {
    expect(diyFixRate([])).toBeNull();
    expect(diyFixRate([{ marked_fixed: null }, { marked_fixed: null }])).toBeNull();
  });

  it("is the percentage fixed among only the suggestions with feedback", () => {
    expect(
      diyFixRate([{ marked_fixed: true }, { marked_fixed: false }, { marked_fixed: null }]),
    ).toBe(50); // 1 of 2 answered, not 1 of 3
  });

  it("is 100 when every answered suggestion was fixed", () => {
    expect(diyFixRate([{ marked_fixed: true }, { marked_fixed: true }])).toBe(100);
  });

  it("is 0, not null, when every answered suggestion was not fixed", () => {
    expect(diyFixRate([{ marked_fixed: false }, { marked_fixed: false }])).toBe(0);
  });

  it("rounds to the nearest whole percent", () => {
    expect(
      diyFixRate([{ marked_fixed: true }, { marked_fixed: false }, { marked_fixed: false }]),
    ).toBe(33); // 1/3 = 33.33...
  });
});

describe("latestFixedMessage", () => {
  it("returns null when nothing has been marked fixed", () => {
    expect(latestFixedMessage([])).toBeNull();
    expect(latestFixedMessage([{ marked_fixed: false, created_at: "2026-09-01T00:00:00Z" }])).toBeNull();
    expect(latestFixedMessage([{ marked_fixed: null, created_at: "2026-09-01T00:00:00Z" }])).toBeNull();
  });

  it("picks the most recent among the fixed ones, ignoring not-fixed and unanswered", () => {
    const older = { marked_fixed: true, created_at: "2026-09-01T00:00:00Z" };
    const newer = { marked_fixed: true, created_at: "2026-09-20T00:00:00Z" };
    const notFixedButNewest = { marked_fixed: false, created_at: "2026-09-25T00:00:00Z" };

    expect(latestFixedMessage([older, newer, notFixedButNewest])).toBe(newer);
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-09-22T12:00:00Z");

  it("shows the largest whole unit that applies", () => {
    expect(timeAgo("2026-09-22T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-09-22T11:55:00Z", now)).toBe("5 minutes ago");
    expect(timeAgo("2026-09-22T09:00:00Z", now)).toBe("3 hours ago");
    expect(timeAgo("2026-09-19T12:00:00Z", now)).toBe("3 days ago");
    expect(timeAgo("2025-09-22T12:00:00Z", now)).toBe("1 year ago");
  });

  it("uses the singular for exactly one unit", () => {
    expect(timeAgo("2026-09-22T11:00:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-09-21T12:00:00Z", now)).toBe("1 day ago");
  });

  it("never goes negative for a slightly-future timestamp (clock skew)", () => {
    expect(timeAgo("2026-09-22T12:05:00Z", now)).toBe("just now");
  });
});
