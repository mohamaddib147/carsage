// Car Onboarding screen — manual add-a-car form. The "scan registration
// card" button is a disabled placeholder for MVP (OCR is a stretch goal).
// Once Make, Model, and a valid Year are all filled in, a debounced
// background lookup (CAR-34) queries NHTSA vPIC + API Ninjas via the
// FastAPI backend and fills in Engine Type, Fuel Efficiency, Cylinders,
// Drivetrain, and Transmission where they're still empty — the user can
// always override any autofilled value, and a lookup that fails or finds
// no match never blocks manual entry. Fuel Tank Capacity (L, CAR-44) is
// filled the same way. No free spec API provides it, so the backend looks
// it up on auto-data.net, and only if that finds nothing falls back to an
// AI estimate. Either way a note under the field says where the value
// came from and to check it (it disappears as soon as the user edits it).
// Polish pass: the disabled Scan button looks disabled; while the lookup runs a
// "Looking up specs" status shows, and each field it fills gets an "Auto-filled" tag
// (until the user edits it); a "* Required" legend sits above "Core Specifications",
// which is split into Basic Info / Performance / Identification; a required field left
// empty is outlined in red (and cleared as soon as it is edited); tank capacity and VIN
// have a one-line caption; and a Cancel link goes back to the Dashboard.
// Layout matches docs/stitch_carsage_landing_page/carsage_add_your_car
// for the in-scope parts (scan card row, section divider, 2-column field
// grid); its "Designate as Primary Vehicle" telemetry checkbox and
// multi-step wizard chrome are out of scope (no OBD-II telemetry, no
// multi-car "primary" concept) and are omitted.

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { supabase } from "../lib/supabaseClient.js";
import {
  LIMITS,
  describeSaveError,
  getCarFieldErrors,
} from "../lib/limits.js";
import { getTankCapacityError } from "../lib/tankCapacity.js";

// How long to wait after the user stops typing Make/Model/Year before
// firing the autofill lookup, so it doesn't fire on every keystroke.
const SPEC_LOOKUP_DEBOUNCE_MS = 600;

const CURRENT_YEAR = new Date().getFullYear();

const FUEL_TYPE_OPTIONS = [
  "Gasoline",
  "Diesel",
  "Hybrid",
  "Electric",
  "Other",
];

// Note shown under an autofilled Fuel Tank Capacity, by where it came
// from. (A value from API Ninjas needs no note.)
const TANK_SOURCE_NOTES = {
  auto_data:
    "Looked up on auto-data.net for this model. It can vary by trim and market, so check it against your car.",
  ai_estimate:
    "Estimated by AI for this model. Please check it against your car.",
};

const EMPTY_FORM = {
  make: "",
  model: "",
  year: "",
  engineType: "",
  fuelType: "",
  licensePlate: "",
  vin: "",
  fuelEfficiency: "",
  cylinders: "",
  drivetrain: "",
  transmission: "",
  fuelTankCapacity: "",
};

/**
 * Validates the required fields (Make, Model, Year, Fuel Type) and the
 * shape of Year. Returns a map of field name -> error message; a field
 * with no error is omitted.
 * @param {typeof EMPTY_FORM} form
 * @returns {Record<string, string>}
 */
function validate(form) {
  const errors = {};

  if (!form.make.trim()) errors.make = "Make is required.";
  if (!form.model.trim()) errors.model = "Model is required.";
  if (!form.fuelType) errors.fuelType = "Fuel type is required.";

  if (!form.year.trim()) {
    errors.year = "Year is required.";
  } else {
    const yearNumber = Number(form.year);
    if (
      !Number.isInteger(yearNumber) ||
      yearNumber < 1900 ||
      yearNumber > CURRENT_YEAR + 1
    ) {
      errors.year = `Enter a valid year between 1900 and ${CURRENT_YEAR + 1}.`;
    }
  }

  if (form.fuelTankCapacity.trim()) {
    const capacityError = getTankCapacityError(form.fuelTankCapacity);
    if (capacityError) errors.fuelTankCapacity = capacityError;
  }

  // Length / range limits shared with the server (lib/limits.js); the
  // required-field messages above win when both apply.
  for (const [field, message] of Object.entries(getCarFieldErrors(form))) {
    if (!errors[field]) errors[field] = message;
  }

  return errors;
}

/**
 * Small "✓ Auto-filled" tag shown next to a field's label while its value is the one the
 * spec lookup filled in (it goes away when the user edits the field).
 * @returns {JSX.Element}
 */
function AutoFilledTag() {
  return (
    <span className="autofill-tag" title="Filled in automatically, feel free to edit it">
      <span aria-hidden="true">✓</span> Auto-filled
    </span>
  );
}

/**
 * A field's label plus, when it applies, the auto-filled tag. The tag sits BESIDE the
 * <label>, not inside it, so the field's accessible name stays exactly its label text.
 * @param {{ htmlFor: string, autoFilled?: boolean, children: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
function LabelRow({ htmlFor, autoFilled, children }) {
  return (
    <div className="form-field__label-row">
      <label htmlFor={htmlFor}>{children}</label>
      {autoFilled && <AutoFilledTag />}
    </div>
  );
}

/**
 * Add Your Car screen: manual entry form for Make, Model, Year, Engine
 * Type, Fuel Type, License Plate, and VIN. On submit, inserts a new row
 * into `cars` scoped to the logged-in user, then navigates to its
 * (future) Car Profile page.
 * @returns {JSX.Element}
 */
function CarOnboardingPage() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  // The spec lookup endpoint requires a logged-in caller (CAR-24), so the
  // session token is sent; a ref keeps the debounced callback current.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [specNotice, setSpecNotice] = useState("");
  // True while the spec lookup request is in flight (drives the "Looking up specs" status).
  const [specLoading, setSpecLoading] = useState(false);
  // Which fields currently hold a value the lookup filled in, by field name. A field is
  // removed as soon as the user edits it (handleChange).
  const [autoFilled, setAutoFilled] = useState({});
  // Where the untouched autofilled Fuel Tank Capacity in the field came
  // from ("auto_data" | "ai_estimate"), or null if it was typed by the user,
  // came from a fully trusted source, or is empty. Drives the note below.
  const [tankSource, setTankSource] = useState(null);
  const specLookupRanFor = useRef("");
  // Mirrors `form` so the async autofill callback can see whether the tank
  // field is still empty without a stale closure.
  const formRef = useRef(form);
  formRef.current = form;

  /** @param {keyof typeof EMPTY_FORM} field */
  function handleChange(field) {
    return (event) => {
      setForm((previous) => ({ ...previous, [field]: event.target.value }));
      // Editing a field means the user has taken it over: its red error outline (from a
      // failed submit) is done with, and its value is no longer "auto-filled".
      setFieldErrors((previous) => {
        if (!previous[field]) return previous;
        const { [field]: _fixed, ...rest } = previous;
        return rest;
      });
      setAutoFilled((previous) => {
        if (!previous[field]) return previous;
        const { [field]: _edited, ...rest } = previous;
        return rest;
      });
    };
  }

  // CAR-34: once Make/Model/Year are all valid, look up autofill
  // suggestions in the background and fill in whichever of Engine Type,
  // Fuel Efficiency, Cylinders, Drivetrain, and Transmission are still
  // empty. Debounced so it only fires after the user pauses typing, and
  // keyed by make|model|year so it never re-fires for the same values
  // (e.g. after the lookup itself fills Engine Type).
  useEffect(() => {
    const make = form.make.trim();
    const model = form.model.trim();
    const yearNumber = Number(form.year);
    const yearValid =
      form.year.trim() &&
      Number.isInteger(yearNumber) &&
      yearNumber >= 1900 &&
      yearNumber <= CURRENT_YEAR + 1;

    if (!make || !model || !yearValid) return;

    const lookupKey = `${make}|${model}|${yearNumber}`;
    if (specLookupRanFor.current === lookupKey) return;

    const timer = setTimeout(async () => {
      specLookupRanFor.current = lookupKey;
      setSpecLoading(true);
      try {
        const suggestions = await apiFetch(
          `/cars/spec-suggestions?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${yearNumber}`,
          { accessToken: sessionRef.current?.access_token },
        );

        // Only label the tank value if the autofill is what actually fills
        // the (still-empty) field.
        if (
          !formRef.current.fuelTankCapacity &&
          suggestions.fuel_tank_capacity_liters != null &&
          TANK_SOURCE_NOTES[suggestions.fuel_tank_capacity_source]
        ) {
          setTankSource(suggestions.fuel_tank_capacity_source);
        }

        // Tag exactly the fields this lookup is about to fill: the ones that are empty now and
        // for which it has a value. (Fields the user typed into are left alone and untagged.)
        const current = formRef.current;
        const filled = {};
        if (!current.engineType && suggestions.engine_type) filled.engineType = true;
        if (!current.fuelEfficiency && suggestions.fuel_efficiency != null) filled.fuelEfficiency = true;
        if (!current.cylinders && suggestions.cylinders != null) filled.cylinders = true;
        if (!current.drivetrain && suggestions.drivetrain) filled.drivetrain = true;
        if (!current.transmission && suggestions.transmission) filled.transmission = true;
        if (!current.fuelTankCapacity && suggestions.fuel_tank_capacity_liters != null) filled.fuelTankCapacity = true;
        setAutoFilled((previous) => ({ ...previous, ...filled }));

        setForm((previous) => ({
          ...previous,
          engineType: previous.engineType || suggestions.engine_type || "",
          fuelEfficiency:
            previous.fuelEfficiency ||
            (suggestions.fuel_efficiency != null
              ? String(suggestions.fuel_efficiency)
              : ""),
          cylinders:
            previous.cylinders ||
            (suggestions.cylinders != null ? String(suggestions.cylinders) : ""),
          drivetrain: previous.drivetrain || suggestions.drivetrain || "",
          transmission: previous.transmission || suggestions.transmission || "",
          fuelTankCapacity:
            previous.fuelTankCapacity ||
            (suggestions.fuel_tank_capacity_liters != null
              ? String(suggestions.fuel_tank_capacity_liters)
              : ""),
        }));

        if (
          suggestions.engine_type ||
          suggestions.fuel_efficiency != null ||
          suggestions.cylinders != null ||
          suggestions.drivetrain ||
          suggestions.transmission ||
          suggestions.fuel_tank_capacity_liters != null
        ) {
          setSpecNotice("Some specs were auto-filled below, feel free to edit them.");
        }
      } catch {
        // Best-effort autofill only — a failed lookup just leaves manual
        // entry as the only option, silently.
      } finally {
        setSpecLoading(false);
      }
    }, SPEC_LOOKUP_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [form.make, form.model, form.year]);

  /** @param {import('react').FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitError("");

    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("cars")
        .insert({
          user_id: user.id,
          make: form.make.trim(),
          model: form.model.trim(),
          year: Number(form.year),
          engine_type: form.engineType.trim() || null,
          fuel_type: form.fuelType,
          license_plate: form.licensePlate.trim() || null,
          vin: form.vin.trim() || null,
          fuel_efficiency: form.fuelEfficiency.trim()
            ? Number(form.fuelEfficiency)
            : null,
          cylinders: form.cylinders.trim() ? Number(form.cylinders) : null,
          drivetrain: form.drivetrain.trim() || null,
          transmission: form.transmission.trim() || null,
          fuel_tank_capacity_liters: form.fuelTankCapacity.trim()
            ? Number(form.fuelTankCapacity)
            : null,
        })
        .select()
        .single();

      if (error) {
        setSubmitError(describeSaveError(error));
        return;
      }

      navigate(`/cars/${data.id}`, { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  /** The red error message under a field, if it has one. */
  const fieldError = (field) =>
    fieldErrors[field] ? (
      <p role="alert" className="auth-form__error">
        {fieldErrors[field]}
      </p>
    ) : null;
  /** aria-invalid for a field with an error — also what the red outline is styled from. */
  const invalid = (field) => (fieldErrors[field] ? "true" : undefined);

  return (
    <PageShell
      title="Meet Your Car"
      description="Add your vehicle details to get started. Enter them manually, or scan your registration card (coming soon)."
    >
      <div className="scan-card">
        <span className="scan-card__icon" aria-hidden="true">
          📷
        </span>
        <div className="scan-card__text">
          <p className="scan-card__title">
            Scan Registration Card
            <span className="pill">Coming soon</span>
          </p>
          <p className="scan-card__desc">
            Instant auto-fill from your registration document.
          </p>
        </div>
        <button className="btn-accent" type="button" disabled>
          Scan Document
        </button>
      </div>

      <div className="form-divider">
        <span>Or enter manually</span>
      </div>

      <form onSubmit={handleSubmit} noValidate className="car-form">
        <p className="form-legend">* Required</p>
        <p className="form-section-label">Core Specifications</p>
        {specNotice && <p className="form-hint">{specNotice}</p>}

        <section className="form-subsection" aria-labelledby="basic-info-title">
          <h3 id="basic-info-title" className="form-subsection__title">
            Basic Info
          </h3>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="make">Make *</label>
              <input
                id="make"
                name="make"
                type="text" maxLength={LIMITS.MAKE_MODEL}
                placeholder="e.g. Toyota"
                aria-invalid={invalid("make")}
                value={form.make}
                onChange={handleChange("make")}
              />
              {fieldError("make")}
            </div>

            <div className="form-field">
              <label htmlFor="model">Model *</label>
              <input
                id="model"
                name="model"
                type="text" maxLength={LIMITS.MAKE_MODEL}
                placeholder="e.g. Corolla"
                aria-invalid={invalid("model")}
                value={form.model}
                onChange={handleChange("model")}
              />
              {fieldError("model")}
            </div>

            <div className="form-field">
              <label htmlFor="year">Year *</label>
              <input
                id="year"
                name="year"
                type="number"
                placeholder="e.g. 2020"
                aria-invalid={invalid("year")}
                value={form.year}
                onChange={handleChange("year")}
              />
              {fieldError("year")}
            </div>

            <div className="form-field">
              <label htmlFor="fuelType">Fuel Type *</label>
              <select
                id="fuelType"
                name="fuelType"
                aria-invalid={invalid("fuelType")}
                value={form.fuelType}
                onChange={handleChange("fuelType")}
              >
                <option value="">Select a fuel type</option>
                {FUEL_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {fieldError("fuelType")}
            </div>
          </div>
        </section>

        <section className="form-subsection" aria-labelledby="performance-title">
          <h3 id="performance-title" className="form-subsection__title">
            Performance
          </h3>
          {specLoading && (
            <p role="status" className="spec-loading">
              <span className="spec-loading__spinner" aria-hidden="true" />
              Looking up specs for your car…
            </p>
          )}
          <div className="form-grid">
            <div className="form-field">
              <LabelRow htmlFor="engineType" autoFilled={autoFilled.engineType}>
                Engine Type
              </LabelRow>
              <input
                id="engineType"
                name="engineType"
                type="text" maxLength={LIMITS.ENGINE_TYPE}
                placeholder="e.g. 2.5L Inline-4"
                aria-invalid={invalid("engineType")}
                value={form.engineType}
                onChange={handleChange("engineType")}
              />
              {fieldError("engineType")}
            </div>

            <div className="form-field">
              <LabelRow htmlFor="fuelEfficiency" autoFilled={autoFilled.fuelEfficiency}>
                Fuel Efficiency (km/L)
              </LabelRow>
              <input
                id="fuelEfficiency"
                name="fuelEfficiency"
                type="number" max={LIMITS.MAX_FUEL_EFFICIENCY}
                step="0.1"
                placeholder="e.g. 11.5 (auto-filled if available)"
                aria-invalid={invalid("fuelEfficiency")}
                value={form.fuelEfficiency}
                onChange={handleChange("fuelEfficiency")}
              />
              {fieldError("fuelEfficiency")}
            </div>

            <div className="form-field">
              <LabelRow htmlFor="cylinders" autoFilled={autoFilled.cylinders}>
                Cylinders
              </LabelRow>
              <input
                id="cylinders"
                name="cylinders"
                type="number" min={LIMITS.MIN_CYLINDERS} max={LIMITS.MAX_CYLINDERS}
                placeholder="e.g. 4 (auto-filled if available)"
                aria-invalid={invalid("cylinders")}
                value={form.cylinders}
                onChange={handleChange("cylinders")}
              />
              {fieldError("cylinders")}
            </div>

            <div className="form-field">
              <LabelRow htmlFor="drivetrain" autoFilled={autoFilled.drivetrain}>
                Drivetrain
              </LabelRow>
              <input
                id="drivetrain"
                name="drivetrain"
                type="text" maxLength={LIMITS.DRIVETRAIN}
                placeholder="e.g. fwd, rwd, awd"
                aria-invalid={invalid("drivetrain")}
                value={form.drivetrain}
                onChange={handleChange("drivetrain")}
              />
              {fieldError("drivetrain")}
            </div>

            <div className="form-field">
              <LabelRow htmlFor="transmission" autoFilled={autoFilled.transmission}>
                Transmission
              </LabelRow>
              <input
                id="transmission"
                name="transmission"
                type="text" maxLength={LIMITS.TRANSMISSION}
                placeholder="e.g. Automatic (auto-filled if available)"
                aria-invalid={invalid("transmission")}
                value={form.transmission}
                onChange={handleChange("transmission")}
              />
              {fieldError("transmission")}
            </div>

            <div className="form-field">
              <LabelRow htmlFor="fuelTankCapacity" autoFilled={autoFilled.fuelTankCapacity}>
                Fuel Tank Capacity (L)
              </LabelRow>
              <input
                id="fuelTankCapacity"
                name="fuelTankCapacity"
                type="number"
                min="5"
                max="200"
                step="0.1"
                placeholder="e.g. 50 (auto-filled if available)"
                aria-invalid={invalid("fuelTankCapacity")}
                aria-describedby="fuelTankCapacity-caption"
                value={form.fuelTankCapacity}
                onChange={(event) => {
                  setTankSource(null);
                  handleChange("fuelTankCapacity")(event);
                }}
              />
              <p id="fuelTankCapacity-caption" className="form-field__note">
                Used to estimate Full Tank Cost in Trip Planner
              </p>
              {tankSource && form.fuelTankCapacity && (
                <p className="form-field__note">{TANK_SOURCE_NOTES[tankSource]}</p>
              )}
              {fieldError("fuelTankCapacity")}
            </div>
          </div>
        </section>

        <section className="form-subsection" aria-labelledby="identification-title">
          <h3 id="identification-title" className="form-subsection__title">
            Identification
          </h3>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="licensePlate">License Plate</label>
              <input
                id="licensePlate"
                name="licensePlate"
                type="text" maxLength={LIMITS.LICENSE_PLATE}
                placeholder="e.g. 7XYZ890"
                aria-invalid={invalid("licensePlate")}
                value={form.licensePlate}
                onChange={handleChange("licensePlate")}
              />
              {fieldError("licensePlate")}
            </div>

            <div className="form-field">
              <label htmlFor="vin">VIN</label>
              <input
                id="vin"
                name="vin"
                type="text" maxLength={LIMITS.VIN}
                placeholder="e.g. 4S4BSANC8M3801249"
                aria-invalid={invalid("vin")}
                aria-describedby="vin-caption"
                value={form.vin}
                onChange={handleChange("vin")}
              />
              <p id="vin-caption" className="form-field__note">
                Optional: the identification number on your registration card
              </p>
              {fieldError("vin")}
            </div>
          </div>
        </section>

        {submitError && (
          <p role="alert" className="auth-form__error">
            {submitError}
          </p>
        )}

        <div className="form-actions">
          <Link className="btn-secondary" to="/dashboard">
            Cancel
          </Link>
          <button
            className="btn-primary btn-block"
            type="submit"
            disabled={submitting}
          >
            Add Car
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </PageShell>
  );
}

export default CarOnboardingPage;
