// Dashboard / Home screen — the hub a user lands on after logging in:
// a summary of their saved car(s) (or a prompt to add one), plus quick
// links to the two core features.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

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
        <h2>Your Cars</h2>

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
          <>
            <ul className="dashboard-car-list">
              {cars.map((car) => (
                <li key={car.id}>
                  <Link to={`/cars/${car.id}`}>
                    {car.year} {car.make} {car.model}
                  </Link>
                </li>
              ))}
            </ul>
            <Link className="btn-accent" to="/cars/new">
              Add Another Car
            </Link>
          </>
        )}
      </section>

      <section className="dashboard-section">
        <h2>Quick Access</h2>
        <div className="dashboard-modules">
          <Link className="dashboard-module-card" to="/trip-planner">
            <h3>Trip Planner</h3>
            <p>Estimate fuel cost and travel time for a destination.</p>
          </Link>
          <Link className="dashboard-module-card" to="/advisor">
            <h3>AI Advisor</h3>
            <p>Describe a car issue and get DIY-vs-mechanic guidance.</p>
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export default DashboardPage;
