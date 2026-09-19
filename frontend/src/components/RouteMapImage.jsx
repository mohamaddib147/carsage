// Decorative static map banner for Trip Planner results (CAR-48): a single
// image from the Google Maps Static API with a marker at the origin and
// destination. Deliberately NOT a live/interactive map — it is a plain
// <img>: no link, no pan/zoom, no controls (interactive maps and live GPS
// were explicitly cut from scope, see CLAUDE.md). The line between the
// markers is a straight connector, not the driving route.
//
// Purely additive: with no VITE_GOOGLE_MAPS_API_KEY, no destination, or if
// the image fails to load (bad key, Static Maps API not enabled, quota,
// offline), it renders nothing, so the cost/time/distance results next to
// it are never blocked or broken.

import { useState } from "react";
import { getPlacesApiKey } from "../lib/placesAutocomplete.js";

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";

/**
 * Builds the Static Maps URL for a route, or null if it can't be built.
 * @param {string} origin - may be empty (destination-only marker then)
 * @param {string} destination
 * @param {string} apiKey
 * @returns {string | null}
 */
export function buildStaticMapUrl(origin, destination, apiKey) {
  if (!apiKey || !destination?.trim()) return null;

  const from = origin?.trim();
  const to = destination.trim();
  const parts = [
    "size=640x160",
    "scale=2",
    "maptype=roadmap",
    ...(from
      ? [`markers=${encodeURIComponent(`color:0x00594C|label:A|${from}`)}`]
      : []),
    `markers=${encodeURIComponent(`color:0xC9A24B|label:B|${to}`)}`,
    ...(from
      ? [`path=${encodeURIComponent(`color:0x00594Cff|weight:4|${from}|${to}`)}`]
      : []),
    `key=${encodeURIComponent(apiKey)}`,
  ];
  return `${STATIC_MAP_URL}?${parts.join("&")}`;
}

/**
 * @param {{ origin?: string, destination: string }} props
 * @returns {JSX.Element | null}
 */
function RouteMapImage({ origin, destination }) {
  const url = buildStaticMapUrl(origin, destination, getPlacesApiKey());
  // Remember which URL failed, so a later, different route gets a fresh try.
  const [failedUrl, setFailedUrl] = useState(null);

  if (!url || failedUrl === url) return null;

  return (
    <div className="route-map" data-testid="route-map">
      <img
        className="route-map__image"
        src={url}
        alt=""
        aria-hidden="true"
        draggable="false"
        onError={() => setFailedUrl(url)}
      />
    </div>
  );
}

export default RouteMapImage;
