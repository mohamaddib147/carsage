// Decorative static map banner for Trip Planner results (CAR-48): a single
// image from the Google Maps Static API with a marker at the origin and
// destination and the driving route between them. Deliberately NOT a
// live/interactive map — it is a plain <img>: no link, no pan/zoom, no
// controls (interactive maps and live GPS were explicitly cut from scope,
// see CLAUDE.md). The route is drawn from the encoded polyline the
// backend's Directions call already returns (path=enc:...), so it follows
// the real roads. With no polyline (or one too long for a URL) only the
// markers are shown — never a straight line, which would misrepresent the
// route.
//
// Purely additive: with no VITE_GOOGLE_MAPS_API_KEY, no destination, or if
// the image fails to load (bad key, Static Maps API not enabled, quota,
// offline), it renders nothing, so the cost/time/distance results next to
// it are never blocked or broken.

import { useState } from "react";
import { getPlacesApiKey } from "../lib/placesAutocomplete.js";

const STATIC_MAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
// The frame requested from Google. Static Maps picks the largest whole zoom
// level that fits the whole route, so a very wide banner (the old 640x160)
// wasted a lot of sea/land on a north-south route; ~2:1 lets it zoom in
// tighter. The CSS box uses this same ratio (index.css .route-map) so the
// image is shown whole, never cropped.
const MAP_SIZE = "640x300";
// Static Maps rejects URLs over 16,384 characters; stay safely under it.
const MAX_URL_LENGTH = 16000;

/**
 * Builds the Static Maps URL for a route, or null if it can't be built.
 * @param {string} origin - may be empty (destination-only marker then)
 * @param {string} destination
 * @param {string} apiKey
 * @param {string | null} [polyline] - encoded overview polyline of the
 *   driving route (from the backend); omitted -> markers only
 * @returns {string | null}
 */
export function buildStaticMapUrl(origin, destination, apiKey, polyline) {
  if (!apiKey || !destination?.trim()) return null;

  const from = origin?.trim();
  const to = destination.trim();
  const build = (withRoute) =>
    [
      `size=${MAP_SIZE}`,
      "scale=2",
      "maptype=roadmap",
      ...(from
        ? [`markers=${encodeURIComponent(`color:0x00594C|label:A|${from}`)}`]
        : []),
      `markers=${encodeURIComponent(`color:0xC9A24B|label:B|${to}`)}`,
      ...(withRoute
        ? [`path=${encodeURIComponent(`color:0x00594Cff|weight:4|enc:${polyline}`)}`]
        : []),
      `key=${encodeURIComponent(apiKey)}`,
    ].join("&");

  let query = build(Boolean(polyline));
  if (polyline && `${STATIC_MAP_URL}?${query}`.length > MAX_URL_LENGTH) {
    query = build(false);
  }
  return `${STATIC_MAP_URL}?${query}`;
}

/**
 * @param {{ origin?: string, destination: string, polyline?: string | null }} props
 * @returns {JSX.Element | null}
 */
function RouteMapImage({ origin, destination, polyline }) {
  const url = buildStaticMapUrl(origin, destination, getPlacesApiKey(), polyline);
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
