// Thin wrapper around fetch() for calling the FastAPI backend, so pages
// don't each repeat the base URL, JSON headers, and error-shape handling.

import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from "./limits.js";

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

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // The browser's own wording ("Failed to fetch", "Load failed", ...) is
    // technical and differs per browser; say it in plain words instead.
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // Only a plain-text `detail` is shown. The backend writes every one of
    // those itself (validation errors, whose `detail` is a list, and a
    // server crash, which has no JSON body, both fall through to the
    // generic sentence).
    const message = data?.detail;
    throw new Error(typeof message === "string" ? message : GENERIC_ERROR_MESSAGE);
  }

  return data;
}
