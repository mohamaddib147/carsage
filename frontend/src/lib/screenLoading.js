// Tracks which lazily loaded screens are still downloading (CAR-67 follow-up),
// so the app can show a "loading" indicator when opening a screen is slow.
//
// Why not ask React Router: its navigations run inside a React transition, so
// the previous screen stays on display while the next one's code downloads and
// no Suspense fallback ever shows for a tap, a back-button press or a redirect.
// Counting the dynamic imports themselves covers all three the same way.
//
// lazyScreen() is React.lazy plus that counting. The counter is a tiny external
// store (subscribe / getScreenLoadCount) read with useSyncExternalStore.

import { lazy } from "react";

let pendingCount = 0;
const listeners = new Set();

function notify() {
  for (const listener of listeners) listener();
}

/**
 * Counts one in-flight screen download until it settles (success or failure).
 * @template T
 * @param {Promise<T>} promise the dynamic import
 * @returns {Promise<T>} the same promise, unchanged
 */
export function trackScreenLoad(promise) {
  pendingCount += 1;
  notify();
  const done = () => {
    pendingCount -= 1;
    notify();
  };
  promise.then(done, done);
  return promise;
}

/**
 * React.lazy for a screen, counted by trackScreenLoad.
 *
 * If the factory resolves to nothing, a failed download whose error was
 * swallowed by chunkReload.js (it calls preventDefault on `vite:preloadError`,
 * which makes Vite resolve the import with undefined) because a page reload is
 * already on its way. Staying suspended, instead of letting React throw on an
 * empty module, keeps the loading skeleton on screen until the reload lands, so
 * no error message flashes first.
 * @param {() => Promise<{ default: import('react').ComponentType<any> } | undefined>} factory
 * @returns {import('react').LazyExoticComponent<import('react').ComponentType<any>>}
 */
export function lazyScreen(factory) {
  return lazy(() =>
    trackScreenLoad(factory().then((screen) => screen ?? new Promise(() => {}))),
  );
}

/** @param {() => void} listener @returns {() => void} unsubscribe */
export function subscribeScreenLoads(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @returns {number} how many screen downloads are in flight right now */
export function getScreenLoadCount() {
  return pendingCount;
}
