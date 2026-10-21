// True once a screen has been downloading for longer than `delayMs` (CAR-67
// follow-up). Fast loads never flash an indicator; only the slow ones do. The
// source of truth is the counter in screenLoading.js.

import { useEffect, useState, useSyncExternalStore } from "react";
import { getScreenLoadCount, subscribeScreenLoads } from "./screenLoading.js";

/** How long a screen may take before the "loading" indicator appears. */
export const SLOW_SCREEN_MS = 300;

/**
 * @param {number} [delayMs]
 * @returns {boolean} whether a screen download has been in flight for longer than delayMs
 */
export function useSlowScreenLoad(delayMs = SLOW_SCREEN_MS) {
  const loading = useSyncExternalStore(subscribeScreenLoads, () => getScreenLoadCount() > 0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setSlow(true), delayMs);
    // Cleanup runs when the load ends: stop the timer and arm the next one.
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [loading, delayMs]);

  // `slow` alone could be stale for a render after a load ends, so combine them.
  return loading && slow;
}
