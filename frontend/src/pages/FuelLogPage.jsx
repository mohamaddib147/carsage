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
//
// CAR-61: an optional Odometer (km) field. Its shape and range (whole km, 1 to
// 2,000,000) are hard checks, mirroring the database. Reading ORDER is checked in
// this form only (the database doesn't enforce it): a reading that isn't higher
// than the car's previous one, or isn't lower than a later one, shows a warning
// with a "Save anyway" button rather than being blocked, because an earlier saved
// typo would otherwise block every correct reading after it and fill-ups can't be
// edited. The form also shows the distance since the last reading so a typo
// stands out. The table
// gains Odometer and km/L columns (the per-row km/L is a rough guide), and the chart
// section a "real average" line (lib/odometer.js) which is total km / total liters and
// needs no full tank -- see that module's header.
//
// Dashboard fix: the reading stays optional (nullable column, nothing blocked), but saving without one first asks
// "Skip the odometer? Fuel economy and service reminders need it." with a "Save without odometer" button, the last
// step of the same confirm chain, and the field's hint says why the reading matters.

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
import FormattedNumberInput from "../components/FormattedNumberInput.jsx";
import PageShell from "../components/PageShell.jsx";
import Price from "../components/Price.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useCurrency } from "../currency/CurrencyContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { CURRENCIES, formatMoney } from "../lib/currency.js";
import { supabase } from "../lib/supabaseClient.js";
import { describeActionError, describeApiFetchError, describeSaveError, LIMITS } from "../lib/limits.js";
import { getPricePerLiterWarning, getTankCapacityWarning } from "../lib/fuelCamera.js";
import { getPhotoFileError } from "../lib/photoReencode.js";
import { scanPhoto } from "../lib/scanPhoto.js";
import { GEMINI_PRIVACY_NOTICE } from "../lib/geminiPrivacyNotice.js";
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
import {
  distanceSincePrevious,
  formatKm,
  formatKmPerLiter,
  getOdometerError,
  getOdometerOrderWarning,
  meetsTripPlannerFloor,
  MIN_DISTANCE_FOR_TRIP_PLANNER,
  MIN_INTERVALS_FOR_TRIP_PLANNER,
  readingOf,
  realEfficiency,
  STEP_STATUS,
  stepDispositions,
} from "../lib/odometer.js";
import { useActiveCar } from "../theme/ActiveCarContext.jsx";
import { Camera } from "../components/iconsMore.jsx";

const ENTRY_COLUMNS = "id, filled_at, liters, cost_amount, cost_currency, created_at, odometer_km";

/**
 * "Your real average: 9.0 km/L (rated: 12.0 km/L)" under the chart, plus whether
 * Trip Planner uses it yet. Renders nothing until there is a measured step.
 * @param {{ real: { kmPerLiter: number, intervalCount: number, distanceKm: number } | null, ratedKmPerLiter: number | null }} props
 * @returns {JSX.Element | null}
 */
function RealAverageLine({ real, ratedKmPerLiter }) {
  if (!real) return null;
  const rated = Number(ratedKmPerLiter);
  // Trip Planner needs enough fill-ups AND enough distance (both floors).
  const trusted = meetsTripPlannerFloor(real);
  const fillUps = `${real.intervalCount} measured ${real.intervalCount === 1 ? "fill-up" : "fill-ups"}`;
  return (
    <div className="fuel-log-real-average">
      <p className="fuel-log-real-average__figure">
        Your real average: <strong>{formatKmPerLiter(real.kmPerLiter)} km/L</strong>
        {Number.isFinite(rated) && rated > 0
          ? ` (rated: ${formatKmPerLiter(rated)} km/L)`
          : " (no rated figure set for this car)"}
      </p>
      <p className="fuel-log-real-average__note">
        {trusted
          ? `Based on ${fillUps} over ${formatKm(real.distanceKm)}. Trip Planner uses it for your cost estimates.`
          : `Based on ${fillUps} over ${formatKm(real.distanceKm)}. Trip Planner starts using it after ${MIN_INTERVALS_FOR_TRIP_PLANNER} fill-ups and ${formatKm(MIN_DISTANCE_FOR_TRIP_PLANNER)}.`}
      </p>
    </div>
  );
}

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
  const { user, session } = useAuth();
  const { setActiveCarId, selectInitialCar } = useActiveCar();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [cars, setCars] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");

  // The most recently loaded log, tagged with the car it belongs to. It counts
  // as "loading" until it is for the selected car (see `entries` below).
  const [loaded, setLoaded] = useState({ carId: "", entries: [], error: "" });

  const [date, setDate] = useState(todayLocal());
  const [liters, setLiters] = useState("");
  const [cost, setCost] = useState("");
  // CAR-61: raw digits from FormattedNumberInput; "" = not given (optional).
  const [odometer, setOdometer] = useState("");
  // CAR-61: an out-of-order reading's warning, shown with a "Save anyway" button.
  // Cleared whenever the reading, the date or the car changes, so a confirmation
  // only ever applies to the exact reading it was shown for.
  const [orderWarning, setOrderWarning] = useState("");
  // Step 2 camera scans: a scanned price per liter far from today's fuel
  // price, or liters above the car's own tank capacity. Same "Save
  // anyway" pattern as orderWarning above -- cleared whenever the field
  // they're about changes, so a confirmation only ever applies to the
  // exact values it was shown for.
  const [priceWarning, setPriceWarning] = useState("");
  const [tankWarning, setTankWarning] = useState("");
  // Dashboard fix: saving without an odometer asks "Skip the odometer?" first. The prompt is remembered as a snapshot
  // of the form it was shown for and counts only while the form still matches it, so editing any field (or switching
  // car) drops it with no clearing code at each input.
  const [skipFor, setSkipFor] = useState(null);
  const { currency: primaryCurrency } = useCurrency();
  // null = the user hasn't chosen here, so the form follows the header toggle.
  const [chosenCurrency, setChosenCurrency] = useState(null);
  const currency = chosenCurrency ?? primaryCurrency;
  const skipKey = [selectedCarId, date, liters, cost, currency, odometer].join("|");
  const skipWarning = skipFor === skipKey;
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [scanPumpLoading, setScanPumpLoading] = useState(false);
  const [scanPumpError, setScanPumpError] = useState("");
  const [scanOdometerLoading, setScanOdometerLoading] = useState(false);
  const [scanOdometerError, setScanOdometerError] = useState("");
  // Today's known fuel price (LBP/L), used only to word the price-per-liter
  // warning above -- null (the warning then never fires) until it loads,
  // and silently stays null if the lookup fails: this is a plausibility
  // hint, never something that should block the page.
  const [currentFuelPriceLbp, setCurrentFuelPriceLbp] = useState(null);

  const litersInputRef = useRef(null);
  const scanPumpInputRef = useRef(null);
  const scanOdometerInputRef = useRef(null);
  // Read inside the scan handlers' async success path instead of the
  // closed-over liters/cost/odometer, so a value the user typed while a
  // scan was in flight is never clobbered by a stale "was it empty"
  // check (same pattern as CarOnboardingPage's formRef).
  const fieldsRef = useRef({ liters, cost, odometer });
  fieldsRef.current = { liters, cost, odometer };

  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? null;
  // null = still loading this car's fill-ups (nothing loaded for it yet).
  const showingSelectedCar = loaded.carId === selectedCarId;
  const entries = showingSelectedCar ? loaded.entries : null;
  const loadError = showingSelectedCar ? loaded.error : "";
  const chartPoints = entries ? fillUpChartPoints(entries, primaryCurrency) : [];
  // CAR-61: every figure below comes from the selected car's own entries only.
  const efficiencies = entries ? stepDispositions(entries) : new Map();
  const real = entries ? realEfficiency(entries) : null;
  const sinceLast = entries ? distanceSincePrevious(odometer, date, entries, liters) : null;

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadCars() {
      setLoadingCars(true);
      const { data } = await supabase
        .from("cars")
        .select("id, make, model, year, fuel_efficiency, fuel_tank_capacity_liters")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      const loaded = data ?? [];
      setCars(loaded);
      // CAR-70: start on the active car (else the first) and report it, so the theme matches.
      setSelectedCarId(selectInitialCar(loaded));
      setLoadingCars(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user, selectInitialCar]);

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

  // Today's fuel price, fetched once, purely to word the pump-scan's
  // price-per-liter plausibility warning -- a failed lookup just leaves
  // it null (that warning silently never fires).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    apiFetch("/trip-planner/fuel-prices", { accessToken: sessionRef.current?.access_token })
      .then((result) => {
        if (!cancelled) setCurrentFuelPriceLbp(result?.prices?.["95_octane"]?.lbp_per_liter ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentFuelPriceLbp(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  /** Switching cars drops any message about the previous car's form; what was
   * typed stays. CAR-55: also makes the picked car the active one for
   * site-wide brand theming. */
  function handleCarChange(carId) {
    setSelectedCarId(carId);
    setFieldErrors({});
    setSaveError("");
    setSaved(false);
    setOrderWarning("");
    setActiveCarId(carId, cars.find((car) => car.id === carId)?.make);
  }

  /** @param {import('react').FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    await save({});
  }

  /**
   * Validates and saves the fill-up. A scanned-looking issue (price per liter far
   * from today's fuel price, liters over the car's tank capacity, or a reading out
   * of order) first shows a warning with its own "Save anyway" button, which calls
   * this again with that one `confirmed*: true` -- checked in this fixed order, so
   * confirming one still re-checks (and can still stop on) the next. Last in that order, a fill-up with no odometer
   * reading asks "Skip the odometer?" (`confirmedSkip`); the reading stays optional and nothing is blocked.
   * @param {{ confirmedPrice?: boolean, confirmedTank?: boolean, confirmedOrder?: boolean, confirmedSkip?: boolean }} options
   */
  async function save({ confirmedPrice = false, confirmedTank = false, confirmedOrder = false, confirmedSkip = false } = {}) {
    setSaveError("");
    setSaved(false);

    const errors = getFillUpErrors({ date, liters, cost });
    if (odometer !== "") {
      // A reading is checked against this car's other readings; until they've
      // loaded, there is nothing to check it against, so don't save blind.
      const odometerError =
        entries === null
          ? "Still loading this car's fill-ups. Try again in a moment."
          : getOdometerError(odometer);
      if (odometerError) errors.odometer = odometerError;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setOrderWarning("");
      setPriceWarning("");
      setTankWarning("");
      return;
    }

    if (!confirmedPrice) {
      const warning = getPricePerLiterWarning(liters, cost, currency, currentFuelPriceLbp);
      if (warning) {
        setPriceWarning(warning);
        return;
      }
    }
    setPriceWarning("");

    if (!confirmedTank) {
      const warning = getTankCapacityWarning(liters, selectedCar?.fuel_tank_capacity_liters);
      if (warning) {
        setTankWarning(warning);
        return;
      }
    }
    setTankWarning("");

    if (odometer !== "" && !confirmedOrder) {
      const warning = getOdometerOrderWarning(odometer, date, entries);
      if (warning) {
        setOrderWarning(warning);
        return;
      }
    }
    setOrderWarning("");

    if (odometer === "" && !confirmedSkip) {
      setSkipFor(skipKey);
      return;
    }
    setSkipFor(null);

    const carId = selectedCarId;
    const row = {
      user_id: user.id,
      car_id: carId,
      filled_at: date,
      liters: Number(liters),
      cost_amount: Number(cost),
      cost_currency: currency,
    };
    // Only sent when given: a fill-up without a reading is stored exactly as before.
    if (odometer !== "") row.odometer_km = Number(odometer);

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("fuel_logs")
        .insert(row)
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
      setOdometer("");
      setDate(todayLocal());
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Handles a pump photo picked via the "Scan Pump" button (Step 2). Fills
   * Liters and Cost (and the currency selector, if a currency was read off
   * the photo -- needed so the filled Cost number isn't mislabeled) only
   * when they're currently empty, so a value the user typed is never
   * overwritten. Never saves anything itself -- the user still
   * reviews and submits the form.
   * @param {import('react').ChangeEvent<HTMLInputElement>} event
   */
  async function handleScanPumpFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setScanPumpError("");
    const clientError = getPhotoFileError(file);
    if (clientError) {
      setScanPumpError(clientError);
      if (scanPumpInputRef.current) scanPumpInputRef.current.value = "";
      return;
    }

    setScanPumpLoading(true);
    try {
      const result = await scanPhoto("/fuel-log/scan-pump", file, sessionRef.current?.access_token);

      if (!result.readable) {
        setScanPumpError("Couldn't read that as a pump display. Try a clearer photo, or enter it manually below.");
        return;
      }

      const current = fieldsRef.current;
      if (!current.liters && result.liters != null) setLiters(String(result.liters));
      if (!current.cost && result.total_price != null) {
        setCost(String(result.total_price));
        if (result.currency) setChosenCurrency(result.currency);
      }
      setPriceWarning("");
      setTankWarning("");
    } catch (error) {
      setScanPumpError(describeApiFetchError(error));
    } finally {
      setScanPumpLoading(false);
      if (scanPumpInputRef.current) scanPumpInputRef.current.value = "";
    }
  }

  /**
   * Handles an odometer photo picked via the "Scan Odometer" button (Step
   * 2). Fills the Odometer field only when it's currently empty. Never
   * saves anything itself.
   * @param {import('react').ChangeEvent<HTMLInputElement>} event
   */
  async function handleScanOdometerFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setScanOdometerError("");
    const clientError = getPhotoFileError(file);
    if (clientError) {
      setScanOdometerError(clientError);
      if (scanOdometerInputRef.current) scanOdometerInputRef.current.value = "";
      return;
    }

    setScanOdometerLoading(true);
    try {
      const result = await scanPhoto("/fuel-log/scan-odometer", file, sessionRef.current?.access_token);

      if (!result.readable) {
        setScanOdometerError("Couldn't read that as an odometer display. Try a clearer photo, or enter it manually below.");
        return;
      }

      if (!fieldsRef.current.odometer && result.odometer_km != null) {
        setOdometer(String(result.odometer_km));
        setOrderWarning("");
      }
    } catch (error) {
      setScanOdometerError(describeApiFetchError(error));
    } finally {
      setScanOdometerLoading(false);
      if (scanOdometerInputRef.current) scanOdometerInputRef.current.value = "";
    }
  }

  if (loadingCars) {
    return (
      <PageShell title="Fuel Log" description="">
        <p role="status" className="sr-only">Loading your cars...</p>
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
              onChange={(event) => {
                setDate(event.target.value);
                setOrderWarning("");
              }}
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
              onChange={(event) => {
                setLiters(event.target.value);
                setPriceWarning("");
                setTankWarning("");
              }}
            />
            {fieldErrors.liters && (
              <p role="alert" className="auth-form__error">{fieldErrors.liters}</p>
            )}
            {tankWarning && (
              <div role="alert" className="fuel-log-order-warning">
                <p>{tankWarning}</p>
                <button
                  type="button"
                  className="fuel-log-order-warning__btn"
                  disabled={saving}
                  onClick={() => save({ confirmedTank: true })}
                >
                  Save anyway
                </button>
              </div>
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
                onChange={(event) => {
                  setCost(event.target.value);
                  setPriceWarning("");
                }}
              />
              <select
                aria-label="Currency of the cost"
                value={currency}
                onChange={(event) => {
                  setChosenCurrency(event.target.value);
                  setPriceWarning("");
                }}
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
            {priceWarning && (
              <div role="alert" className="fuel-log-order-warning">
                <p>{priceWarning}</p>
                <button
                  type="button"
                  className="fuel-log-order-warning__btn"
                  disabled={saving}
                  onClick={() => save({ confirmedPrice: true })}
                >
                  Save anyway
                </button>
              </div>
            )}
          </div>

          <div className="scan-card scan-card--compact">
            <span className="scan-card__icon" aria-hidden="true"><Camera size={22} /></span>
            <div className="scan-card__text">
              <p className="scan-card__title">Scan the Pump</p>
              <p className="scan-card__desc">Fills in Liters and Cost from a photo of the pump's display.</p>
              {scanPumpLoading && (
                <p role="status" className="spec-loading">
                  <span className="spec-loading__spinner" aria-hidden="true" />
                  Reading pump photo…
                </p>
              )}
              {scanPumpError && <p role="alert" className="auth-form__error">{scanPumpError}</p>}
            </div>
            <label
              className={`btn-accent scan-card__button${scanPumpLoading ? " btn-accent--loading" : ""}`}
              htmlFor="scanPumpFile"
            >
              {scanPumpLoading ? "Reading…" : "Scan Pump"}
            </label>
            <input
              id="scanPumpFile"
              ref={scanPumpInputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={scanPumpLoading}
              onChange={handleScanPumpFile}
            />
            <p className="camera-privacy-note">{GEMINI_PRIVACY_NOTICE}</p>
          </div>

          <div className="form-field">
            <label htmlFor="fillOdometer">Odometer (km)</label>
            <FormattedNumberInput
              id="fillOdometer"
              placeholder="e.g. 84,250 (optional)"
              value={odometer}
              aria-invalid={fieldErrors.odometer ? "true" : undefined}
              aria-describedby="fillOdometerHint"
              onChange={(raw) => {
                setOdometer(raw);
                setOrderWarning("");
              }}
            />
            {fieldErrors.odometer ? (
              <p role="alert" className="auth-form__error">{fieldErrors.odometer}</p>
            ) : orderWarning ? (
              <div role="alert" className="fuel-log-order-warning">
                <p>{orderWarning}</p>
                <button
                  type="button"
                  className="fuel-log-order-warning__btn"
                  disabled={saving}
                  onClick={() => save({ confirmedOrder: true })}
                >
                  Save anyway
                </button>
              </div>
            ) : skipWarning ? (
              <div role="alert" className="fuel-log-order-warning">
                <p>Skip the odometer? Fuel economy and service reminders need it.</p>
                {/* Every earlier check already passed or was confirmed for these exact values (see skipKey). */}
                <button
                  type="button"
                  className="fuel-log-order-warning__btn"
                  disabled={saving}
                  onClick={() => save({ confirmedPrice: true, confirmedTank: true, confirmedSkip: true })}
                >
                  Save without odometer
                </button>
              </div>
            ) : sinceLast ? (
              <p
                id="fillOdometerHint"
                className={`form-hint${sinceLast.implausible ? " form-hint--warning" : ""}`}
              >
                +{formatKm(sinceLast.distanceKm)} since your last reading ({formatKm(sinceLast.previousKm)}).
                {sinceLast.implausible &&
                  " That doesn't look like a realistic distance for these liters. Check the reading for a typo: a saved fill-up can't be edited."}
              </p>
            ) : (
              <p id="fillOdometerHint" className="form-hint">
                Optional, but fuel economy and service reminders need it. The total km on your dashboard.
              </p>
            )}
          </div>

          <div className="scan-card scan-card--compact">
            <span className="scan-card__icon" aria-hidden="true"><Camera size={22} /></span>
            <div className="scan-card__text">
              <p className="scan-card__title">Scan the Odometer</p>
              <p className="scan-card__desc">Fills in the Odometer field from a photo of your dashboard.</p>
              {scanOdometerLoading && (
                <p role="status" className="spec-loading">
                  <span className="spec-loading__spinner" aria-hidden="true" />
                  Reading odometer photo…
                </p>
              )}
              {scanOdometerError && <p role="alert" className="auth-form__error">{scanOdometerError}</p>}
            </div>
            <label
              className={`btn-accent scan-card__button${scanOdometerLoading ? " btn-accent--loading" : ""}`}
              htmlFor="scanOdometerFile"
            >
              {scanOdometerLoading ? "Reading…" : "Scan Odometer"}
            </label>
            <input
              id="scanOdometerFile"
              ref={scanOdometerInputRef}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              disabled={scanOdometerLoading}
              onChange={handleScanOdometerFile}
            />
            <p className="camera-privacy-note">{GEMINI_PRIVACY_NOTICE}</p>
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
          <RealAverageLine real={real} ratedKmPerLiter={selectedCar?.fuel_efficiency ?? null} />
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
          // CAR-72: a scrolling region must be reachable by keyboard, with a name
          // (not "Fill-up history": the section around it already has that one).
          <div className="fuel-log-table-wrap" role="region" aria-label="Fill-up history table" tabIndex={0}>
            <table className="fuel-log-table">
              <caption className="sr-only">Fill-ups for {label}, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Liters</th>
                  <th scope="col">Cost</th>
                  <th scope="col">Price per liter</th>
                  <th scope="col">Price per 20 L</th>
                  <th scope="col">Odometer</th>
                  <th scope="col">km/L</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const perLiter = pricePerLiter(entry);
                  const per20Liters = pricePer20Liters(entry);
                  const reading = readingOf(entry);
                  const interval = efficiencies.get(entry.id);
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
                      <td>{reading == null ? "-" : formatKm(reading)}</td>
                      <td>
                        {!interval ? (
                          "-"
                        ) : interval.status === STEP_STATUS.IN_RANGE ? (
                          formatKmPerLiter(interval.kmPerLiter)
                        ) : interval.status === STEP_STATUS.MERGED ? (
                          <span
                            className="fuel-log-merged-step"
                            title="Counted as part of a partial fill in your average."
                          >
                            -
                          </span>
                        ) : (
                          <span
                            className="fuel-log-check-reading"
                            title="Outside a realistic range (2 to 40 km/L). Check these odometer readings; this one isn't counted in your average."
                          >
                            - (check reading)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="fuel-log-table__caption">
              The km/L on each row is a rough guide between two fill-ups with odometer
              readings; a partial fill makes it swing. The average shown above the chart
              is the reliable figure, and you do not have to fill the tank to full.
            </p>
          </div>
        )}
      </section>
    </PageShell>
  );
}

export default FuelLogPage;
