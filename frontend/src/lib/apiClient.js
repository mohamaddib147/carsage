// Thin wrapper around fetch() for calling the FastAPI backend, so pages
// don't each repeat the base URL, JSON headers, and error-shape handling.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

/**
 * Calls a FastAPI endpoint and returns its parsed JSON body.
 * @param {string} path - e.g. "/trip-planner/estimate"
 * @param {{ method?: string, body?: object, accessToken?: string }} [options]
 * @returns {Promise<object>}
 * @throws {Error} with the backend's `detail` message if the response isn't ok.
 */
export async function apiFetch(path, { method = "GET", body, accessToken } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.detail;
    throw new Error(
      typeof message === "string"
        ? message
        : "Something went wrong. Please try again.",
    );
  }

  return data;
}
