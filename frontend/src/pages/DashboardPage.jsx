// Dashboard / Home screen — the hub a user lands on after logging in:
// a summary of their saved car(s) (or a prompt to add one), plus quick
// links to the two core features. Layout matches
// docs/stitch_carsage_landing_page/carsage_dashboard_vehicle_hub for the
// in-scope parts (card style, "Add Another Car" placement, module
// cards); the reference's left sidebar nav, vehicle photo, and
// telemetry/maintenance widgets (odometer, system health, service
// booking) are all out of scope and intentionally omitted — this app
// uses a single top nav everywhere, and doesn't track live vehicle data.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

/** Builds the "Engine Type • Fuel Type • Plate" meta line, skipping any fields the car doesn't have set. */
function carMetaLine(car) {
  return [car.engine_type, car.fuel_type, car.license_plate]
    .filter(Boolean)
    .join(" • ");
}

/**
 * Dashboard / Home screen. Fetches the logged-in user's cars (RLS scopes
 * this to their own rows) and shows either a summary of each or an empty
 * state, plus module cards for Trip Planner and AI Advisor.
 * @returns {JSX.Element}
 */
function DashboardPage() {
  const { user } = useAuth();
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadCars() {
      setLoading(true);
      const { data, error } = await supabase
        .from("cars")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      setCars(error || !data ? [] : data);
      setLoading(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <PageShell
      title="Dashboard"
      description="Your cars and quick access to Trip Planner and AI Advisor."
    >
      <section className="dashboard-section">
        <div className="dashboard-section__header">
          <h2>Your Cars</h2>
          {!loading && cars.length > 0 && (
            <Link className="dashboard-add-car" to="/cars/new">
              <span aria-hidden="true">+</span> Add Another Car
            </Link>
          )}
        </div>

        {loading ? (
          <p>Loading your cars...</p>
        ) : cars.length === 0 ? (
          <>
            <p>You haven&apos;t added a car yet.</p>
            <Link className="btn-primary" to="/cars/new">
              Add Your Car
            </Link>
          </>
        ) : (
          <ul className="dashboard-car-list">
            {cars.map((car) => {
              const meta = carMetaLine(car);
              return (
                <li key={car.id} className="dashboard-car-card">
                  <Link
                    to={`/cars/${car.id}`}
                    className="dashboard-car-card__title"
                  >
                    {car.year} {car.make} {car.model}
                  </Link>
                  {meta && (
                    <p className="dashboard-car-card__meta">{meta}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dashboard-section">
        <h2>Quick Access</h2>
        <div className="dashboard-modules">
          <Link className="dashboard-module-card" to="/trip-planner">
            <span className="dashboard-module-card__icon" aria-hidden="true">
              🧭
            </span>
            <h3>Trip Planner</h3>
            <p>Estimate fuel cost and travel time for a destination.</p>
            <span className="dashboard-module-card__cta">
              Plan a trip <span aria-hidden="true">→</span>
            </span>
          </Link>
          <Link className="dashboard-module-card" to="/advisor">
            <span className="dashboard-module-card__icon" aria-hidden="true">
              💬
            </span>
            <h3>AI Advisor</h3>
            <p>Describe a car issue and get DIY-vs-mechanic guidance.</p>
            <span className="dashboard-module-card__cta">
              Ask advisor <span aria-hidden="true">→</span>
            </span>
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export default DashboardPage;
