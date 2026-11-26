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
//
// CAR-61: the backend now uses the car's real km/L from its Fuel Log once it
// rests on enough measured fill-ups, else the rated figure, and says which
// (`efficiency_source`, `efficiency_km_per_l`, `real_interval_count`). The
// results show that basis in one line, and the fuel-cost info tip and the
// traffic explainer only talk about "rated" efficiency when rated was used.
// A response without `efficiency_source` (older shape) shows no basis line
// and the original rated wording.
//
// PLAN-06: a "Recent trips" list under the results shows the selected car's
// five newest saved trips, read straight from Supabase (row-level security
// limits it to the user). Each row has a Delete with the same inline confirm
// as the Fuel Log, and choosing a row only refills Starting Location and
// Destination: it never re-runs the estimate (a paid Google call) or sends any
// other request. A fresh estimate is added to the top from its own response.

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useScrollToAlert } from "../lib/scrollToAlert.js";
import { Link } from "react-router-dom";
import FormattedNumberInput from "../components/FormattedNumberInput.jsx";
import InfoTip from "../components/InfoTip.jsx";
import PageShell from "../components/PageShell.jsx";
import Price from "../components/Price.jsx";
import PlaceAutocompleteInput from "../components/PlaceAutocompleteInput.jsx";
import RouteMapImage from "../components/RouteMapImage.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { apiFetch } from "../lib/apiClient.js";
import { LIMITS, describeActionError, describeApiFetchError, getFuelPriceError } from "../lib/limits.js";
import { formatFillDate, todayLocal } from "../lib/fuelLog.js";
import { getTankCapacityError } from "../lib/tankCapacity.js";
import { getTrafficLevel } from "../lib/trafficLevel.js";
import {
  formatKmPerLiter,
  MIN_DISTANCE_FOR_TRIP_PLANNER,
  MIN_INTERVALS_FOR_TRIP_PLANNER,
} from "../lib/odometer.js";
import { useActiveCar } from "../theme/ActiveCarContext.jsx";
import { ArrowRight } from "../components/icons.jsx";
import { Droplets, Fuel, MapPin, Timer, TrafficCone } from "../components/iconsMore.jsx";

/**
 * CAR-61: one line saying which km/L the estimate used. The figure and the
 * source both come from the backend's response, never worked out here, so
 * the line can't disagree with the cost it explains.
 * @param {{ result: { efficiency_source?: "real" | "rated", efficiency_km_per_l?: number, real_interval_count?: number } }} props
 * @returns {JSX.Element | null} nothing for an older response without a source.
 */
function EfficiencyBasis({ result }) {
  const kmPerLiter = Number(result.efficiency_km_per_l);
  if (!result.efficiency_source || !Number.isFinite(kmPerLiter) || kmPerLiter <= 0) return null;
  const intervals = Number(result.real_interval_count) || 0;

  if (result.efficiency_source === "real") {
    return (
      <p className="trip-result__basis">
        Based on your real average of <strong>{formatKmPerLiter(kmPerLiter)} km/L</strong>,
        from {intervals} measured fill-ups in your <Link to="/fuel-log">Fuel Log</Link>.
      </p>
    );
  }
  return (
    <p className="trip-result__basis">
      Based on the car&apos;s rated <strong>{formatKmPerLiter(kmPerLiter)} km/L</strong>.{" "}
      {intervals > 0 ? (
        <>
          Your <Link to="/fuel-log">Fuel Log</Link> has {intervals} measured{" "}
          {intervals === 1 ? "fill-up" : "fill-ups"}; estimates switch to your real average once
          there are {MIN_INTERVALS_FOR_TRIP_PLANNER} over {MIN_DISTANCE_FOR_TRIP_PLANNER} km.
        </>
      ) : (
        <>
          Add odometer readings to your fill-ups in the <Link to="/fuel-log">Fuel Log</Link> to
          use your real-world figure instead.
        </>
      )}
    </p>
  );
}

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

// PLAN-06: what the Recent trips list reads, and how many rows it shows.
const TRIP_COLUMNS = "id, origin, destination, distance_km, estimated_cost, created_at";
const RECENT_TRIP_COUNT = 5;
const DELETE_FAILED = "Could not delete this trip. Please try again.";

/**
 * PLAN-06: a saved trip's created_at as "20 Nov 2026, 12:05" in the browser's own time zone. The time keeps two
 * trips to the same place on the same day apart, in both the row and its Delete button's name.
 * @param {string} timestamp - an ISO timestamp (timestamptz from Supabase).
 * @returns {string} "" if it isn't a real time.
 */
function formatTripTime(timestamp) {
  const when = new Date(timestamp);
  if (Number.isNaN(when.getTime())) return "";
  const time = when.toTimeString().slice(0, 5);
  return `${formatFillDate(todayLocal(when))}, ${time}`;
}

// How each price bucket is named on screen.
const FUEL_GRADE_LABELS = { "95_octane": "95 octane", "98_octane": "98 octane", diesel: "diesel" };

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
 * Trip Planner screen: enter a starting location and a destination (both
 * required — the backend can't calculate a route without an origin, since
 * there's no saved default location on a user's profile yet), call the
 * FastAPI cost-estimate endpoint for
 * the user's car, and show the resulting fuel cost, duration, and
 * distance — or a clear error if the trip couldn't be planned. PLAN-06: below
 * that, the selected car's five newest saved trips, each reusable or deletable.
 * @returns {JSX.Element}
 */
function TripPlannerPage() {
  const { user, session } = useAuth();
  const { setActiveCarId, selectInitialCar } = useActiveCar();

  const [cars, setCars] = useState([]);
  const [loadingCar, setLoadingCar] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");

  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [destinationError, setDestinationError] = useState("");
  const [originError, setOriginError] = useState("");
  const [submitError, setSubmitError] = useState("");
  // QA fix: scrolls the first message into view when a tap on Plan Trip stops with one (see lib/scrollToAlert.js).
  const scrollToAlert = useScrollToAlert();
  const [submitting, setSubmitting] = useState(false);
  // PLAN-07: `submitting` only disables the button after a re-render; this ref stops a second call in the same tick.
  const submittingRef = useRef(false);
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
  const planButtonRef = useRef(null);

  // PLAN-06: the Recent trips list, tagged with the car it was read for (like the Fuel Log's fill-ups), plus the
  // row whose "Delete this trip?" confirm is open and the outcome shown above the list.
  const [recent, setRecent] = useState({ carId: "", trips: [], error: "" });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const recentRef = useRef(null);
  const deleteNoticeRef = useRef(null);

  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? null;
  // null = this car's trips are still loading.
  const recentTrips = recent.carId === selectedCarId ? recent.trips : null;
  const recentError = recent.carId === selectedCarId ? recent.error : "";

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
      // CAR-70: start on the active car (else the first) and report it, so the theme matches.
      const startId = selectInitialCar(loadedCars);
      setSelectedCarId(startId);
      setTankSizeInput(tankInputFor(loadedCars.find((car) => car.id === startId)));
      setLoadingCar(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user, selectInitialCar]);

  // CAR-41: fetch the current default fuel prices once, to prefill the
  // editable fuel price field — non-critical, so a failure here just
  // leaves the field for the user to fill in (or the backend falls back
  // to its own default if it's left blank). CAR-24: the endpoint requires a
  // logged-in caller, so the session token is sent.
  const accessToken = session?.access_token;
  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    async function loadFuelPrices() {
      try {
        const data = await apiFetch("/trip-planner/fuel-prices", { accessToken });
        if (!cancelled) setFuelPrices(data);
      } catch {
        // Non-critical — see comment above.
      }
    }

    loadFuelPrices();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // PLAN-06: load the selected car's newest trips. The cleanup flags this run as stale, so a reply that arrives
  // after the user picked another car is ignored.
  useEffect(() => {
    if (!selectedCarId) return undefined;
    let stale = false;

    async function loadRecentTrips() {
      const { data, error } = await supabase
        .from("trips")
        .select(TRIP_COLUMNS)
        .eq("car_id", selectedCarId)
        .order("created_at", { ascending: false })
        .limit(RECENT_TRIP_COUNT);

      if (stale) return;
      setRecent({
        carId: selectedCarId,
        trips: error ? [] : (data ?? []),
        error: error ? describeActionError(error, "Could not load your recent trips. Please try again.") : "",
      });
    }

    loadRecentTrips();
    return () => {
      stale = true;
    };
  }, [selectedCarId]);

  // An invalid tank size or fuel price must never be hidden inside the closed section.
  useEffect(() => {
    if (getTankCapacityError(tankSizeInput) || getFuelPriceError(fuelPriceInput)) {
      setAdvancedOpen(true);
    }
  }, [tankSizeInput, fuelPriceInput]);

  /** CAR-49: switching cars fully replaces the Tank Size text with the new
   * car's capacity (or empties it) in the same update — never appends to
   * or keeps anything typed for the previous car. CAR-55: also makes the
   * picked car the active one for site-wide brand theming. PLAN-06: also closes
   * any open delete confirm and clears its message, which belonged to the old car.
   * @param {string} carId
   * @returns {void} */
  function handleCarChange(carId) {
    setSelectedCarId(carId);
    setTankSizeInput(tankInputFor(cars.find((car) => car.id === carId)));
    setActiveCarId(carId, cars.find((car) => car.id === carId)?.make);
    setConfirmDeleteId(null);
    setDeleteError("");
    setDeleteNotice("");
  }

  /**
   * PLAN-06: deletes one trip the user has confirmed, then drops it from the list on screen (only if that list is
   * still this car's). Row-level security filters a refused delete instead of raising an error, so the deleted row
   * is asked back and an empty reply counts as a refusal; either way the row stays and a plain message is shown
   * above the list. On success, keyboard focus moves to the "deleted" message, since the focused button has just
   * left the page with its row. Copied from the Fuel Log's delete.
   * @param {{ id: string, destination: string }} trip - the trip to delete.
   * @returns {Promise<void>}
   */
  async function handleDeleteTrip(trip) {
    if (deletingRef.current) return;
    deletingRef.current = true;
    const carId = selectedCarId;
    setDeleteError("");
    setDeleteNotice("");
    setDeleting(true);
    try {
      const { data, error } = await supabase.from("trips").delete().eq("id", trip.id).select("id");
      if (error || !data?.length) {
        setDeleteError(describeActionError(error, DELETE_FAILED));
        scrollToAlert(recentRef.current);
        return;
      }
      // shortcut: the list shows one row fewer until the next load instead of reading a sixth trip back in; fine for
      // a "recent" list, refetch here if it ever has to stay at five.
      flushSync(() => {
        setRecent((previous) =>
          previous.carId === carId
            ? { ...previous, trips: previous.trips.filter((row) => row.id !== trip.id) }
            : previous,
        );
        setConfirmDeleteId(null);
        setDeleteNotice(`Trip to ${trip.destination} deleted.`);
      });
      deleteNoticeRef.current?.focus();
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  /**
   * PLAN-06: fills Starting Location and Destination from a recent trip and moves focus to Plan Trip. It does not
   * plan the trip: each estimate is a paid Google call, so the user presses Plan Trip themselves.
   * @param {{ origin: string | null, destination: string }} trip - the chosen trip (origin is empty on old rows).
   * @returns {void}
   */
  function chooseTrip(trip) {
    setOrigin(trip.origin ?? "");
    setDestination(trip.destination);
    planButtonRef.current?.focus();
  }

  // Prefills the fuel price for the selected car's fuel grade, but never
  // overwrites a value the user already typed themselves.
  useEffect(() => {
    if (fuelPriceEditedRef.current || !fuelPrices || !selectedCar) return;

    const bucket = priceBucketForFuelType(selectedCar.fuel_type);
    const price = bucket ? fuelPrices.prices?.[bucket]?.lbp_per_liter : null;
    if (price != null) setFuelPriceInput(String(price));
  }, [fuelPrices, selectedCar]);

  /**
   * Validates the form, asks the backend for the estimate (which also saves the trip), and shows the result.
   * PLAN-06: the saved trip is added to the top of Recent trips from this same response (its time is the browser's
   * "now"; the stored created_at shows on the next load), only if the list is still the car it was planned for.
   * @param {import('react').FormEvent} event
   * @returns {Promise<void>}
   */
  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      setSubmitError("");
      setResult(null);

      if (!destination.trim()) {
        setDestinationError("Destination is required.");
        scrollToAlert(event.currentTarget);
        return;
      }
      setDestinationError("");

      // CAR-27: the backend has no saved default location on a user's
      // profile yet, so it can't calculate a route without an explicit
      // origin — validate that here instead of letting the request 400.
      if (!origin.trim()) {
        setOriginError("Starting location is required.");
        scrollToAlert(event.currentTarget);
        return;
      }
      setOriginError("");

      // Same 1 - 10,000,000 bound the server enforces; show it instead of sending.
      if (getFuelPriceError(fuelPriceInput)) {
        setAdvancedOpen(true);
        scrollToAlert(event.currentTarget);
        return;
      }

      const parsedFuelPrice = Number(fuelPriceInput);
      const fuelPriceOverride =
        Number.isFinite(parsedFuelPrice) && parsedFuelPrice > 0
          ? parsedFuelPrice
          : undefined;

      // Captured before the request, so edits or a car switch while it runs can't relabel the result or the new row.
      const carId = selectedCarId;
      const route = { origin: origin.trim(), destination: destination.trim() };
      setSubmitting(true);
      const data = await apiFetch("/trip-planner/estimate", {
        method: "POST",
        accessToken: session.access_token,
        body: {
          car_id: carId,
          destination: route.destination,
          origin: route.origin || undefined,
          fuel_price_per_liter_lbp: fuelPriceOverride,
        },
      });
      setResult(data);
      setSubmittedRoute({ ...route, polyline: data.route_polyline ?? null });
      if (data.id) {
        const saved = {
          id: data.id,
          ...route,
          distance_km: data.distance_km,
          estimated_cost: data.estimated_cost_lbp,
          created_at: new Date().toISOString(),
        };
        setRecent((previous) =>
          previous.carId === carId
            ? { ...previous, trips: [saved, ...previous.trips].slice(0, RECENT_TRIP_COUNT) }
            : previous,
        );
      }
    } catch (error) {
      setSubmitError(describeApiFetchError(error));
      scrollToAlert();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (loadingCar) {
    return (
      <PageShell title="Trip Planner" description="">
        <p role="status" className="sr-only">Loading your car...</p>
        <div className="skeleton-stack" aria-hidden="true">
          <div className="skeleton-bar skeleton-bar--w-40 skeleton-bar--h-md" />
          <div className="skeleton-bar skeleton-bar--card" />
        </div>
      </PageShell>
    );
  }

  if (cars.length === 0) {
    return (
      <PageShell
        title="Trip Planner"
        description="Add a car before planning a trip. Fuel cost is calculated from its fuel efficiency."
      >
        <Link className="btn-primary" to="/cars/new">
          Add Your Car
        </Link>
      </PageShell>
    );
  }

  // The current pump price for the selected car's fuel grade, from the same fuel-prices
  // reply that prefills the Fuel Price box. Shown inside Advanced options, next to the
  // Fuel Price field it explains, as a real price that follows the USD | LBP switch.
  const pumpBucket = selectedCar ? priceBucketForFuelType(selectedCar.fuel_type) : null;
  const pumpPriceLbp = pumpBucket ? Number(fuelPrices?.prices?.[pumpBucket]?.lbp_per_liter) : 0;

  const tankSizeLiters = Number(tankSizeInput);
  // CAR-49: blank = not set; anything outside 5-200 L is flagged, and no
  // Full Tank Cost is calculated from it.
  const tankSizeError = getTankCapacityError(tankSizeInput);
  const tankSizeUsable = tankSizeInput.trim() !== "" && !tankSizeError;
  const tankCostLbp =
    result && tankSizeUsable
      ? Math.round(tankSizeLiters * result.fuel_price_used_lbp)
      : null;
  const trafficLevel = result
    ? getTrafficLevel(result.duration_min, result.duration_in_traffic_min)
    : null;
  const hasTrafficComparison = result?.estimated_cost_current_traffic_lbp != null;

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
            <label htmlFor="origin">Starting Location *</label>
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
            {originError && (
              <p role="alert" className="auth-form__error">
                {originError}
              </p>
            )}
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
                placeholder="e.g. Byblos, Lebanon"
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

            {pumpPriceLbp > 0 && (
              <p className="trip-pump-price">
                Current pump price ({FUEL_GRADE_LABELS[pumpBucket]}):{" "}
                <Price amount={pumpPriceLbp} currency="LBP" suffix="/L" />
              </p>
            )}

            <div className="form-grid advanced-options__fields">
              <div className="form-field">
                <label htmlFor="fuelPricePerLiter">
                  Fuel Price (LBP/L) <span className="form-field__hint">Editable</span>
                </label>
                <FormattedNumberInput
                  id="fuelPricePerLiter"
                  placeholder="e.g. 140,500 (current price used if blank)"
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
                  placeholder="e.g. 60 (not set for this car)"
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
            ref={planButtonRef}
            className="btn-primary btn-block"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Planning..." : "Plan Trip"}
            {!submitting && <ArrowRight size={18} />}
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
          {/* The route this result was planned for, not the live fields (a chosen recent trip refills those). */}
          <p className="trip-result-card__route">
            {submittedRoute?.origin ? (
              <>
                {submittedRoute.origin}
                <span className="sr-only"> to </span>
                <ArrowRight size={16} className="icon--route" />
                {submittedRoute.destination}
              </>
            ) : (
              submittedRoute?.destination
            )}
          </p>
          <EfficiencyBasis result={result} />

          <dl className="trip-result">
            <div className="trip-result__field">
              <dt>
                <span className="trip-result__icon" aria-hidden="true"><Fuel size={20} /></span>
                Fuel Cost{hasTrafficComparison ? " (Light Traffic)" : ""}
                <InfoTip label="About this fuel cost estimate">
                  {result.efficiency_source === "real" ? (
                    <>
                      This estimate uses your real average from your Fuel Log,
                      which already reflects how you usually drive. It can still
                      be higher in heavy traffic.
                    </>
                  ) : (
                    <>
                      This estimate uses your car&apos;s rated fuel efficiency under
                      ideal conditions. Actual consumption may be higher in heavy
                      traffic.
                    </>
                  )}
                </InfoTip>
              </dt>
              <dd>
                <Price amount={result.estimated_cost_lbp} currency="LBP" />
              </dd>
              <dd className="trip-result__caption">
                Based on{" "}
                <Price amount={result.fuel_price_used_lbp} currency="LBP" suffix="/L" />
              </dd>
            </div>
            {hasTrafficComparison && (
              <div className="trip-result__field">
                <dt><span className="trip-result__icon" aria-hidden="true"><TrafficCone size={20} /></span>Fuel Cost (Current Traffic)</dt>
                <dd>
                  <Price amount={result.estimated_cost_current_traffic_lbp} currency="LBP" />
                </dd>
                <dd className="trip-result__caption">
                  Adjusted for current congestion
                </dd>
              </div>
            )}
            <div className="trip-result__field">
              <dt><span className="trip-result__icon" aria-hidden="true"><Timer size={20} /></span>Duration</dt>
              <dd>{result.duration_in_traffic_min} min</dd>
              {trafficLevel && (
                <dd className="trip-result__badge">
                  <span
                  className={`traffic-badge traffic-badge--${trafficLevel.level}`}
                >
                  <span className="traffic-badge__dot" aria-hidden="true" />
                  {trafficLevel.label}
                </span>
                </dd>
              )}
              <dd className="trip-result__caption">Traffic-adjusted estimate</dd>
            </div>
            <div className="trip-result__field">
              <dt><span className="trip-result__icon" aria-hidden="true"><MapPin size={20} /></span>Distance</dt>
              <dd>{result.distance_km} km</dd>
            </div>
            <div className="trip-result__field">
              <dt><span className="trip-result__icon" aria-hidden="true"><Droplets size={20} /></span>Full Tank Cost</dt>
              {tankCostLbp != null ? (
                <>
                  <dd>
                    <Price amount={tankCostLbp} currency="LBP" />
                  </dd>
                  <dd className="trip-result__caption">
                    {tankSizeLiters}L at{" "}
                    <Price amount={result.fuel_price_used_lbp} currency="LBP" suffix="/L" />
                  </dd>
                </>
              ) : tankSizeError ? (
                <>
                  <dd>Tank size out of range</dd>
                  <dd className="trip-result__caption">
                    Enter a tank size between 5 and 200 L to see this figure.
                  </dd>
                </>
              ) : (
                <>
                  <dd>Tank size not set</dd>
                  <dd className="trip-result__caption">
                    Enter a tank size under Advanced options, or add it on{" "}
                    <Link to={`/cars/${selectedCarId}`}>this car&apos;s profile</Link>.
                  </dd>
                </>
              )}
            </div>
          </dl>
          {hasTrafficComparison && (
            <p className="trip-result__explainer">
              Light traffic assumes free-flowing driving close to{" "}
              {result.efficiency_source === "real"
                ? "your real average"
                : <>your car&apos;s rated fuel efficiency</>}. Heavy traffic means more
              stop-and-go driving, idling, and lower average speeds, all of
              which burn noticeably more fuel per km, so the current-traffic
              estimate is usually higher.
            </p>
          )}
        </div>
      )}

      {/* PLAN-06: last on the page, so its rows loading in never move anything above them. */}
      <section className="dashboard-section trip-recent" aria-labelledby="trip-recent-heading" ref={recentRef}>
        <h2 id="trip-recent-heading">Recent trips</h2>
        {deleteError && <p role="alert" className="auth-form__error">{deleteError}</p>}
        {deleteNotice && <p role="status" className="fuel-log-saved" tabIndex={-1} ref={deleteNoticeRef}>{deleteNotice}</p>}

        {recentTrips === null ? (
          <p>Loading recent trips...</p>
        ) : recentError ? (
          <p role="alert" className="auth-form__error">{recentError}</p>
        ) : recentTrips.length === 0 ? (
          <p>No trips planned yet for this car.</p>
        ) : (
          <>
            <p className="form-field__hint" id="trip-recent-hint">Choose a trip to fill in its route again.</p>
            <ul className="trip-recent__list">
              {recentTrips.map((trip) => {
                const when = formatTripTime(trip.created_at);
                return (
                  <li key={trip.id} className="trip-recent__item">
                    <button
                      type="button"
                      className="trip-recent__use"
                      aria-describedby="trip-recent-hint"
                      onClick={() => chooseTrip(trip)}
                    >
                      <span className="trip-recent__route">
                        {trip.origin ? `${trip.origin} to ${trip.destination}` : trip.destination}
                      </span>
                      <span className="trip-recent__meta">
                        {trip.distance_km != null && `${trip.distance_km} km · `}
                        {trip.estimated_cost != null && (
                          <>
                            <Price amount={Number(trip.estimated_cost)} currency="LBP" />
                            {" · "}
                          </>
                        )}
                        {when}
                      </span>
                    </button>
                    <div className="trip-recent__actions">
                      {confirmDeleteId === trip.id ? (
                        <span role="alert" className="costs-confirm">
                          Delete this trip?{" "}
                          <button type="button" className="maintenance-danger-btn" disabled={deleting} onClick={() => handleDeleteTrip(trip)}>
                            Delete
                          </button>{" "}
                          {/* Focus starts on the safe choice; "Keep it" hands it back to this row's Delete button. */}
                          <button
                            type="button"
                            className="maintenance-link-btn"
                            autoFocus
                            onClick={(event) => {
                              const actions = event.currentTarget.closest(".trip-recent__actions");
                              flushSync(() => setConfirmDeleteId(null));
                              actions.querySelector("button")?.focus();
                            }}
                          >
                            Keep it
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="maintenance-link-btn maintenance-link-btn--danger"
                          aria-label={`Delete the trip to ${trip.destination} on ${when}`}
                          onClick={() => setConfirmDeleteId(trip.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </PageShell>
  );
}

export default TripPlannerPage;
