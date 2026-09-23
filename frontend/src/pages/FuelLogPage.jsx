// Fuel Log screen (CAR-53): a per-car log of fuel fill-ups. The user adds an
// entry (date, liters, cost) and sees that car's fill-ups newest first, each with
// its computed price per liter and per 20 liters (the canister size Lebanese fuel
// prices are quoted in). Entries are read and written straight to the `fuel_logs`
// table through Supabase: row-level security scopes every row to its owner, and the
// table's CHECK constraints are the server-side input validation (this page
// validates first only for fast, friendly feedback).
//
// With more than one car a selector switches the log. Loaded fill-ups are stored
// together with the id of the car they belong to and are only shown while that id
// is the selected car, so one car's fill-ups can never appear under another — not
// after a switch, not when a slow reply arrives late, not when a save finishes late.
//
// The cost is kept exactly as typed with its currency (USD or LBP). The form's
// currency starts on the user's primary currency (CAR-54) and follows the header
// toggle until they pick one here themselves; every figure in the list is shown
// through <Price>, so the toggle changes them all.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import PageShell from "../components/PageShell.jsx";
import Price from "../components/Price.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useCurrency } from "../currency/CurrencyContext.jsx";
import { CURRENCIES, formatMoney } from "../lib/currency.js";
import { supabase } from "../lib/supabaseClient.js";
import { describeActionError, describeSaveError, LIMITS } from "../lib/limits.js";
import {
  fillUpChartPoints,
  formatFillDate,
  formatLiters,
  getFillUpErrors,
  pricePer20Liters,
  pricePerLiter,
  sortFillUps,
  todayLocal,
} from "../lib/fuelLog.js";

const ENTRY_COLUMNS = "id, filled_at, liters, cost_amount, cost_currency, created_at";

/**
 * The chart's hover/tap detail: date, liters and cost (in the currency the
 * chart is drawn in) for one fill-up. Recharts calls this with `active` and
 * `payload` itself; `currency` is passed through from the page.
 * @param {{ active?: boolean, payload?: { payload: { date: string, liters: number, cost: number } }[], currency: "USD" | "LBP" }} props
 * @returns {JSX.Element | null}
 */
function FillUpTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="fuel-log-chart__tooltip">
      <p className="fuel-log-chart__tooltip-date">{formatFillDate(point.date)}</p>
      <p>{formatLiters(point.liters)} L</p>
      <p>{formatMoney(point.cost, currency)}</p>
    </div>
  );
}

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
  const { currency: primaryCurrency } = useCurrency();
  // null = the user hasn't chosen here, so the form follows the header toggle.
  const [chosenCurrency, setChosenCurrency] = useState(null);
  const currency = chosenCurrency ?? primaryCurrency;
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
  const chartPoints = entries ? fillUpChartPoints(entries, primaryCurrency) : [];

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
        description="Add a car before logging fill-ups. Each fill-up belongs to one car."
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
      description="Log each time you fill your tank and see what you pay per liter and per 20 liters."
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
                onChange={(event) => setChosenCurrency(event.target.value)}
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

      {chartPoints.length > 0 && (
        <section className="dashboard-section fuel-log-chart" aria-label="Fill-up history chart">
          <h2>Fill-Up History{label ? ` for ${label}` : ""}</h2>
          <p className="fuel-log-chart__caption">
            Liters filled at each fill-up. Hover or tap a bar for the date, liters and cost, in {primaryCurrency}.
          </p>
          <div className="fuel-log-chart__wrap">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatFillDate}
                  tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                />
                <YAxis
                  tickFormatter={(value) => `${formatLiters(value)} L`}
                  width={60}
                  tick={{ fontSize: 12, fill: "var(--color-text-muted)" }}
                />
                <Tooltip
                  content={(tooltipProps) => <FillUpTooltip {...tooltipProps} currency={primaryCurrency} />}
                  cursor={{ fill: "var(--color-border)", opacity: 0.4 }}
                />
                <Bar dataKey="liters" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="dashboard-section" aria-label="Fill-up history">
        <h2>Fill-ups{label ? ` for ${label}` : ""}</h2>

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
                  <th scope="col">Price per 20 L</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const perLiter = pricePerLiter(entry);
                  const per20Liters = pricePer20Liters(entry);
                  return (
                    <tr key={entry.id}>
                      <td>{formatFillDate(entry.filled_at)}</td>
                      <td>{formatLiters(entry.liters)} L</td>
                      <td>
                        <Price amount={Number(entry.cost_amount)} currency={entry.cost_currency} />
                      </td>
                      <td>
                        {perLiter == null ? (
                          "-"
                        ) : (
                          <Price amount={perLiter} currency={entry.cost_currency} suffix="/L" />
                        )}
                      </td>
                      <td>
                        {per20Liters == null ? (
                          "-"
                        ) : (
                          <Price amount={per20Liters} currency={entry.cost_currency} suffix="/20 L" />
                        )}
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
