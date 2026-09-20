// Trip Planner screen (core feature) — destination in, estimated fuel
// cost + traffic-adjusted travel time out. No route modifiers. Loads
// all of the logged-in user's cars; if there's more than one, a plain
// <select> lets the user pick which one to plan the trip with (CAR-37)
// — with exactly one car it's used automatically, same as before.
// Layout matches docs/stitch_carsage_landing_page/carsage_trip_planner
// for the in-scope parts (route parameters card, 3-stat results row);
// its weather widget and route-recommendation badges are out of scope
// (no live weather/route data) and are omitted — the car selector here
// is a plain <select> rather than that reference's chip-style switcher,
// since CAR-37 only asked for a way to choose the car, not to match
// that specific control.
//
// CAR-41: the fuel price per liter is now an editable field (the
// backend's fuel_price_per_liter_lbp override already existed — this
// just exposes it), pre-filled from GET /trip-planner/fuel-prices for
// the selected car's fuel grade. A "Full Tank Cost" stat is also shown,
// using an editable tank size.
//
// CAR-49: that tank size is now the selected car's own
// fuel_tank_capacity_liters (CAR-44), refilled whenever the car is
// switched — the old hardcoded 20L default is gone. If the car has no tank
// size yet the field starts empty and the Full Tank Cost stat says so
// (with a link to the car's profile) instead of showing a made-up number;
// a size the user types in themselves still works. The field is reset
// explicitly (in the same update as the car switch, and remounted via its
// key) so stale digits can never be carried over, and values outside
// 5-200 L are flagged and never used for a figure (lib/tankCapacity.js).
//
// Polish: the Fuel Price and Tank Size override fields live in a collapsed
// "Advanced options" section (closed by default, so the everyday flow is
// pick car -> destination -> Plan Trip). Their state and behavior are
// unchanged; the section opens itself if the tank size is invalid so the
// error is never hidden. Both show thousand separators
// (components/FormattedNumberInput.jsx) while state holds the raw number.
//
// CAR-48: a decorative, non-interactive static map banner
// (components/RouteMapImage.jsx) tops the results card when a browser
// Maps key is configured; it hides itself on any failure.
//
// CAR-47: Starting Location and Destination offer Google Places address
// suggestions (components/PlaceAutocompleteInput.jsx) but remain plain
// free-text fields — the typed/selected string is what goes to the
// existing estimate call, unchanged.
//
// CAR-46: a traffic-light badge (Light/Moderate/Heavy) next to the
// duration, derived from baseline vs traffic-adjusted duration via
// lib/trafficLevel.js — no extra API call.
//
// CAR-45: an info icon next to the (light-traffic / rated-efficiency) fuel
// cost explains that it assumes ideal conditions — copy only, no change
// to the calculation.
//
// CAR-42: the results show both a light-traffic estimate (the original
// estimated_cost_lbp/usd — close to the car's rated fuel efficiency)
// and a current-traffic estimate (estimated_cost_current_traffic_lbp/usd
// — adjusted down for congestion server-side), with a caption explaining
// why they differ. Both new fields are optional on the result object so
// this degrades gracefully against an older cached response shape.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import FormattedNumberInput from "../components/FormattedNumberInput.jsx";
import InfoTip from "../components/InfoTip.jsx";
import PageShell from "../components/PageShell.jsx";
import PlaceAutocompleteInput from "../components/PlaceAutocompleteInput.jsx";
import RouteMapImage from "../components/RouteMapImage.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { apiFetch } from "../lib/apiClient.js";
import { LIMITS, getFuelPriceError } from "../lib/limits.js";
import { getTankCapacityError } from "../lib/tankCapacity.js";
import { getTrafficLevel } from "../lib/trafficLevel.js";

// Fallback if GET /trip-planner/fuel-prices hasn't loaded yet — matches
// the backend's own documented fixed rate (see fuel_prices.LBP_PER_USD).
const FALLBACK_LBP_PER_USD = 89000;

/** Maps a car's general fuel_type onto the price bucket fuel-prices
 * tracks — mirrors app/routers/trip_planner.py's
 * _price_bucket_for_car_fuel_type so the prefilled price matches what
 * the backend would pick by default. */
function priceBucketForFuelType(fuelType) {
  const normalized = (fuelType || "").trim().toLowerCase();
  if (normalized === "diesel") return "diesel";
  if (normalized === "electric") return null;
  return "95_octane";
}

/**
 * The Tank Size field's text for a car: its stored capacity, or "" if it
 * has none — never a default.
 * @param {{ fuel_tank_capacity_liters?: number | string | null } | null | undefined} car
 * @returns {string}
 */
function tankInputFor(car) {
  const capacity = Number(car?.fuel_tank_capacity_liters);
  return capacity > 0 ? String(capacity) : "";
}

/**
 * Trip Planner screen: enter an (optional) starting location and a
 * (required) destination, call the FastAPI cost-estimate endpoint for
 * the user's car, and show the resulting fuel cost, duration, and
 * distance — or a clear error if the trip couldn't be planned.
 * @returns {JSX.Element}
 */
function TripPlannerPage() {
  const { user, session } = useAuth();

  const [cars, setCars] = useState([]);
  const [loadingCar, setLoadingCar] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationError, setDestinationError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  // The route the current result was actually computed for — captured at
  // submit time so the decorative map (CAR-48) can't drift from the result
  // if the user edits the fields afterwards.
  const [submittedRoute, setSubmittedRoute] = useState(null);

  const [fuelPrices, setFuelPrices] = useState(null);
  const [fuelPriceInput, setFuelPriceInput] = useState("");
  const [tankSizeInput, setTankSizeInput] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const fuelPriceEditedRef = useRef(false);

  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? null;

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadCars() {
      setLoadingCar(true);
      const { data } = await supabase
        .from("cars")
        .select("id, make, model, year, fuel_type, fuel_tank_capacity_liters")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      const loadedCars = data ?? [];
      setCars(loadedCars);
      setSelectedCarId(loadedCars[0]?.id ?? "");
      setTankSizeInput(tankInputFor(loadedCars[0]));
      setLoadingCar(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // CAR-41: fetch the current default fuel prices once, to prefill the
  // editable fuel price field — non-critical, so a failure here just
  // leaves the field for the user to fill in (or the backend falls back
  // to its own default if it's left blank).
  useEffect(() => {
    let cancelled = false;

    async function loadFuelPrices() {
      try {
        const data = await apiFetch("/trip-planner/fuel-prices");
        if (!cancelled) setFuelPrices(data);
      } catch {
        // Non-critical — see comment above.
      }
    }

    loadFuelPrices();
    return () => {
      cancelled = true;
    };
  }, []);

  // An invalid tank size or fuel price must never be hidden inside the closed section.
  useEffect(() => {
    if (getTankCapacityError(tankSizeInput) || getFuelPriceError(fuelPriceInput)) {
      setAdvancedOpen(true);
    }
  }, [tankSizeInput, fuelPriceInput]);

  /** CAR-49: switching cars fully replaces the Tank Size text with the new
   * car's capacity (or empties it) in the same update — never appends to
   * or keeps anything typed for the previous car.
   * @param {string} carId */
  function handleCarChange(carId) {
    setSelectedCarId(carId);
    setTankSizeInput(tankInputFor(cars.find((car) => car.id === carId)));
  }

  // Prefills the fuel price for the selected car's fuel grade, but never
  // overwrites a value the user already typed themselves.
  useEffect(() => {
    if (fuelPriceEditedRef.current || !fuelPrices || !selectedCar) return;

    const bucket = priceBucketForFuelType(selectedCar.fuel_type);
    const price = bucket ? fuelPrices.prices?.[bucket]?.lbp_per_liter : null;
    if (price != null) setFuelPriceInput(String(price));
  }, [fuelPrices, selectedCar]);

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

    // Same 1 - 10,000,000 bound the server enforces; show it instead of sending.
    if (getFuelPriceError(fuelPriceInput)) {
      setAdvancedOpen(true);
      return;
    }

    const parsedFuelPrice = Number(fuelPriceInput);
    const fuelPriceOverride =
      Number.isFinite(parsedFuelPrice) && parsedFuelPrice > 0
        ? parsedFuelPrice
        : undefined;

    setSubmitting(true);
    try {
      const data = await apiFetch("/trip-planner/estimate", {
        method: "POST",
        accessToken: session.access_token,
        body: {
          car_id: selectedCarId,
          destination: destination.trim(),
          origin: origin.trim() || undefined,
          fuel_price_per_liter_lbp: fuelPriceOverride,
        },
      });
      setResult(data);
      setSubmittedRoute({
        origin: origin.trim(),
        destination: destination.trim(),
        polyline: data.route_polyline ?? null,
      });
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingCar) {
    return <PageShell title="Trip Planner" description="Loading your car..." />;
  }

  if (cars.length === 0) {
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

  const tankSizeLiters = Number(tankSizeInput);
  // CAR-49: blank = not set; anything outside 5-200 L is flagged, and no
  // Full Tank Cost is calculated from it.
  const tankSizeError = getTankCapacityError(tankSizeInput);
  const tankSizeUsable = tankSizeInput.trim() !== "" && !tankSizeError;
  const lbpPerUsd = fuelPrices?.lbp_per_usd ?? FALLBACK_LBP_PER_USD;
  const tankCostLbp =
    result && tankSizeUsable
      ? Math.round(tankSizeLiters * result.fuel_price_used_lbp)
      : null;
  const tankCostUsd = tankCostLbp != null ? tankCostLbp / lbpPerUsd : null;
  const trafficLevel = result
    ? getTrafficLevel(result.duration_min, result.duration_in_traffic_min)
    : null;
  const hasTrafficComparison =
    result?.estimated_cost_current_traffic_lbp != null &&
    result?.estimated_cost_current_traffic_usd != null;

  return (
    <PageShell
      title="Trip Planner"
      description="Enter a destination to get estimated fuel cost and travel time."
    >
      <div className="route-params-card">
        <p className="form-section-label">Route Parameters</p>

        <form onSubmit={handleSubmit} noValidate className="car-form">
          {cars.length > 1 && (
            <div className="form-field">
              <label htmlFor="carId">Car</label>
              <select
                id="carId"
                value={selectedCarId}
                onChange={(event) => handleCarChange(event.target.value)}
              >
                {cars.map((carOption) => (
                  <option key={carOption.id} value={carOption.id}>
                    {[carOption.year, carOption.make, carOption.model]
                      .filter(Boolean)
                      .join(" ")}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field">
            <label htmlFor="origin">
              Starting Location <span className="form-field__hint">Optional</span>
            </label>
            <div className="route-input-row">
              <span
                className="route-input-row__marker route-input-row__marker--origin"
                aria-hidden="true"
              />
              <PlaceAutocompleteInput
                id="origin"
                maxLength={LIMITS.PLACE}
                placeholder="e.g. Beirut, Lebanon"
                value={origin}
                onChange={setOrigin}
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
              <PlaceAutocompleteInput
                id="destination"
                maxLength={LIMITS.PLACE}
                placeholder="e.g. Tripoli, Lebanon"
                value={destination}
                onChange={setDestination}
              />
            </div>
            {destinationError && (
              <p role="alert" className="auth-form__error">
                {destinationError}
              </p>
            )}
          </div>

          <details
            className="advanced-options"
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
          >
            <summary className="advanced-options__toggle">
              Advanced options
              <span className="form-field__hint">Fuel price &amp; tank size</span>
            </summary>

            <div className="form-grid advanced-options__fields">
              <div className="form-field">
                <label htmlFor="fuelPricePerLiter">
                  Fuel Price (LBP/L) <span className="form-field__hint">Editable</span>
                </label>
                <FormattedNumberInput
                  id="fuelPricePerLiter"
                  placeholder="Current default used if blank"
                  value={fuelPriceInput}
                  onChange={(raw) => {
                    fuelPriceEditedRef.current = true;
                    setFuelPriceInput(raw);
                  }}
                  aria-invalid={getFuelPriceError(fuelPriceInput) ? "true" : undefined}
                />
                {getFuelPriceError(fuelPriceInput) && (
                  <p role="alert" className="auth-form__error">
                    {getFuelPriceError(fuelPriceInput)}
                  </p>
                )}
              </div>

              <div className="form-field">
                <label htmlFor="tankSize">
                  Tank Size (L) <span className="form-field__hint">Editable</span>
                </label>
                <FormattedNumberInput
                  key={selectedCarId}
                  id="tankSize"
                  allowDecimal
                  placeholder="Not set for this car"
                  value={tankSizeInput}
                  aria-invalid={tankSizeError ? "true" : undefined}
                  onChange={setTankSizeInput}
                />
                {tankSizeError && (
                  <p role="alert" className="auth-form__error">
                    {tankSizeError}
                  </p>
                )}
              </div>
            </div>
          </details>

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
          {submittedRoute && (
            <RouteMapImage
              origin={submittedRoute.origin}
              destination={submittedRoute.destination}
              polyline={submittedRoute.polyline}
            />
          )}
          <p className="trip-result-card__route">
            {origin ? `${origin} → ${destination}` : destination}
          </p>
          <dl className="trip-result">
            <div className="trip-result__field">
              <span className="trip-result__icon" aria-hidden="true">
                ⛽
              </span>
              <dt>
                Fuel Cost{hasTrafficComparison ? " (Light Traffic)" : ""}
                <InfoTip label="About this fuel cost estimate">
                  This estimate uses your car&apos;s rated fuel efficiency under
                  ideal conditions. Actual consumption may be higher in heavy
                  traffic.
                </InfoTip>
              </dt>
              <dd>
                ${result.estimated_cost_usd.toFixed(2)} (
                {result.estimated_cost_lbp.toLocaleString()} LBP)
              </dd>
              <p className="trip-result__caption">
                Based on {result.fuel_price_used_lbp.toLocaleString()} LBP/L
              </p>
            </div>
            {hasTrafficComparison && (
              <div className="trip-result__field">
                <span className="trip-result__icon" aria-hidden="true">
                  🚦
                </span>
                <dt>Fuel Cost (Current Traffic)</dt>
                <dd>
                  ${result.estimated_cost_current_traffic_usd.toFixed(2)} (
                  {result.estimated_cost_current_traffic_lbp.toLocaleString()} LBP)
                </dd>
                <p className="trip-result__caption">
                  Adjusted for current congestion
                </p>
              </div>
            )}
            <div className="trip-result__field">
              <span className="trip-result__icon" aria-hidden="true">
                ⏱️
              </span>
              <dt>Duration</dt>
              <dd>{result.duration_in_traffic_min} min</dd>
              {trafficLevel && (
                <span
                  className={`traffic-badge traffic-badge--${trafficLevel.level}`}
                >
                  <span className="traffic-badge__dot" aria-hidden="true" />
                  {trafficLevel.label}
                </span>
              )}
              <p className="trip-result__caption">Traffic-adjusted estimate</p>
            </div>
            <div className="trip-result__field">
              <span className="trip-result__icon" aria-hidden="true">
                📍
              </span>
              <dt>Distance</dt>
              <dd>{result.distance_km} km</dd>
            </div>
            <div className="trip-result__field">
              <span className="trip-result__icon" aria-hidden="true">
                🛢️
              </span>
              <dt>Full Tank Cost</dt>
              {tankCostLbp != null ? (
                <>
                  <dd>
                    ${tankCostUsd.toFixed(2)} ({tankCostLbp.toLocaleString()} LBP)
                  </dd>
                  <p className="trip-result__caption">
                    {tankSizeLiters}L at{" "}
                    {result.fuel_price_used_lbp.toLocaleString()} LBP/L
                  </p>
                </>
              ) : tankSizeError ? (
                <>
                  <dd>Tank size out of range</dd>
                  <p className="trip-result__caption">
                    Enter a tank size between 5 and 200 L to see this figure.
                  </p>
                </>
              ) : (
                <>
                  <dd>Tank size not set</dd>
                  <p className="trip-result__caption">
                    Enter a tank size under Advanced options, or add it on{" "}
                    <Link to={`/cars/${selectedCarId}`}>this car&apos;s profile</Link>.
                  </p>
                </>
              )}
            </div>
          </dl>
          {hasTrafficComparison && (
            <p className="trip-result__explainer">
              Light traffic assumes free-flowing driving close to your
              car&apos;s rated fuel efficiency. Heavy traffic means more
              stop-and-go driving, idling, and lower average speeds — all of
              which burn noticeably more fuel per km, so the current-traffic
              estimate is usually higher.
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}

export default TripPlannerPage;
