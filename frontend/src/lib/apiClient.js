// Thin wrapper around fetch() for calling the FastAPI backend, so pages
// don't each repeat the base URL, JSON headers, and error-shape handling.

import { trackRequest } from "./coldStart.js";
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
  // CAR-57 (registration-card scan): a FormData body (a file upload) is
  // sent as-is — the browser sets its own multipart Content-Type with the
  // boundary, which we must not override. Every other call keeps JSON.
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers = isFormData ? {} : { "Content-Type": "application/json" };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Render's free tier spins the backend down after inactivity, so the
  // first request after that can take up to a minute to wake it back up.
  // Flags that (via ColdStartBanner) instead of leaving the page looking
  // stuck, without touching the request/response itself.
  const stopTracking = trackRequest();

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // The browser's own wording ("Failed to fetch", "Load failed", ...) is
    // technical and differs per browser; say it in plain words instead.
    throw new Error(NETWORK_ERROR_MESSAGE);
  } finally {
    stopTracking();
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
