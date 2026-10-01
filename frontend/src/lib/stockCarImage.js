// CAR-59: a real stock photo of a car's make/model, shown on Car Profile/
// Car Onboarding in place of the plain silhouette placeholder when no
// photo has been uploaded for that car. Uses IMAGIN.studio's getImage API
// (https://docs.imagin.studio) — a client-exposed "customer" key embedded
// directly in a plain GET URL used as an <img src>, same usage shape as
// this project's existing VITE_GOOGLE_MAPS_API_KEY (see
// lib/placesAutocomplete.js's header comment). Never stored: the URL is
// constructed fresh at render time from the car's own make/model/year,
// the same "no key configured -> null, never throws" contract every other
// optional-key helper in this codebase follows.

const IMAGE_BASE_URL = "https://cdn.imagin.studio/getImage";

/** @returns {string} the configured IMAGIN.studio key, or "" if unset. */
export function getStockImageApiKey() {
  return import.meta.env.VITE_IMAGIN_STUDIO_KEY || "";
}

/**
 * Builds a stock photo URL for a car's make/model(/year), or null if the
 * feature isn't configured or there isn't enough to ask for yet.
 * @param {string | null | undefined} make
 * @param {string | null | undefined} model
 * @param {string | number | null | undefined} [year] - optional; IMAGIN.studio
 *   falls back to its latest known year for the make/model when omitted.
 * @returns {string | null}
 */
export function getStockCarImageUrl(make, model, year) {
  const apiKey = getStockImageApiKey();
  const trimmedMake = (make ?? "").trim();
  const trimmedModel = (model ?? "").trim();
  if (!apiKey || !trimmedMake || !trimmedModel) return null;

  const params = new URLSearchParams({
    customer: apiKey,
    make: trimmedMake,
    modelFamily: trimmedModel,
  });
  if (year) params.set("modelYear", String(year));

  return `${IMAGE_BASE_URL}?${params.toString()}`;
}
