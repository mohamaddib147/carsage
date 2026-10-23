// Tests the lazy-screen download tracking (CAR-67 follow-up): the counter,
// lazyScreen, the 300 ms "slow" threshold, and the loading bar.

import { act, render, renderHook, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScreenLoadingBar from "../components/ScreenLoadingBar.jsx";
import { getScreenLoadCount, lazyScreen, trackScreenLoad } from "./screenLoading.js";
import { SLOW_SCREEN_MS, useSlowScreenLoad } from "./useSlowScreenLoad.js";

/** A promise you settle by hand. */
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("trackScreenLoad", () => {
  it("counts a download while it is in flight and stops when it succeeds", async () => {
    const load = deferred();
    trackScreenLoad(load.promise);
    expect(getScreenLoadCount()).toBe(1);
    await act(async () => load.resolve("ok"));
    expect(getScreenLoadCount()).toBe(0);
  });

  it("stops counting when the download fails too (edge case: a failure must not leave the bar on forever)", async () => {
    const load = deferred();
    trackScreenLoad(load.promise).catch(() => {});
    expect(getScreenLoadCount()).toBe(1);
    await act(async () => load.reject(new Error("Failed to fetch dynamically imported module")));
    expect(getScreenLoadCount()).toBe(0);
  });

  it("counts several downloads at once", async () => {
    const a = deferred();
    const b = deferred();
    trackScreenLoad(a.promise);
    trackScreenLoad(b.promise);
    expect(getScreenLoadCount()).toBe(2);
    await act(async () => a.resolve());
    expect(getScreenLoadCount()).toBe(1);
    await act(async () => b.resolve());
    expect(getScreenLoadCount()).toBe(0);
  });
});

describe("lazyScreen", () => {
  it("renders the screen once its code has loaded, showing the fallback until then", async () => {
    const load = deferred();
    const Screen = lazyScreen(() => load.promise);
    render(
      <Suspense fallback={<p>fallback</p>}>
        <Screen />
      </Suspense>,
    );
    expect(screen.getByText("fallback")).toBeInTheDocument();
    await act(async () => load.resolve({ default: () => <p>the screen</p> }));
    expect(await screen.findByText("the screen")).toBeInTheDocument();
    expect(screen.queryByText("fallback")).not.toBeInTheDocument();
  });
});

describe("useSlowScreenLoad", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is false while nothing is loading", () => {
    const { result } = renderHook(() => useSlowScreenLoad());
    expect(result.current).toBe(false);
  });

  it("stays false for a load that finishes in under 300 ms (no flash for fast screens)", async () => {
    const { result } = renderHook(() => useSlowScreenLoad());
    const load = deferred();
    act(() => void trackScreenLoad(load.promise));
    act(() => vi.advanceTimersByTime(SLOW_SCREEN_MS - 1));
    expect(result.current).toBe(false);
    await act(async () => load.resolve());
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe(false);
  });

  it("turns true once a load has taken 300 ms, and false again as soon as it finishes", async () => {
    const { result } = renderHook(() => useSlowScreenLoad());
    const load = deferred();
    act(() => void trackScreenLoad(load.promise));
    act(() => vi.advanceTimersByTime(SLOW_SCREEN_MS));
    expect(result.current).toBe(true);
    await act(async () => load.resolve());
    expect(result.current).toBe(false);
  });

  it("the threshold is about 300 ms", () => {
    expect(SLOW_SCREEN_MS).toBe(300);
  });
});

describe("ScreenLoadingBar", () => {
  it("renders nothing when not active", () => {
    const { container } = render(<ScreenLoadingBar active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("when active: a decorative bar plus one polite status for assistive tech", () => {
    const { container } = render(<ScreenLoadingBar active />);
    expect(container.querySelector(".screen-loading-bar")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Loading page...");
  });
});
