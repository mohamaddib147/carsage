// Trip Planner screen (core feature) — destination in, estimated fuel
// cost + traffic-adjusted travel time out. No map UI, no route
// modifiers, no car selector (MVP is one car per user — uses the
// logged-in user's own car automatically, same as Dashboard/Car Profile).
// Layout matches docs/stitch_carsage_landing_page/carsage_trip_planner
// for the in-scope parts (route parameters card, 3-stat results row);
// its car-switcher chip, weather widget, and route-recommendation
// badges are out of scope (no multi-car selector, no live weather/route
// data) and are omitted.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { apiFetch } from "../lib/apiClient.js";

/**
 * Trip Planner screen: enter an (optional) starting location and a
 * (required) destination, call the FastAPI cost-estimate endpoint for
 * the user's car, and show the resulting fuel cost, duration, and
 * distance — or a clear error if the trip couldn't be planned.
 * @returns {JSX.Element}
 */
function TripPlannerPage() {
  const { user, session } = useAuth();

  const [car, setCar] = useState(null);
  const [loadingCar, setLoadingCar] = useState(true);

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationError, setDestinationError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadCar() {
      setLoadingCar(true);
      const { data } = await supabase
        .from("cars")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setCar(data ?? null);
      setLoadingCar(false);
    }

    loadCar();
    return () => {
      cancelled = true;
    };
  }, [user]);

  /** @param {import('react').FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");
    setResult(null);

    if (!destination.trim()) {
      setDestinationError("Destination is required.");
      return;
    }
    setDestinationError("");

    setSubmitting(true);
    try {
      const data = await apiFetch("/trip-planner/estimate", {
        method: "POST",
        accessToken: session.access_token,
        body: {
          car_id: car.id,
          destination: destination.trim(),
          origin: origin.trim() || undefined,
        },
      });
      setResult(data);
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCar) {
    return <PageShell title="Trip Planner" description="Loading your car..." />;
  }

  if (!car) {
    return (
      <PageShell
        title="Trip Planner"
        description="Add a car before planning a trip — fuel cost is calculated from its fuel efficiency."
      >
        <Link className="btn-primary" to="/cars/new">
          Add Your Car
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Trip Planner"
      description="Enter a destination to get estimated fuel cost and travel time."
    >
      <div className="route-params-card">
        <p className="form-section-label">Route Parameters</p>

        <form onSubmit={handleSubmit} noValidate className="car-form">
          <div className="form-field">
            <label htmlFor="origin">
              Starting Location <span className="form-field__hint">Optional</span>
            </label>
            <div className="route-input-row">
              <span
                className="route-input-row__marker route-input-row__marker--origin"
                aria-hidden="true"
              />
              <input
                id="origin"
                type="text"
                placeholder="e.g. Beirut, Lebanon"
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
              />
            </div>
          </div>

          <div className="form-field">
            <label htmlFor="destination">Destination *</label>
            <div className="route-input-row">
              <span
                className="route-input-row__marker route-input-row__marker--destination"
                aria-hidden="true"
              />
              <input
                id="destination"
                type="text"
                placeholder="e.g. Tripoli, Lebanon"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              />
            </div>
            {destinationError && (
              <p role="alert" className="auth-form__error">
                {destinationError}
              </p>
            )}
          </div>

          {submitError && (
            <p role="alert" className="auth-form__error">
              {submitError}
            </p>
          )}

          <button
            className="btn-primary btn-block"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Planning..." : "Plan Trip"}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
        </form>
      </div>

      {result && (
        <div className="trip-result-card">
          <p className="trip-result-card__route">
            {origin ? `${origin} → ${destination}` : destination}
          </p>
          <dl className="trip-result">
            <div className="trip-result__field">
              <span className="trip-result__icon" aria-hidden="true">
                ⛽
              </span>
              <dt>Fuel Cost</dt>
              <dd>
                ${result.estimated_cost_usd.toFixed(2)} (
                {result.estimated_cost_lbp.toLocaleString()} LBP)
              </dd>
              <p className="trip-result__caption">
                Based on {result.fuel_price_used_lbp.toLocaleString()} LBP/L
              </p>
            </div>
            <div className="trip-result__field">
              <span className="trip-result__icon" aria-hidden="true">
                ⏱️
              </span>
              <dt>Duration</dt>
              <dd>{result.duration_in_traffic_min} min</dd>
              <p className="trip-result__caption">Traffic-adjusted estimate</p>
            </div>
            <div className="trip-result__field">
              <span className="trip-result__icon" aria-hidden="true">
                📍
              </span>
              <dt>Distance</dt>
              <dd>{result.distance_km} km</dd>
            </div>
          </dl>
        </div>
      )}
    </PageShell>
  );
}

export default TripPlannerPage;
