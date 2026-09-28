// Tracks whether an in-flight backend request has been running long enough
// that it's probably Render's free-tier cold start (the service spins down
// after inactivity; the first request after that can take 30-60s to wake
// it back up), not just a slow network. A plain module-level pub-sub
// rather than a React context, since apiFetch (a plain async function, not
// a hook/component) is the thing that needs to report this — the actual
// UI (components/ColdStartBanner.jsx) just subscribes.

/** How long a request must be pending before it's treated as a cold start,
 * not just an ordinary slow response. Comfortably above any real endpoint's
 * normal latency (the slowest, AI Advisor's classify call, is usually a
 * few seconds), well under Render's up-to-a-minute wake time. */
export const COLD_START_THRESHOLD_MS = 6000;

let pendingSlowRequests = 0;
const listeners = new Set();

function notify() {
  const isSlow = pendingSlowRequests > 0;
  for (const listener of listeners) listener(isSlow);
}

/**
 * Subscribes to cold-start state changes. Returns an unsubscribe function.
 * @param {(isSlow: boolean) => void} listener
 * @returns {() => void}
 */
export function onColdStartChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts a timer for one request; call the returned function once that
 * request settles (success or failure) to stop tracking it. Safe to call
 * for many concurrent requests — the banner only clears once none are
 * still slow. */
export function trackRequest() {
  let firedSlow = false;
  const timer = setTimeout(() => {
    firedSlow = true;
    pendingSlowRequests += 1;
    notify();
  }, COLD_START_THRESHOLD_MS);

  return function stopTracking() {
    clearTimeout(timer);
    if (firedSlow) {
      pendingSlowRequests = Math.max(0, pendingSlowRequests - 1);
      notify();
    }
  };
}
