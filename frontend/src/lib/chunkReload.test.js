// Tests the one-time reload after a failed chunk download (CAR-67 follow-up):
// it reloads once, never loops, and leaves the error alone when it can't guard.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { installChunkReloadGuard, RELOAD_WINDOW_MS } from "./chunkReload.js";

/** Fires a cancelable vite:preloadError on the target and returns the event. */
function firePreloadError(target) {
  const event = new Event("vite:preloadError", { cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("installChunkReloadGuard", () => {
  let target;
  let reload;
  let clock;

  beforeEach(() => {
    target = new EventTarget();
    reload = vi.fn();
    clock = 1_000_000;
    sessionStorage.clear();
  });

  const install = (options = {}) =>
    installChunkReloadGuard({ target, reload, now: () => clock, storage: sessionStorage, ...options });

  it("reloads once on the first failed download, and stops Vite from throwing", () => {
    install();
    const event = firePreloadError(target);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not reload again right after (edge case: no reload loop), and lets the error through to the error boundary", () => {
    install();
    firePreloadError(target);
    const second = firePreloadError(target);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(second.defaultPrevented).toBe(false);
  });

  it("survives the reload itself: a fresh install in the same tab still sees the earlier reload", () => {
    install();
    firePreloadError(target);
    const stop = install({ target: (target = new EventTarget()) });
    const event = firePreloadError(target);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  it("can reload again once the window has passed (a later deploy)", () => {
    install();
    firePreloadError(target);
    clock += RELOAD_WINDOW_MS + 1;
    firePreloadError(target);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("does not reload at all when sessionStorage is unavailable (the loop guard can't work)", () => {
    install({ storage: null });
    const event = firePreloadError(target);
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not reload when sessionStorage throws on read or write", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    install({ storage: broken });
    firePreloadError(target);
    expect(reload).not.toHaveBeenCalled();
  });

  it("stops listening when the returned function is called", () => {
    const stop = install();
    stop();
    firePreloadError(target);
    expect(reload).not.toHaveBeenCalled();
  });
});
