// Recovers from a failed screen download after a new deploy (CAR-67 follow-up).
//
// Every build gives its chunks new hashed file names and the old files are
// removed on deploy. A tab opened before the deploy then asks for a chunk that
// no longer exists, and Vite fires `vite:preloadError` on window. Reloading
// fetches the new index.html and fixes it, so we reload once.
//
// Loop guard: the time of the last automatic reload is kept in sessionStorage;
// within RELOAD_WINDOW_MS of it we do NOT reload again (a chunk that is broken
// for another reason, say the user is offline, would otherwise reload forever)
// and let the error reach the error boundary, which shows a Reload button.
// A later deploy, more than a window away, can reload again. Without usable
// sessionStorage the guard can't work, so we don't reload at all.

// What browsers say when a dynamic import() can't fetch its file: Chrome,
// Firefox and Safari respectively, plus Vite's own preload failure message.
const CHUNK_LOAD_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload/i;

/**
 * Whether an error is a failed screen download (rather than, say, a crash).
 * @param {unknown} error
 * @returns {boolean}
 */
export function isChunkLoadError(error) {
  return CHUNK_LOAD_ERROR.test(String(error?.message ?? error ?? ""));
}

const STORAGE_KEY = "carsage.chunkReloadAt";

/** Minimum time between two automatic reloads. */
export const RELOAD_WINDOW_MS = 30_000;

/** @returns {Storage | null} sessionStorage, or null where it's blocked. Never throws. */
function getSessionStorage() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Starts listening for `vite:preloadError`. On the first failure in a window it
 * stops Vite from throwing (preventDefault) and reloads the page; otherwise it
 * leaves the error alone so the error boundary can show it.
 * @param {{ target?: EventTarget, storage?: Storage | null, reload?: () => void, now?: () => number }} [options]
 * @returns {() => void} stop listening
 */
export function installChunkReloadGuard({
  target = window,
  storage = getSessionStorage(),
  reload = () => window.location.reload(),
  now = Date.now,
} = {}) {
  function handlePreloadError(event) {
    if (!storage) return;
    let lastReloadAt = 0;
    try {
      lastReloadAt = Number(storage.getItem(STORAGE_KEY)) || 0;
    } catch {
      return;
    }
    if (now() - lastReloadAt < RELOAD_WINDOW_MS) return;
    try {
      storage.setItem(STORAGE_KEY, String(now()));
    } catch {
      return;
    }
    event.preventDefault();
    reload();
  }

  target.addEventListener("vite:preloadError", handlePreloadError);
  return () => target.removeEventListener("vite:preloadError", handlePreloadError);
}
