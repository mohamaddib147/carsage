// Where a successful log-in sends the user, and (CAR-71) where a signed-in
// visit to /login or /signup goes: back to the protected screen that sent
// them to log in, else the Dashboard. That "from" screen is router state set
// by <ProtectedRoute>, never a URL parameter, but it is still checked so it
// can only ever name a path inside this app.

const DEFAULT_DESTINATION = "/dashboard";

// The two screens that redirect a signed-in user; returning to them would loop.
const AUTH_PATHS = ["/login", "/signup"];

/**
 * Returns `path` if it is a safe in-app path, otherwise the Dashboard.
 * Safe means: a string starting with exactly one slash, with no "//"
 * anywhere, no backslash ("/\host" is another site to a browser), no
 * control characters, and not /login or /signup themselves.
 * @param {unknown} path
 * @returns {string}
 */
export function safeReturnPath(path) {
  if (typeof path !== "string" || !path.startsWith("/")) return DEFAULT_DESTINATION;
  // eslint-disable-next-line no-control-regex
  if (path.includes("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return DEFAULT_DESTINATION;
  if (AUTH_PATHS.includes(path.replace(/\/+$/, "").toLowerCase())) return DEFAULT_DESTINATION;
  return path;
}

/**
 * The destination after logging in, read from the router location.
 * @param {{ state?: { from?: { pathname?: unknown } } } | null | undefined} location
 * @returns {string}
 */
export function loginDestination(location) {
  return safeReturnPath(location?.state?.from?.pathname);
}
