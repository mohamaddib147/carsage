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
// Layout matches docs/stitch_carsage_landing_page/carsage_add_your_car
// for the in-scope parts (scan card row, section divider, 2-column field
// grid); its "Designate as Primary Vehicle" telemetry checkbox and
// multi-step wizard chrome are out of scope (no OBD-II telemetry, no
// multi-car "primary" concept) and are omitted.

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { supabase } from "../lib/supabaseClient.js";
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
    "Looked up on auto-data.net for this model — it can vary by trim and market, so check it against your car.",
  ai_estimate:
    "Estimated by AI for this model — please check it against your car.",
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

  return errors;
}

/**
 * Add Your Car screen: manual entry form for Make, Model, Year, Engine
 * Type, Fuel Type, License Plate, and VIN. On submit, inserts a new row
 * into `cars` scoped to the logged-in user, then navigates to its
 * (future) Car Profile page.
 * @returns {JSX.Element}
 */
function CarOnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [specNotice, setSpecNotice] = useState("");
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
      try {
        const suggestions = await apiFetch(
          `/cars/spec-suggestions?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&year=${yearNumber}`,
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
          setSpecNotice("Some specs were auto-filled below — feel free to edit them.");
        }
      } catch {
        // Best-effort autofill only — a failed lookup just leaves manual
        // entry as the only option, silently.
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
        setSubmitError(error.message);
        return;
      }

      navigate(`/cars/${data.id}`, { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      title="Add Your Car"
      description="Enter your car's details manually, or scan your registration card (coming soon)."
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
        <p className="form-section-label">Core Specifications</p>
        {specNotice && <p className="form-hint">{specNotice}</p>}

        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="make">Make *</label>
            <input
              id="make"
              name="make"
              type="text"
              placeholder="e.g. Toyota"
              value={form.make}
              onChange={handleChange("make")}
            />
            {fieldErrors.make && (
              <p role="alert" className="auth-form__error">
                {fieldErrors.make}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="model">Model *</label>
            <input
              id="model"
              name="model"
              type="text"
              placeholder="e.g. Corolla"
              value={form.model}
              onChange={handleChange("model")}
            />
            {fieldErrors.model && (
              <p role="alert" className="auth-form__error">
                {fieldErrors.model}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="year">Year *</label>
            <input
              id="year"
              name="year"
              type="number"
              placeholder="e.g. 2020"
              value={form.year}
              onChange={handleChange("year")}
            />
            {fieldErrors.year && (
              <p role="alert" className="auth-form__error">
                {fieldErrors.year}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="engineType">Engine Type</label>
            <input
              id="engineType"
              name="engineType"
              type="text"
              placeholder="e.g. 2.5L Inline-4"
              value={form.engineType}
              onChange={handleChange("engineType")}
            />
          </div>

          <div className="form-field">
            <label htmlFor="fuelType">Fuel Type *</label>
            <select
              id="fuelType"
              name="fuelType"
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
            {fieldErrors.fuelType && (
              <p role="alert" className="auth-form__error">
                {fieldErrors.fuelType}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="licensePlate">License Plate</label>
            <input
              id="licensePlate"
              name="licensePlate"
              type="text"
              placeholder="e.g. 7XYZ890"
              value={form.licensePlate}
              onChange={handleChange("licensePlate")}
            />
          </div>

          <div className="form-field">
            <label htmlFor="fuelEfficiency">Fuel Efficiency (km/L)</label>
            <input
              id="fuelEfficiency"
              name="fuelEfficiency"
              type="number"
              step="0.1"
              placeholder="Auto-filled if available"
              value={form.fuelEfficiency}
              onChange={handleChange("fuelEfficiency")}
            />
          </div>

          <div className="form-field">
            <label htmlFor="cylinders">Cylinders</label>
            <input
              id="cylinders"
              name="cylinders"
              type="number"
              placeholder="Auto-filled if available"
              value={form.cylinders}
              onChange={handleChange("cylinders")}
            />
          </div>

          <div className="form-field">
            <label htmlFor="drivetrain">Drivetrain</label>
            <input
              id="drivetrain"
              name="drivetrain"
              type="text"
              placeholder="e.g. fwd, rwd, awd"
              value={form.drivetrain}
              onChange={handleChange("drivetrain")}
            />
          </div>

          <div className="form-field">
            <label htmlFor="fuelTankCapacity">Fuel Tank Capacity (L)</label>
            <input
              id="fuelTankCapacity"
              name="fuelTankCapacity"
              type="number"
              min="5"
              max="200"
              step="0.1"
              placeholder="e.g. 50 — auto-filled if available"
              value={form.fuelTankCapacity}
              onChange={(event) => {
                setTankSource(null);
                handleChange("fuelTankCapacity")(event);
              }}
            />
            {tankSource && form.fuelTankCapacity && (
              <p className="form-field__note">{TANK_SOURCE_NOTES[tankSource]}</p>
            )}
            {fieldErrors.fuelTankCapacity && (
              <p role="alert" className="auth-form__error">
                {fieldErrors.fuelTankCapacity}
              </p>
            )}
          </div>

          <div className="form-field">
            <label htmlFor="transmission">Transmission</label>
            <input
              id="transmission"
              name="transmission"
              type="text"
              placeholder="Auto-filled if available"
              value={form.transmission}
              onChange={handleChange("transmission")}
            />
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="vin">VIN</label>
          <input
            id="vin"
            name="vin"
            type="text"
            placeholder="e.g. 4S4BSANC8M3801249"
            value={form.vin}
            onChange={handleChange("vin")}
          />
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
          Add Car
          <span aria-hidden="true">→</span>
        </button>
      </form>
    </PageShell>
  );
}

export default CarOnboardingPage;
