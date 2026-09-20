// Car Profile screen — displays a saved car's specs and lets the owner
// edit or delete it. Reached either as /cars/mine (the logged-in user's
// own car, looked up by user_id — MVP is one car per user) or
// /cars/:carId (a specific car, e.g. right after onboarding, or from the
// Dashboard's car list once a user has more than one). Both paths rely
// on the `cars` RLS policies to keep this scoped to the owner. Deleting
// a car cascades to its `trips` rows and nulls out any
// `advisor_conversations.car_id` referencing it (CAR-38) — both handled
// by the DB's own foreign key rules, not application code.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import {
  LIMITS,
  describeSaveError,
  getCarFieldErrors,
} from "../lib/limits.js";
import { getTankCapacityError } from "../lib/tankCapacity.js";

const FUEL_TYPE_OPTIONS = [
  "Gasoline",
  "Diesel",
  "Hybrid",
  "Electric",
  "Other",
];

const FIELD_LABELS = {
  make: "Make",
  model: "Model",
  year: "Year",
  engine_type: "Engine Type",
  fuel_type: "Fuel Type",
  fuel_efficiency: "Fuel Efficiency (km/L)",
  cylinders: "Cylinders",
  fuel_tank_capacity_liters: "Fuel Tank Capacity (L)",
  drivetrain: "Drivetrain",
  transmission: "Transmission",
  license_plate: "License Plate",
  vin: "VIN",
};

// Purely decorative row icons for the specifications list — aria-hidden,
// never part of the field's text content, so they can't affect the
// isolated per-field text nodes tests rely on.
const FIELD_ICONS = {
  make: "🚗",
  model: "🏷️",
  year: "📅",
  engine_type: "🔧",
  fuel_type: "⛽",
  fuel_efficiency: "📊",
  cylinders: "🛠️",
  fuel_tank_capacity_liters: "🛢️",
  drivetrain: "⚙️",
  transmission: "🔁",
  license_plate: "🪪",
  vin: "🔢",
};

/** Converts a car row into edit-form string values (never null, for controlled inputs). */
function toFormValues(car) {
  return {
    make: car.make ?? "",
    model: car.model ?? "",
    year: String(car.year ?? ""),
    engine_type: car.engine_type ?? "",
    fuel_type: car.fuel_type ?? "",
    fuel_efficiency: car.fuel_efficiency == null ? "" : String(car.fuel_efficiency),
    cylinders: car.cylinders == null ? "" : String(car.cylinders),
    fuel_tank_capacity_liters:
      car.fuel_tank_capacity_liters == null
        ? ""
        : String(car.fuel_tank_capacity_liters),
    drivetrain: car.drivetrain ?? "",
    transmission: car.transmission ?? "",
    license_plate: car.license_plate ?? "",
    vin: car.vin ?? "",
  };
}

/**
 * Validates the required fields (Make, Model, Year, Fuel Type), same
 * rules as Car Onboarding.
 * @returns {Record<string, string>}
 */
function validate(form) {
  const errors = {};
  if (!form.make.trim()) errors.make = "Make is required.";
  if (!form.model.trim()) errors.model = "Model is required.";
  if (!form.fuel_type) errors.fuel_type = "Fuel type is required.";

  const currentYear = new Date().getFullYear();
  if (!form.year.trim()) {
    errors.year = "Year is required.";
  } else {
    const yearNumber = Number(form.year);
    if (!Number.isInteger(yearNumber) || yearNumber < 1900 || yearNumber > currentYear + 1) {
      errors.year = `Enter a valid year between 1900 and ${currentYear + 1}.`;
    }
  }

  if (form.fuel_efficiency.trim()) {
    const efficiencyNumber = Number(form.fuel_efficiency);
    if (!Number.isFinite(efficiencyNumber) || efficiencyNumber <= 0) {
      errors.fuel_efficiency = "Fuel efficiency must be a positive number.";
    }
  }

  if (form.cylinders.trim()) {
    const cylindersNumber = Number(form.cylinders);
    if (!Number.isInteger(cylindersNumber) || cylindersNumber <= 0) {
      errors.cylinders = "Cylinders must be a positive whole number.";
    }
  }

  if (form.fuel_tank_capacity_liters.trim()) {
    const capacityError = getTankCapacityError(form.fuel_tank_capacity_liters);
    if (capacityError) errors.fuel_tank_capacity_liters = capacityError;
  }

  // Length / range limits shared with the server (lib/limits.js); the checks
  // above (required, positive) keep their own messages when they already apply.
  const FIELD_NAME = { engineType: "engine_type", licensePlate: "license_plate", fuelEfficiency: "fuel_efficiency" };
  const sharedErrors = getCarFieldErrors({
    make: form.make,
    model: form.model,
    engineType: form.engine_type,
    drivetrain: form.drivetrain,
    transmission: form.transmission,
    licensePlate: form.license_plate,
    vin: form.vin,
    fuelEfficiency: form.fuel_efficiency,
    cylinders: form.cylinders,
  });
  for (const [field, message] of Object.entries(sharedErrors)) {
    const formField = FIELD_NAME[field] ?? field;
    if (!errors[formField]) errors[formField] = message;
  }

  return errors;
}

/**
 * Car Profile screen: shows the saved specs for the user's car, with an
 * Edit mode that updates any field. Shows an empty state (linking to Car
 * Onboarding) when the user has no car yet.
 * @returns {JSX.Element}
 */
function CarProfilePage() {
  const { carId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Guards against rendering before the auth session has resolved. In
    // practice ProtectedRoute already guarantees `user` is set before
    // this page mounts, but this keeps the component safe on its own.
    if (!user) return;

    let cancelled = false;

    async function loadCar() {
      setLoading(true);
      setNotFound(false);

      const query = carId
        ? supabase.from("cars").select("*").eq("id", carId).maybeSingle()
        : supabase
            .from("cars")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle();

      const { data, error } = await query;
      if (cancelled) return;

      if (error || !data) {
        setCar(null);
        setNotFound(true);
      } else {
        setCar(data);
      }
      setLoading(false);
    }

    loadCar();
    return () => {
      cancelled = true;
    };
  }, [carId, user]);

  function startEditing() {
    setForm(toFormValues(car));
    setFieldErrors({});
    setSaveError("");
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
  }

  /** Deletes the current car (CAR-38). The `trips_car_id_fkey` and
   * `advisor_conversations_car_id_fkey` foreign keys are CASCADE / SET
   * NULL respectively, so this car's trip history goes with it — the
   * confirmation copy below says so. */
  async function handleDelete() {
    setDeleteError("");
    setDeleting(true);
    try {
      const { error } = await supabase.from("cars").delete().eq("id", car.id);
      if (error) {
        setDeleteError(error.message);
        return;
      }
      navigate("/dashboard", { replace: true });
    } finally {
      setDeleting(false);
    }
  }

  /** @param {keyof typeof FIELD_LABELS} field */
  function handleChange(field) {
    return (event) => {
      setForm((previous) => ({ ...previous, [field]: event.target.value }));
    };
  }

  /** @param {import('react').FormEvent} event */
  async function handleSave(event) {
    event.preventDefault();
    setSaveError("");

    const errors = validate(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("cars")
        .update({
          make: form.make.trim(),
          model: form.model.trim(),
          year: Number(form.year),
          engine_type: form.engine_type.trim() || null,
          fuel_type: form.fuel_type,
          fuel_efficiency: form.fuel_efficiency.trim()
            ? Number(form.fuel_efficiency)
            : null,
          cylinders: form.cylinders.trim() ? Number(form.cylinders) : null,
          fuel_tank_capacity_liters: form.fuel_tank_capacity_liters.trim()
            ? Number(form.fuel_tank_capacity_liters)
            : null,
          drivetrain: form.drivetrain.trim() || null,
          transmission: form.transmission.trim() || null,
          license_plate: form.license_plate.trim() || null,
          vin: form.vin.trim() || null,
        })
        .eq("id", car.id)
        .select()
        .single();

      if (error) {
        setSaveError(describeSaveError(error));
        return;
      }

      setCar(data);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageShell title="Car Profile" description="Loading your car..." />;
  }

  if (notFound) {
    return (
      <PageShell
        title="Car Profile"
        description="You haven't added a car yet."
      >
        <Link className="btn-primary" to="/cars/new">
          Add Your Car
        </Link>
      </PageShell>
    );
  }

  if (isEditing) {
    return (
      <PageShell title="Edit Car" description={`${car.make} ${car.model}`}>
        <form onSubmit={handleSave} noValidate className="car-form">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="make">Make *</label>
              <input id="make" type="text" maxLength={LIMITS.MAKE_MODEL} value={form.make} onChange={handleChange("make")} />
              {fieldErrors.make && (
                <p role="alert" className="auth-form__error">{fieldErrors.make}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="model">Model *</label>
              <input id="model" type="text" maxLength={LIMITS.MAKE_MODEL} value={form.model} onChange={handleChange("model")} />
              {fieldErrors.model && (
                <p role="alert" className="auth-form__error">{fieldErrors.model}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="year">Year *</label>
              <input id="year" type="number" value={form.year} onChange={handleChange("year")} />
              {fieldErrors.year && (
                <p role="alert" className="auth-form__error">{fieldErrors.year}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="engine_type">Engine Type</label>
              <input
                id="engine_type"
                type="text" maxLength={LIMITS.ENGINE_TYPE}
                value={form.engine_type}
                onChange={handleChange("engine_type")}
              />
              {fieldErrors.engine_type && (
                <p role="alert" className="auth-form__error">
                  {fieldErrors.engine_type}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="fuel_type">Fuel Type *</label>
              <select
                id="fuel_type"
                value={form.fuel_type}
                onChange={handleChange("fuel_type")}
              >
                <option value="">Select a fuel type</option>
                {FUEL_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              {fieldErrors.fuel_type && (
                <p role="alert" className="auth-form__error">{fieldErrors.fuel_type}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="fuel_efficiency">Fuel Efficiency (km/L)</label>
              <input
                id="fuel_efficiency"
                type="number" max={LIMITS.MAX_FUEL_EFFICIENCY}
                step="0.1"
                value={form.fuel_efficiency}
                onChange={handleChange("fuel_efficiency")}
              />
              {fieldErrors.fuel_efficiency && (
                <p role="alert" className="auth-form__error">{fieldErrors.fuel_efficiency}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="cylinders">Cylinders</label>
              <input
                id="cylinders"
                type="number" max={LIMITS.MAX_CYLINDERS}
                value={form.cylinders}
                onChange={handleChange("cylinders")}
              />
              {fieldErrors.cylinders && (
                <p role="alert" className="auth-form__error">{fieldErrors.cylinders}</p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="fuel_tank_capacity_liters">Fuel Tank Capacity (L)</label>
              <input
                id="fuel_tank_capacity_liters"
                type="number"
                min="1"
                step="0.1"
                value={form.fuel_tank_capacity_liters}
                onChange={handleChange("fuel_tank_capacity_liters")}
              />
              {fieldErrors.fuel_tank_capacity_liters && (
                <p role="alert" className="auth-form__error">
                  {fieldErrors.fuel_tank_capacity_liters}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="drivetrain">Drivetrain</label>
              <input
                id="drivetrain"
                type="text" maxLength={LIMITS.DRIVETRAIN}
                value={form.drivetrain}
                onChange={handleChange("drivetrain")}
              />
              {fieldErrors.drivetrain && (
                <p role="alert" className="auth-form__error">
                  {fieldErrors.drivetrain}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="transmission">Transmission</label>
              <input
                id="transmission"
                type="text" maxLength={LIMITS.TRANSMISSION}
                value={form.transmission}
                onChange={handleChange("transmission")}
              />
              {fieldErrors.transmission && (
                <p role="alert" className="auth-form__error">
                  {fieldErrors.transmission}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="license_plate">License Plate</label>
              <input
                id="license_plate"
                type="text" maxLength={LIMITS.LICENSE_PLATE}
                value={form.license_plate}
                onChange={handleChange("license_plate")}
              />
              {fieldErrors.license_plate && (
                <p role="alert" className="auth-form__error">
                  {fieldErrors.license_plate}
                </p>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="vin">VIN</label>
              <input id="vin" type="text" maxLength={LIMITS.VIN} value={form.vin} onChange={handleChange("vin")} />
              {fieldErrors.vin && (
                <p role="alert" className="auth-form__error">
                  {fieldErrors.vin}
                </p>
              )}
            </div>
          </div>

          {saveError && (
            <p role="alert" className="auth-form__error">{saveError}</p>
          )}

          <div className="car-profile__actions">
            <button className="btn-primary" type="submit" disabled={saving}>
              Save
            </button>
            <button type="button" onClick={cancelEditing} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </PageShell>
    );
  }

  const headerMeta = [car.year, car.fuel_type].filter(Boolean).join(" · ");

  return (
    <div className="profile-page">
      <div className="profile-header">
        <span className="profile-header__icon" aria-hidden="true">
          🚗
        </span>
        <div className="profile-header__info">
          <h1 className="profile-header__title">
            {car.make} {car.model}
          </h1>
          {headerMeta && <p className="profile-header__meta">{headerMeta}</p>}
        </div>
        <button className="btn-primary" type="button" onClick={startEditing}>
          Edit
        </button>
      </div>

      <div className="profile-specs-card">
        <h2 className="profile-specs-card__title">Vehicle Specifications</h2>
        <dl className="car-profile__fields">
          {Object.entries(FIELD_LABELS).map(([field, label]) => (
            <div key={field} className="car-profile__field">
              <span className="car-profile__field-icon" aria-hidden="true">
                {FIELD_ICONS[field]}
              </span>
              <div>
                <dt>{label}</dt>
                <dd>
                  {car[field] == null || car[field] === "" ? "—" : car[field]}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>

      {confirmingDelete ? (
        <div className="profile-delete-confirm">
          <p role="alert">
            Delete this car? Its trip history will be deleted too, and this
            can't be undone.
          </p>
          {deleteError && (
            <p role="alert" className="auth-form__error">
              {deleteError}
            </p>
          )}
          <div className="car-profile__actions">
            <button
              className="btn-primary"
              type="button"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className="profile-delete-trigger"
          type="button"
          onClick={() => setConfirmingDelete(true)}
        >
          Delete Car
        </button>
      )}
    </div>
  );
}

export default CarProfilePage;
