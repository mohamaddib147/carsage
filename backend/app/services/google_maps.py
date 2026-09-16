# Isolates all calls to the Google Maps Distance Matrix API behind one
# function, so the rest of the app never talks to Google directly and the
# provider could be swapped later without touching the router.

import httpx

from app.config import GOOGLE_MAPS_API_KEY

DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json"


class GoogleMapsError(Exception):
    """Raised when a route can't be resolved. Its message is safe to show
    to the end user — never wraps a raw exception or stack trace."""


def get_route_summary(origin: str, destination: str) -> dict:
    """
    Looks up the driving distance and duration (baseline and
    traffic-adjusted) between two addresses via the Google Maps Distance
    Matrix API.

    Args:
        origin: Starting address or place name.
        destination: Destination address or place name.

    Returns:
        A dict with distance_km (float), duration_min (int), and
        duration_in_traffic_min (int).

    Raises:
        GoogleMapsError: if the addresses can't be resolved into a route,
            or the Maps API call fails for any reason.
    """
    try:
        response = httpx.get(
            DISTANCE_MATRIX_URL,
            params={
                "origins": origin,
                "destinations": destination,
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

    if payload.get("status") != "OK":
        raise GoogleMapsError(
            "Could not calculate a route for the given addresses."
        )

    try:
        element = payload["rows"][0]["elements"][0]
    except (IndexError, KeyError) as error:
        raise GoogleMapsError(
            "Could not calculate a route for the given addresses."
        ) from error

    if element.get("status") != "OK":
        raise GoogleMapsError(
            "Could not find a route between that origin and destination. "
            "Check that both addresses are valid."
        )

    duration_in_traffic = element.get("duration_in_traffic", element["duration"])

    return {
        "distance_km": round(element["distance"]["value"] / 1000, 1),
        "duration_min": round(element["duration"]["value"] / 60),
        "duration_in_traffic_min": round(duration_in_traffic["value"] / 60),
    }
