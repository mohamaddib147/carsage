// Car Onboarding screen — manual add-a-car form. The "scan registration
// card" button is a disabled placeholder for MVP (OCR is a stretch goal).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

const CURRENT_YEAR = new Date().getFullYear();

const FUEL_TYPE_OPTIONS = [
  "Gasoline",
  "Diesel",
  "Hybrid",
  "Electric",
  "Other",
];

const EMPTY_FORM = {
  make: "",
  model: "",
  year: "",
  engineType: "",
  fuelType: "",
  licensePlate: "",
  vin: "",
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

  /** @param {keyof typeof EMPTY_FORM} field */
  function handleChange(field) {
    return (event) => {
      setForm((previous) => ({ ...previous, [field]: event.target.value }));
    };
  }

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
      <button className="btn-accent" type="button" disabled>
        Scan Registration Card (coming soon)
      </button>

      <form onSubmit={handleSubmit} noValidate className="car-form">
        <div className="form-field">
          <label htmlFor="make">Make *</label>
          <input
            id="make"
            name="make"
            type="text"
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
            value={form.licensePlate}
            onChange={handleChange("licensePlate")}
          />
        </div>

        <div className="form-field">
          <label htmlFor="vin">VIN</label>
          <input
            id="vin"
            name="vin"
            type="text"
            value={form.vin}
            onChange={handleChange("vin")}
          />
        </div>

        {submitError && (
          <p role="alert" className="auth-form__error">
            {submitError}
          </p>
        )}

        <button className="btn-primary" type="submit" disabled={submitting}>
          Add Car
        </button>
      </form>
    </PageShell>
  );
}

export default CarOnboardingPage;
