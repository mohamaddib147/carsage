# Isolates all calls to the Google Maps Directions API behind one
# function, so the rest of the app never talks to Google directly and the
# provider could be swapped later without touching the router.
#
# CAR-48: this used to call the Distance Matrix API, which returns no route
# geometry. The Directions API returns the same distance / duration /
# duration_in_traffic AND the route's encoded overview polyline in one call,
# so the Trip Planner's static map can draw the real driving route (one
# request, not two, and the cost/time figures come from the same route).

import httpx

from app.config import GOOGLE_MAPS_API_KEY

DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json"

# Top-level Directions statuses that mean "we understood the request but
# there is no route for these addresses" (as opposed to a config/quota
# problem such as REQUEST_DENIED or OVER_QUERY_LIMIT).
_NO_ROUTE_STATUSES = {"NOT_FOUND", "ZERO_RESULTS"}


class GoogleMapsError(Exception):
    """Raised when a route can't be resolved. Its message is safe to show
    to the end user — never wraps a raw exception or stack trace."""


def get_route_summary(origin: str, destination: str) -> dict:
    """
    Looks up the driving route between two addresses via the Google Maps
    Directions API.

    Args:
        origin: Starting address or place name.
        destination: Destination address or place name.

    Returns:
        A dict with distance_km (float), duration_min (int),
        duration_in_traffic_min (int), and route_polyline (the route's
        encoded overview polyline, or None if Google didn't return one).

    Raises:
        GoogleMapsError: if the addresses can't be resolved into a route,
            or the Maps API call fails for any reason.
    """
    try:
        response = httpx.get(
            DIRECTIONS_URL,
            params={
                "origin": origin,
                "destination": destination,
                # Requesting traffic-adjusted duration requires a departure
                # time; "now" gives live traffic conditions.
                "departure_time": "now",
                "key": GOOGLE_MAPS_API_KEY,
            },
            timeout=10.0,
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        raise GoogleMapsError(
            "Could not reach the maps service. Please try again."
        ) from error

    payload = response.json()
    status = payload.get("status")

    if status in _NO_ROUTE_STATUSES:
        raise GoogleMapsError(
            "Could not find a route between that origin and destination. "
            "Check that both addresses are valid."
        )
    if status != "OK":
        raise GoogleMapsError(
            "Could not calculate a route for the given addresses."
        )

    try:
        route = payload["routes"][0]
        leg = route["legs"][0]
        distance_m = leg["distance"]["value"]
        duration_s = leg["duration"]["value"]
    except (IndexError, KeyError, TypeError) as error:
        raise GoogleMapsError(
            "Could not calculate a route for the given addresses."
        ) from error

    duration_in_traffic = leg.get("duration_in_traffic", leg["duration"])
    polyline = (route.get("overview_polyline") or {}).get("points") or None

    return {
        "distance_km": round(distance_m / 1000, 1),
        "duration_min": round(duration_s / 60),
        "duration_in_traffic_min": round(duration_in_traffic["value"] / 60),
        "route_polyline": polyline,
    }
