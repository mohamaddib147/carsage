// Address suggestions for Trip Planner's location fields (CAR-47), via
// Google's Places API (New) `places:autocomplete` REST endpoint. Called
// straight from the browser: unlike the legacy Places REST endpoint it
// supports CORS, and it avoids loading the whole Maps JS SDK just for a
// dropdown. Needs `VITE_GOOGLE_MAPS_API_KEY` (a browser-exposed key —
// restrict it by HTTP referrer in Google Cloud Console, with "Places API
// (New)" enabled). Everything here is best-effort: any failure yields no
// suggestions, never an error, so typing an address by hand always works.

const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

/** @returns {string} the configured browser Maps key, or "" if unset. */
export function getPlacesApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
}

/** A fresh Places "session token" — groups a user's keystrokes plus their
 * final selection into one billing session. */
export function newSessionToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Fetches address/place suggestions for a partial input.
 * @param {string} input
 * @param {{ apiKey: string, sessionToken?: string, signal?: AbortSignal }} options
 * @returns {Promise<string[]>} full suggestion texts (place name + address),
 *   or [] on no match, no key, an HTTP error, a network failure, or abort.
 */
export async function fetchPlaceSuggestions(
  input,
  { apiKey, sessionToken, signal } = {},
) {
  if (!apiKey || !input.trim()) return [];

  try {
    const response = await fetch(AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({ input, sessionToken }),
      signal,
    });
    if (!response.ok) return [];

    const data = await response.json();
    return (data.suggestions ?? [])
      .map((suggestion) => suggestion.placePrediction?.text?.text)
      .filter(Boolean);
  } catch {
    return [];
  }
}
