// Fuel Log screen (CAR-53): a per-car log of fuel fill-ups. The user adds an
// entry (date, liters, cost) and sees that car's fill-ups newest first, each with
// its computed price per liter. Entries are read and written straight to the
// `fuel_logs` table through Supabase: row-level security scopes every row to its
// owner, and the table's CHECK constraints are the server-side input validation
// (this page validates first only for fast, friendly feedback).
//
// With more than one car a selector switches the log. Loaded fill-ups are stored
// together with the id of the car they belong to and are only shown while that id
// is the selected car, so one car's fill-ups can never appear under another — not
// after a switch, not when a slow reply arrives late, not when a save finishes late.
//
// The cost is kept exactly as typed with its currency (USD or LBP).

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { describeActionError, describeSaveError, LIMITS } from "../lib/limits.js";
import {
  CURRENCIES,
  formatFillDate,
  formatFillUpMoney,
  formatLiters,
  getFillUpErrors,
  pricePerLiter,
  sortFillUps,
  todayLocal,
} from "../lib/fuelLog.js";

const ENTRY_COLUMNS = "id, filled_at, liters, cost_amount, cost_currency, created_at";

/** "2005 Mercedes-Benz C230 Kompressor" — the car as the user knows it. */
function carLabel(car) {
  return [car.year, car.make, car.model].filter(Boolean).join(" ");
}

/**
 * Fuel Log screen: the user's cars (switchable), an add-a-fill-up form, and the
 * selected car's fill-ups with the price per liter of each.
 * @returns {JSX.Element}
 */
function FuelLogPage() {
  const { user } = useAuth();

  const [cars, setCars] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");

  // The most recently loaded log, tagged with the car it belongs to. It counts
  // as "loading" until it is for the selected car (see `entries` below).
  const [loaded, setLoaded] = useState({ carId: "", entries: [], error: "" });

  const [date, setDate] = useState(todayLocal());
  const [liters, setLiters] = useState("");
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const litersInputRef = useRef(null);

  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? null;
  // null = still loading this car's fill-ups (nothing loaded for it yet).
  const showingSelectedCar = loaded.carId === selectedCarId;
  const entries = showingSelectedCar ? loaded.entries : null;
  const loadError = showingSelectedCar ? loaded.error : "";

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadCars() {
      setLoadingCars(true);
      const { data } = await supabase
        .from("cars")
        .select("id, make, model, year")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      const loaded = data ?? [];
      setCars(loaded);
      setSelectedCarId(loaded[0]?.id ?? "");
      setLoadingCars(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Load the selected car's fill-ups. The cleanup flags this run as stale, so a
  // response that arrives after the user picked another car is ignored.
  useEffect(() => {
    if (!selectedCarId) return undefined;

    let stale = false;

    async function loadEntries() {
      const { data, error } = await supabase
        .from("fuel_logs")
        .select(ENTRY_COLUMNS)
        .eq("car_id", selectedCarId)
        .order("filled_at", { ascending: false });

      if (stale) return;
      if (error) {
        setLoaded({
          carId: selectedCarId,
          entries: [],
          error: describeActionError(error, "Could not load your fill-ups. Please try again."),
        });
        return;
      }
      setLoaded({ carId: selectedCarId, entries: sortFillUps(data ?? []), error: "" });
    }

    loadEntries();
    return () => {
      stale = true;
    };
  }, [selectedCarId]);

  /** Switching cars drops any message about the previous car's form; what was typed stays. */
  function handleCarChange(carId) {
    setSelectedCarId(carId);
    setFieldErrors({});
    setSaveError("");
    setSaved(false);
  }

  /** @param {import('react').FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setSaveError("");
    setSaved(false);

    const errors = getFillUpErrors({ date, liters, cost });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const carId = selectedCarId;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("fuel_logs")
        .insert({
          user_id: user.id,
          car_id: carId,
          filled_at: date,
          liters: Number(liters),
          cost_amount: Number(cost),
          cost_currency: currency,
        })
        .select(ENTRY_COLUMNS)
        .single();

      if (error) {
        setSaveError(describeSaveError(error));
        return;
      }

      // Add the row to the log it belongs to; if the log now held is another
      // car's (the user switched while this saved), leave it alone.
      setLoaded((previous) =>
        previous.carId === carId
          ? { ...previous, entries: sortFillUps([...previous.entries, data]) }
          : previous,
      );
      setLiters("");
      setCost("");
      setDate(todayLocal());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (loadingCars) {
    return <PageShell title="Fuel Log" description="Loading your cars..." />;
  }

  if (cars.length === 0) {
    return (
      <PageShell
        title="Fuel Log"
        description="Add a car before logging fill-ups — each fill-up belongs to one car."
      >
        <Link className="btn-primary" to="/cars/new">
          Add Your Car
        </Link>
      </PageShell>
    );
  }

  const label = selectedCar ? carLabel(selectedCar) : "";

  return (
    <PageShell
      title="Fuel Log"
      description="Log each time you fill your tank and see what you pay per liter."
    >
      <div className="route-params-card">
        <p className="form-section-label">Log a fill-up</p>

        <form onSubmit={handleSubmit} noValidate className="car-form">
          {cars.length > 1 ? (
            <div className="form-field">
              <label htmlFor="fuelLogCarId">Car</label>
              <select
                id="fuelLogCarId"
                value={selectedCarId}
                onChange={(event) => handleCarChange(event.target.value)}
              >
                {cars.map((carOption) => (
                  <option key={carOption.id} value={carOption.id}>
                    {carLabel(carOption)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="fuel-log-car-name">{label}</p>
          )}

          <div className="form-field">
            <label htmlFor="fillDate">Date *</label>
            <input
              id="fillDate"
              type="date"
              max={todayLocal()}
              min={LIMITS.MIN_FILL_DATE}
              value={date}
              aria-invalid={fieldErrors.date ? "true" : undefined}
              onChange={(event) => setDate(event.target.value)}
            />
            {fieldErrors.date && (
              <p role="alert" className="auth-form__error">{fieldErrors.date}</p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="fillLiters">Liters *</label>
            <input
              id="fillLiters"
              ref={litersInputRef}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              placeholder="e.g. 19.6"
              value={liters}
              aria-invalid={fieldErrors.liters ? "true" : undefined}
              onChange={(event) => setLiters(event.target.value)}
            />
            {fieldErrors.liters && (
              <p role="alert" className="auth-form__error">{fieldErrors.liters}</p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="fillCost">Cost *</label>
            <div className="fuel-log-cost-row">
              <input
                id="fillCost"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="e.g. 30"
                value={cost}
                aria-invalid={fieldErrors.cost ? "true" : undefined}
                onChange={(event) => setCost(event.target.value)}
              />
              <select
                aria-label="Currency of the cost"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            {fieldErrors.cost && (
              <p role="alert" className="auth-form__error">{fieldErrors.cost}</p>
            )}
          </div>

          {saveError && (
            <p role="alert" className="auth-form__error">{saveError}</p>
          )}
          {saved && (
            <p role="status" className="fuel-log-saved">Fill-up added.</p>
          )}

          <button className="btn-primary btn-block" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Add Fill-Up"}
          </button>
        </form>
      </div>

      <section className="dashboard-section" aria-label="Fill-up history">
        <h2>Fill-ups{label ? ` — ${label}` : ""}</h2>

        {entries === null ? (
          <p>Loading fill-ups...</p>
        ) : loadError ? (
          <p role="alert" className="auth-form__error">{loadError}</p>
        ) : entries.length === 0 ? (
          <div className="fuel-log-empty">
            <p className="fuel-log-empty__title">No fill-ups logged yet</p>
            <p>
              Every time you fill up, log the date, liters and cost above to
              see what you really pay per liter.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => litersInputRef.current?.focus()}
            >
              Add your first fill-up
            </button>
          </div>
        ) : (
          <div className="fuel-log-table-wrap">
            <table className="fuel-log-table">
              <caption className="sr-only">Fill-ups for {label}, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Liters</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Price per liter</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const perLiter = pricePerLiter(entry);
                  return (
                    <tr key={entry.id}>
                      <td>{formatFillDate(entry.filled_at)}</td>
                      <td>{formatLiters(entry.liters)} L</td>
                      <td>{formatFillUpMoney(Number(entry.cost_amount), entry.cost_currency)}</td>
                      <td>
                        {perLiter == null
                          ? "—"
                          : `${formatFillUpMoney(perLiter, entry.cost_currency)}/L`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

export default FuelLogPage;
