// Tests for the cold-start tracker (professional-polish pass, no Jira
// task): a listener is told "slow" once a tracked request outlives the
// threshold, "not slow" once it's stopped, concurrent slow requests only
// clear once all of them are done, and a request that finishes quickly
// never fires at all.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COLD_START_THRESHOLD_MS, onColdStartChange, trackRequest } from "./coldStart.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("trackRequest / onColdStartChange", () => {
  it("does not fire for a request that finishes before the threshold (normal case)", () => {
    const listener = vi.fn();
    const unsubscribe = onColdStartChange(listener);

    const stop = trackRequest();
    vi.advanceTimersByTime(COLD_START_THRESHOLD_MS - 1);
    stop();
    vi.advanceTimersByTime(COLD_START_THRESHOLD_MS * 2);

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("fires true once a request outlives the threshold, then false once it stops", () => {
    const listener = vi.fn();
    const unsubscribe = onColdStartChange(listener);

    const stop = trackRequest();
    vi.advanceTimersByTime(COLD_START_THRESHOLD_MS);
    expect(listener).toHaveBeenCalledWith(true);

    stop();
    expect(listener).toHaveBeenLastCalledWith(false);
    unsubscribe();
  });

  it("stays true while any one of several concurrent slow requests is still pending", () => {
    const listener = vi.fn();
    const unsubscribe = onColdStartChange(listener);

    const stopA = trackRequest();
    const stopB = trackRequest();
    vi.advanceTimersByTime(COLD_START_THRESHOLD_MS);
    listener.mockClear();

    stopA();
    expect(listener).not.toHaveBeenCalledWith(false);

    stopB();
    expect(listener).toHaveBeenLastCalledWith(false);
    unsubscribe();
  });

  it("a fast request finishing does not clear a genuinely still-slow one", () => {
    const listener = vi.fn();
    const unsubscribe = onColdStartChange(listener);

    const stopSlow = trackRequest();
    vi.advanceTimersByTime(COLD_START_THRESHOLD_MS);
    listener.mockClear();

    const stopFast = trackRequest();
    stopFast(); // never reached the threshold, so this is a no-op for the banner

    expect(listener).not.toHaveBeenCalled();

    stopSlow();
    expect(listener).toHaveBeenLastCalledWith(false);
    unsubscribe();
  });

  it("an unsubscribed listener stops receiving updates", () => {
    const listener = vi.fn();
    const unsubscribe = onColdStartChange(listener);
    unsubscribe();

    const stop = trackRequest();
    vi.advanceTimersByTime(COLD_START_THRESHOLD_MS);
    stop();

    expect(listener).not.toHaveBeenCalled();
  });
});
