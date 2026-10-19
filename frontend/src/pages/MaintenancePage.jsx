// Maintenance screen (CAR-62, `/maintenance`): a car's recurring service items (oil,
// tires, brakes, the yearly mécanique, insurance, or anything custom), each due by km,
// by months, or both, sorted by urgency with an Overdue / Due soon / OK badge (or "Add
// an odometer reading" for a km-based item on a car with no reading). The due logic and
// thresholds live in lib/maintenance.js; the car's current km comes from the CAR-61
// helper latestOdometer() on that car's own fill-ups.
//
// Items and their history are read and written straight to `maintenance_items` and
// `maintenance_records` through Supabase (row-level security scopes every row to its
// owner, and an item can only belong to the caller's own car). "Mark as done" is ONE
// insert into maintenance_records: the item itself isn't changed, its schedule simply
// restarts from its latest completion, so history is never overwritten. A mistaken
// completion can be undone (deleted, after a confirmation); completions are never edited.
// Presets only fill the form; nothing is saved until the user presses Save. Dates can't
// be in the future, judged by today's date in Beirut.
//
// With several cars a selector switches cars (a `?car=<id>` link, as the Dashboard card
// uses, opens on that car). Loaded data is tagged with its car id, so one car's items or
// readings can never show under another, even if a slow reply arrives after a switch.

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import FormattedNumberInput from "../components/FormattedNumberInput.jsx";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { describeActionError, describeSaveError, LIMITS } from "../lib/limits.js";
import { formatFillDate } from "../lib/fuelLog.js";
import { formatKm, latestOdometer } from "../lib/odometer.js";
import {
  describeDue,
  describeRemaining,
  getCompletionErrors,
  getMaintenanceItemErrors,
  itemAnchorId,
  itemFromForm,
  latestRecord,
  maintenanceStatus,
  PRESETS,
  sortByUrgency,
  STATUS,
  STATUS_LABELS,
  todayInBeirut,
} from "../lib/maintenance.js";
import { useActiveCar } from "../theme/ActiveCarContext.jsx";

const ITEM_COLUMNS =
  "id, car_id, name, interval_km, interval_months, baseline_date, baseline_km, notes, created_at, " +
  "maintenance_records(id, done_on, odometer_km, note, created_at)";
const READING_COLUMNS = "id, filled_at, created_at, liters, odometer_km";

const EMPTY_ITEM_FORM = { name: "", intervalKm: "", intervalMonths: "", baselineDate: "", baselineKm: "", notes: "" };

/** "2005 Mercedes-Benz C230" — the car as the user knows it. */
function carLabel(car) {
  return [car.year, car.make, car.model].filter(Boolean).join(" ");
}

/**
 * Loads one car's items (with their history) and its fill-up readings.
 * @param {string} carId
 * @returns {Promise<{ carId: string, items: object[], readings: object[], error: string }>}
 */
async function fetchCarData(carId) {
  const [itemsReply, readingsReply] = await Promise.all([
    supabase.from("maintenance_items").select(ITEM_COLUMNS).eq("car_id", carId).order("created_at", { ascending: true }),
    supabase.from("fuel_logs").select(READING_COLUMNS).eq("car_id", carId),
  ]);
  if (itemsReply.error) {
    return {
      carId,
      items: [],
      readings: [],
      error: describeActionError(itemsReply.error, "Could not load your maintenance items. Please try again."),
    };
  }
  return {
    carId,
    items: itemsReply.data ?? [],
    // Readings are a bonus: without them km items just ask for a reading.
    readings: readingsReply.error ? [] : (readingsReply.data ?? []),
    error: "",
  };
}

/** A number as form text ("" for null). */
function asText(value) {
  return value == null ? "" : String(value);
}

/**
 * The add/edit item form's fields. Shared by "Add an item" and each item's "Edit".
 * @param {{ idPrefix: string, values: object, errors: object, onChange: (field: string, value: string) => void }} props
 * @returns {JSX.Element}
 */
function ItemFields({ idPrefix, values, errors, onChange, today }) {
  const field = (name) => `${idPrefix}-${name}`;
  const errorFor = (name) =>
    errors[name] ? <p role="alert" className="auth-form__error">{errors[name]}</p> : null;
  return (
    <>
      <div className="form-field">
        <label htmlFor={field("name")}>Name *</label>
        <input
          id={field("name")}
          type="text"
          maxLength={LIMITS.MAINTENANCE_NAME}
          placeholder="e.g. Oil change"
          value={values.name}
          aria-invalid={errors.name ? "true" : undefined}
          onChange={(event) => onChange("name", event.target.value)}
        />
        {errorFor("name")}
      </div>

      <fieldset className="maintenance-interval">
        <legend>How often (km, months, or both: whichever comes first) *</legend>
        <div className="maintenance-interval__row">
          <div className="form-field">
            <label htmlFor={field("intervalKm")}>Every (km)</label>
            <FormattedNumberInput
              id={field("intervalKm")}
              placeholder="e.g. 5,000"
              value={values.intervalKm}
              aria-invalid={errors.intervalKm ? "true" : undefined}
              onChange={(raw) => onChange("intervalKm", raw)}
            />
            {errorFor("intervalKm")}
          </div>
          <div className="form-field">
            <label htmlFor={field("intervalMonths")}>Every (months)</label>
            <FormattedNumberInput
              id={field("intervalMonths")}
              placeholder="e.g. 6"
              value={values.intervalMonths}
              aria-invalid={errors.intervalMonths ? "true" : undefined}
              onChange={(raw) => onChange("intervalMonths", raw)}
            />
            {errorFor("intervalMonths")}
          </div>
        </div>
        {errorFor("interval")}
      </fieldset>

      <div className="maintenance-interval__row">
        <div className="form-field">
          <label htmlFor={field("baselineDate")}>Last done on *</label>
          <input
            id={field("baselineDate")}
            type="date"
            max={today}
            min={LIMITS.MIN_MAINTENANCE_DATE}
            value={values.baselineDate}
            aria-invalid={errors.baselineDate ? "true" : undefined}
            onChange={(event) => onChange("baselineDate", event.target.value)}
          />
          {errorFor("baselineDate")}
        </div>
        <div className="form-field">
          <label htmlFor={field("baselineKm")}>Odometer when last done (km)</label>
          <FormattedNumberInput
            id={field("baselineKm")}
            placeholder="e.g. 84,250"
            value={values.baselineKm}
            aria-invalid={errors.baselineKm ? "true" : undefined}
            onChange={(raw) => onChange("baselineKm", raw)}
          />
          {errorFor("baselineKm")}
        </div>
      </div>
      <p className="form-hint">
        Not sure when it was last done? Use today and your current reading; the schedule starts from there.
      </p>

      <div className="form-field">
        <label htmlFor={field("notes")}>Notes</label>
        <textarea
          id={field("notes")}
          rows={2}
          maxLength={LIMITS.MAINTENANCE_NOTES}
          placeholder="e.g. 5W-30 synthetic, done at the Hamra garage"
          value={values.notes}
          aria-invalid={errors.notes ? "true" : undefined}
          onChange={(event) => onChange("notes", event.target.value)}
        />
        {errorFor("notes")}
      </div>
    </>
  );
}

/**
 * Maintenance screen: the user's cars (switchable), an "Add an item" form with
 * presets, and the selected car's items by urgency, each with Mark as done, Edit,
 * History (with Undo) and Delete.
 * @returns {JSX.Element}
 */
function MaintenancePage() {
  const { user } = useAuth();
  const { setActiveCarId } = useActiveCar();
  const [searchParams] = useSearchParams();
  const { hash } = useLocation();
  const today = todayInBeirut();

  const [cars, setCars] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");
  // The most recently loaded data, tagged with its car; "loading" until it matches.
  const [loaded, setLoaded] = useState({ carId: "", items: [], readings: [], error: "" });

  const [adding, setAdding] = useState(false);
  const [addValues, setAddValues] = useState(EMPTY_ITEM_FORM);
  const [addErrors, setAddErrors] = useState({});
  // One open panel at a time: { itemId, kind: "done" | "edit" | "delete" | "history" }.
  const [panel, setPanel] = useState(null);
  const [panelValues, setPanelValues] = useState({});
  const [panelErrors, setPanelErrors] = useState({});
  const [confirmUndoId, setConfirmUndoId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const scrolledTo = useRef("");

  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? null;
  const showingSelectedCar = loaded.carId === selectedCarId && selectedCarId !== "";
  const items = showingSelectedCar ? loaded.items : null;
  const loadError = showingSelectedCar ? loaded.error : "";
  const reading = showingSelectedCar ? latestOdometer(loaded.readings) : null;
  const currentKm = reading?.km ?? null;
  const rows = items
    ? sortByUrgency(
        items.map((item) => ({
          item,
          status: maintenanceStatus(item, item.maintenance_records ?? [], currentKm, today),
        })),
      )
    : [];
  const anyKmItemWithoutReading = rows.some((row) => row.status.needsReading) && currentKm == null;

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function loadCars() {
      setLoadingCars(true);
      const { data } = await supabase
        .from("cars")
        .select("id, make, model, year")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const list = data ?? [];
      setCars(list);
      const requested = searchParams.get("car");
      setSelectedCarId(list.some((car) => car.id === requested) ? requested : (list[0]?.id ?? ""));
      setLoadingCars(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
    // searchParams is only read for the initial car; later changes are the selector's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load the selected car's items (with their history) and its fill-up readings. A
  // reply that arrives after the user picked another car is ignored.
  useEffect(() => {
    if (!selectedCarId) return undefined;
    let stale = false;

    fetchCarData(selectedCarId).then((next) => {
      if (!stale) setLoaded(next);
    });
    return () => {
      stale = true;
    };
  }, [selectedCarId]);

  // A Dashboard link (`#maintenance-item-<id>`) scrolls to its item once it's shown.
  useEffect(() => {
    if (!hash || !items || scrolledTo.current === hash) return;
    const element = document.getElementById(hash.slice(1));
    if (element) {
      scrolledTo.current = hash;
      element.scrollIntoView?.({ block: "center" });
    }
  }, [hash, items]);

  /**
   * Re-reads a car's data after a write and shows it, unless the user has since
   * switched to another car (whose own load then wins).
   * @param {string} carId - the car the write was for.
   */
  async function reload(carId) {
    const next = await fetchCarData(carId);
    setLoaded((previous) => (previous.carId === next.carId ? next : previous));
  }

  /** Closes every open form/confirmation and clears messages. */
  function resetPanels() {
    setPanel(null);
    setPanelValues({});
    setPanelErrors({});
    setConfirmUndoId(null);
    setActionError("");
  }

  /** CAR-55: the picked car also becomes the active one for brand theming. */
  function handleCarChange(carId) {
    setSelectedCarId(carId);
    setActiveCarId(carId);
    resetPanels();
    setAdding(false);
    setNotice("");
  }

  /** Opens the "Add an item" form, optionally filled from a preset (never saved yet). */
  function startAdding(preset) {
    resetPanels();
    setNotice("");
    setAdding(true);
    setAddErrors({});
    setAddValues({
      ...EMPTY_ITEM_FORM,
      name: preset?.name ?? "",
      intervalKm: asText(preset?.intervalKm),
      intervalMonths: asText(preset?.intervalMonths),
      baselineDate: today,
      baselineKm: asText(currentKm),
    });
  }

  async function handleAdd(event) {
    event.preventDefault();
    const errors = getMaintenanceItemErrors(addValues, today);
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setActionError("");
    try {
      const { error } = await supabase
        .from("maintenance_items")
        .insert({ user_id: user.id, car_id: selectedCarId, ...itemFromForm(addValues) });
      if (error) {
        setActionError(describeSaveError(error));
        return;
      }
      // The message only appears once the list already shows the new item.
      await reload(selectedCarId);
      setAdding(false);
      setAddValues(EMPTY_ITEM_FORM);
      setNotice(`${addValues.name.trim()} added.`);
    } finally {
      setBusy(false);
    }
  }

  /** Opens one item's panel, filling its form where it has one. */
  function openPanel(item, kind) {
    resetPanels();
    setNotice("");
    setAdding(false);
    if (panel && panel.itemId === item.id && panel.kind === kind) return; // toggle closed
    setPanel({ itemId: item.id, kind });
    if (kind === "done") {
      setPanelValues({ doneOn: today, odometer: asText(currentKm), note: "" });
    } else if (kind === "edit") {
      setPanelValues({
        name: item.name,
        intervalKm: asText(item.interval_km),
        intervalMonths: asText(item.interval_months),
        baselineDate: item.baseline_date,
        baselineKm: asText(item.baseline_km),
        notes: item.notes ?? "",
      });
    }
  }

  /** Runs one write, then reloads the car's data; a failure shows in plain words. */
  async function runWrite(write, successNotice) {
    setBusy(true);
    setActionError("");
    try {
      const { error } = await write();
      if (error) {
        setActionError(describeSaveError(error));
        return false;
      }
      // The message only appears once the list already reflects the change.
      await reload(selectedCarId);
      resetPanels();
      setNotice(successNotice);
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkDone(event, item) {
    event.preventDefault();
    const errors = getCompletionErrors(panelValues, today, item.interval_km != null);
    setPanelErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const odometer = String(panelValues.odometer ?? "").trim();
    const note = String(panelValues.note ?? "").trim();
    await runWrite(
      () =>
        // One insert: the item's schedule restarts from its latest completion.
        supabase.from("maintenance_records").insert({
          user_id: user.id,
          item_id: item.id,
          done_on: panelValues.doneOn,
          odometer_km: odometer === "" ? null : Number(odometer),
          note: note === "" ? null : note,
        }),
      `${item.name} marked as done.`,
    );
  }

  async function handleEdit(event, item) {
    event.preventDefault();
    const errors = getMaintenanceItemErrors(panelValues, today);
    setPanelErrors(errors);
    if (Object.keys(errors).length > 0) return;
    // Only the editable columns are sent (the database allows no others).
    await runWrite(
      () => supabase.from("maintenance_items").update(itemFromForm(panelValues)).eq("id", item.id),
      `${panelValues.name.trim()} updated.`,
    );
  }

  async function handleDelete(item) {
    await runWrite(
      () => supabase.from("maintenance_items").delete().eq("id", item.id),
      `${item.name} deleted.`,
    );
  }

  async function handleUndo(record, item) {
    await runWrite(
      () => supabase.from("maintenance_records").delete().eq("id", record.id),
      `Completion of ${item.name} on ${formatFillDate(record.done_on)} undone.`,
    );
  }

  if (loadingCars) {
    return (
      <PageShell title="Maintenance" description="">
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
      <PageShell title="Maintenance" description="Add a car before tracking its maintenance.">
        <Link className="btn-primary" to="/cars/new">
          Add Your Car
        </Link>
      </PageShell>
    );
  }

  const label = selectedCar ? carLabel(selectedCar) : "";
  const panelFor = (item, kind) => panel?.itemId === item.id && panel.kind === kind;
  const setPanelField = (field, value) => setPanelValues((values) => ({ ...values, [field]: value }));

  return (
    <PageShell
      title="Maintenance"
      description="Keep track of your car's regular servicing and see what's due."
    >
      <div className="maintenance-toolbar">
        {cars.length > 1 ? (
          <div className="form-field maintenance-toolbar__car">
            <label htmlFor="maintenanceCarId">Car</label>
            <select id="maintenanceCarId" value={selectedCarId} onChange={(event) => handleCarChange(event.target.value)}>
              {cars.map((car) => (
                <option key={car.id} value={car.id}>
                  {carLabel(car)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="fuel-log-car-name">{label}</p>
        )}
        {items && (
          <p className="maintenance-toolbar__reading">
            {reading
              ? `Latest odometer: ${formatKm(reading.km)} (${formatFillDate(reading.filledAt)}, from your Fuel Log)`
              : "No odometer reading yet for this car."}
          </p>
        )}
      </div>

      {anyKmItemWithoutReading && (
        <p className="maintenance-notice">
          Items tracked by km need a current reading. Add an odometer reading with your next fill-up in
          the <Link to="/fuel-log">Fuel Log</Link>.
        </p>
      )}

      {notice && <p role="status" className="fuel-log-saved">{notice}</p>}
      {actionError && <p role="alert" className="auth-form__error">{actionError}</p>}

      <section className="route-params-card maintenance-add" aria-label="Add a maintenance item">
        {!adding ? (
          <>
            <p className="form-section-label">Add an item</p>
            <p className="maintenance-add__hint">Start from a suggestion (you can change it before saving) or add your own.</p>
            <div className="maintenance-presets">
              {PRESETS.map((preset) => (
                <button key={preset.name} type="button" className="maintenance-preset" onClick={() => startAdding(preset)}>
                  {preset.name}
                </button>
              ))}
              <button type="button" className="maintenance-preset maintenance-preset--custom" onClick={() => startAdding(null)}>
                + Custom item
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleAdd} noValidate className="car-form">
            <p className="form-section-label">Add an item</p>
            <ItemFields
              idPrefix="add"
              values={addValues}
              errors={addErrors}
              today={today}
              onChange={(field, value) => setAddValues((values) => ({ ...values, [field]: value }))}
            />
            <div className="maintenance-form-actions">
              <button className="btn-primary" type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save item"}
              </button>
              <button type="button" className="maintenance-link-btn" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="dashboard-section" aria-label="Maintenance items">
        <h2>Maintenance{label ? ` for ${label}` : ""}</h2>

        {items === null ? (
          <p>Loading maintenance items...</p>
        ) : loadError ? (
          <p role="alert" className="auth-form__error">{loadError}</p>
        ) : rows.length === 0 ? (
          <div className="fuel-log-empty">
            <p className="fuel-log-empty__title">Nothing tracked yet</p>
            <p>Pick a suggestion above, such as an oil change, to start getting reminders of what&apos;s due.</p>
          </div>
        ) : (
          <ul className="maintenance-list">
            {rows.map(({ item, status }) => {
              const records = item.maintenance_records ?? [];
              const last = latestRecord(records);
              const remaining = describeRemaining(status);
              return (
                <li key={item.id} id={itemAnchorId(item.id)} className="maintenance-card">
                  <div className="maintenance-card__header">
                    <h3>{item.name}</h3>
                    <span className={`maintenance-badge maintenance-badge--${status.status}`}>
                      {STATUS_LABELS[status.status]}
                    </span>
                  </div>
                  <p className="maintenance-card__due">
                    {describeDue(status)}
                    {remaining && <span className="maintenance-card__remaining"> ({remaining})</span>}
                  </p>
                  <p className="maintenance-card__last">
                    {last
                      ? `Last done ${formatFillDate(last.done_on)}${last.odometer_km != null ? ` at ${formatKm(last.odometer_km)}` : ""}`
                      : `Tracking since ${formatFillDate(item.baseline_date)}${item.baseline_km != null ? ` at ${formatKm(item.baseline_km)}` : ""}`}
                  </p>
                  {status.needsReading && status.status !== STATUS.NEEDS_READING && (
                    <p className="maintenance-card__note">Add an odometer reading to also track this by km.</p>
                  )}
                  {item.notes && <p className="maintenance-card__notes">{item.notes}</p>}

                  <div className="maintenance-card__actions">
                    <button type="button" className="btn-primary maintenance-card__done" onClick={() => openPanel(item, "done")}>
                      Mark as done
                    </button>
                    <button type="button" className="maintenance-link-btn" aria-expanded={panelFor(item, "history")} onClick={() => openPanel(item, "history")}>
                      History ({records.length})
                    </button>
                    <button type="button" className="maintenance-link-btn" onClick={() => openPanel(item, "edit")}>
                      Edit
                    </button>
                    <button type="button" className="maintenance-link-btn maintenance-link-btn--danger" onClick={() => openPanel(item, "delete")}>
                      Delete
                    </button>
                  </div>

                  {panelFor(item, "done") && (
                    <form className="maintenance-panel" noValidate onSubmit={(event) => handleMarkDone(event, item)} aria-label={`Mark ${item.name} as done`}>
                      <div className="maintenance-interval__row">
                        <div className="form-field">
                          <label htmlFor={`done-on-${item.id}`}>Done on *</label>
                          <input
                            id={`done-on-${item.id}`}
                            type="date"
                            max={today}
                            min={LIMITS.MIN_MAINTENANCE_DATE}
                            value={panelValues.doneOn ?? ""}
                            aria-invalid={panelErrors.doneOn ? "true" : undefined}
                            onChange={(event) => setPanelField("doneOn", event.target.value)}
                          />
                          {panelErrors.doneOn && <p role="alert" className="auth-form__error">{panelErrors.doneOn}</p>}
                        </div>
                        <div className="form-field">
                          <label htmlFor={`done-km-${item.id}`}>Odometer (km){item.interval_km != null ? " *" : ""}</label>
                          <FormattedNumberInput
                            id={`done-km-${item.id}`}
                            placeholder="e.g. 89,100"
                            value={panelValues.odometer ?? ""}
                            aria-invalid={panelErrors.odometer ? "true" : undefined}
                            onChange={(raw) => setPanelField("odometer", raw)}
                          />
                          {panelErrors.odometer && <p role="alert" className="auth-form__error">{panelErrors.odometer}</p>}
                        </div>
                      </div>
                      <div className="form-field">
                        <label htmlFor={`done-note-${item.id}`}>Note</label>
                        <input
                          id={`done-note-${item.id}`}
                          type="text"
                          maxLength={LIMITS.MAINTENANCE_NOTES}
                          placeholder="e.g. Replaced the oil filter too"
                          value={panelValues.note ?? ""}
                          onChange={(event) => setPanelField("note", event.target.value)}
                        />
                        {panelErrors.note && <p role="alert" className="auth-form__error">{panelErrors.note}</p>}
                      </div>
                      <div className="maintenance-form-actions">
                        <button className="btn-primary" type="submit" disabled={busy}>
                          {busy ? "Saving..." : "Save"}
                        </button>
                        <button type="button" className="maintenance-link-btn" onClick={resetPanels}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {panelFor(item, "edit") && (
                    <form className="maintenance-panel car-form" noValidate onSubmit={(event) => handleEdit(event, item)} aria-label={`Edit ${item.name}`}>
                      <ItemFields idPrefix={`edit-${item.id}`} values={panelValues} errors={panelErrors} today={today} onChange={setPanelField} />
                      {records.length > 0 && (
                        <p className="form-hint">
                          The schedule now runs from the latest completion; &quot;last done&quot; above only matters if all completions are undone.
                        </p>
                      )}
                      <div className="maintenance-form-actions">
                        <button className="btn-primary" type="submit" disabled={busy}>
                          {busy ? "Saving..." : "Save changes"}
                        </button>
                        <button type="button" className="maintenance-link-btn" onClick={resetPanels}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {panelFor(item, "delete") && (
                    <div role="alert" className="maintenance-confirm">
                      <p>
                        Delete {item.name} and its history ({records.length} {records.length === 1 ? "completion" : "completions"})?
                        This can&apos;t be undone.
                      </p>
                      <div className="maintenance-form-actions">
                        <button type="button" className="maintenance-danger-btn" disabled={busy} onClick={() => handleDelete(item)}>
                          Delete
                        </button>
                        <button type="button" className="maintenance-link-btn" onClick={resetPanels}>
                          Keep it
                        </button>
                      </div>
                    </div>
                  )}

                  {panelFor(item, "history") && (
                    <div className="maintenance-panel">
                      {records.length === 0 ? (
                        <p className="maintenance-history__empty">No completions yet. Use Mark as done after the next service.</p>
                      ) : (
                        <ul className="maintenance-history" aria-label={`${item.name} history`}>
                          {[...records]
                            .sort((a, b) => b.done_on.localeCompare(a.done_on) || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
                            .map((record) => (
                              <li key={record.id} className="maintenance-history__row">
                                <span>
                                  {formatFillDate(record.done_on)}
                                  {record.odometer_km != null && ` at ${formatKm(record.odometer_km)}`}
                                  {record.note && <span className="maintenance-history__note"> ({record.note})</span>}
                                </span>
                                {confirmUndoId === record.id ? (
                                  <span role="alert" className="maintenance-history__confirm">
                                    Undo this completion? The schedule goes back to the one before.{" "}
                                    <button type="button" className="maintenance-danger-btn" disabled={busy} onClick={() => handleUndo(record, item)}>
                                      Undo
                                    </button>{" "}
                                    <button type="button" className="maintenance-link-btn" onClick={() => setConfirmUndoId(null)}>
                                      Keep it
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="maintenance-link-btn"
                                    aria-label={`Undo the completion on ${formatFillDate(record.done_on)}`}
                                    onClick={() => setConfirmUndoId(record.id)}
                                  >
                                    Undo
                                  </button>
                                )}
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

export default MaintenancePage;
