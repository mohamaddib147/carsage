// Dashboard / Home screen — the hub a user lands on after logging in:
// a summary of their saved car(s) (or a prompt to add one), plus quick
// links to the two core features and the Fuel Log (CAR-53). Layout matches
// docs/stitch_carsage_landing_page/carsage_dashboard_vehicle_hub for the
// in-scope parts (card style, "Add Another Car" placement, module
// cards); the reference's left sidebar nav, vehicle photo, and
// telemetry/maintenance widgets (odometer, system health, service
// booking) are all out of scope and intentionally omitted — this app
// uses a single top nav everywhere, and doesn't track live vehicle data.
// Each car card also summarises the specs saved on the car (efficiency,
// cylinders, drivetrain, transmission, tank size) from the row the page
// already fetches, so the cards aren't just a name and a meta line.
// CAR-62: a Maintenance card lists every item that is Overdue or Due soon across all
// the user's cars (each linking to that item on the Maintenance page), says how many
// need an odometer reading, and has friendly "nothing tracked" / "all caught up" states.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { diyFixRate, latestFixedMessage, timeAgo } from "../lib/diySuccess.js";
import {
  dashboardMaintenance,
  describeRemaining,
  itemAnchorId,
  STATUS_LABELS,
  todayInBeirut,
} from "../lib/maintenance.js";
import { supabase } from "../lib/supabaseClient.js";
import BrandBadge from "../theme/BrandBadge.jsx";

// CAR-62: the Maintenance card reads every item (with its history) and every fill-up
// reading of the user, then works out each item's status per car, with that car's
// own latest reading only (lib/maintenance.js has the thresholds).
const DASHBOARD_ITEM_COLUMNS =
  "id, car_id, name, interval_km, interval_months, baseline_date, baseline_km, created_at, " +
  "maintenance_records(id, done_on, odometer_km, created_at)";
const MAX_DUE_SHOWN = 5;


/** Builds the "Engine Type • Fuel Type • Plate" meta line, skipping any fields the car doesn't have set. */
function carMetaLine(car) {
  return [car.engine_type, car.fuel_type, car.license_plate]
    .filter(Boolean)
    .join(" • ");
}

/**
 * The specs saved on a car, as label/value pairs for its summary grid. Only
 * fields that are actually set are returned, so a card never shows blanks.
 * @param {object} car - a `cars` row.
 * @returns {{ label: string, value: string }[]}
 */
function carSpecs(car) {
  const specs = [];
  if (car.fuel_efficiency != null) {
    specs.push({ label: "Efficiency", value: `${Number(car.fuel_efficiency)} km/L` });
  }
  if (car.cylinders != null) {
    specs.push({ label: "Cylinders", value: String(car.cylinders) });
  }
  if (car.drivetrain) specs.push({ label: "Drivetrain", value: car.drivetrain });
  if (car.transmission) specs.push({ label: "Transmission", value: car.transmission });
  if (car.fuel_tank_capacity_liters != null) {
    specs.push({ label: "Fuel tank", value: `${Number(car.fuel_tank_capacity_liters)} L` });
  }
  return specs;
}

/**
 * Dashboard / Home screen. Fetches the logged-in user's cars (RLS scopes
 * this to their own rows) and shows either a summary of each or an empty
 * state, plus module cards for Trip Planner, AI Advisor and Fuel Log.
 * @returns {JSX.Element}
 */
function DashboardPage() {
  const { user } = useAuth();
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  // fixRate: null while loading OR once loaded, null means "no feedback given
  // anywhere yet" (the empty state) rather than a real 0%.
  const [diyStats, setDiyStats] = useState({ loading: true, fixRate: null, latestFix: null });
  // CAR-62: null while loading; { due, needsReading, total } once loaded.
  const [maintenance, setMaintenance] = useState(null);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;

    async function loadMaintenance() {
      const [itemsReply, readingsReply] = await Promise.all([
        supabase.from("maintenance_items").select(DASHBOARD_ITEM_COLUMNS).eq("user_id", user.id),
        supabase.from("fuel_logs").select("id, car_id, filled_at, created_at, liters, odometer_km").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      if (itemsReply.error || !itemsReply.data) {
        setMaintenance({ due: [], needsReading: 0, total: 0, failed: true });
        return;
      }
      setMaintenance(
        dashboardMaintenance(itemsReply.data, readingsReply.error ? [] : (readingsReply.data ?? []), todayInBeirut()),
      );
    }

    loadMaintenance();
    return () => {
      cancelled = true;
    };
  }, [user]);

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

  // DIY fix-rate stat (mentor feedback, no Jira task): every 'ai' DIY reply the
  // user has given feedback on (RLS already scopes this to their own rows), plus
  // — only when at least one is marked fixed — the issue description from that
  // conversation's preceding user message, for the "Latest fix" highlight.
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadDiyStats() {
      setDiyStats((previous) => ({ ...previous, loading: true }));
      const { data, error } = await supabase
        .from("advisor_messages")
        .select("conversation_id, marked_fixed, created_at")
        .eq("sender", "ai")
        .eq("recommendation", "diy");

      if (cancelled) return;
      if (error || !data) {
        setDiyStats({ loading: false, fixRate: null, latestFix: null });
        return;
      }

      const fixRate = diyFixRate(data);
      const latest = latestFixedMessage(data);
      if (!latest) {
        setDiyStats({ loading: false, fixRate, latestFix: null });
        return;
      }

      const { data: issueRow } = await supabase
        .from("advisor_messages")
        .select("message_text")
        .eq("conversation_id", latest.conversation_id)
        .eq("sender", "user")
        .lte("created_at", latest.created_at)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      setDiyStats({
        loading: false,
        fixRate,
        latestFix: {
          issue: issueRow?.message_text || "A DIY suggestion",
          timeAgo: timeAgo(latest.created_at),
        },
      });
    }

    loadDiyStats();
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
          <>
            <p role="status" className="sr-only">Loading your cars...</p>
            <ul className="dashboard-car-list" aria-hidden="true">
              {[0, 1].map((index) => (
                <li key={index} className="dashboard-car-card dashboard-car-card--skeleton">
                  <div className="skeleton-bar skeleton-bar--title" />
                  <div className="skeleton-bar skeleton-bar--meta" />
                  <div className="skeleton-bar skeleton-bar--specs" />
                </li>
              ))}
            </ul>
          </>
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
              const specs = carSpecs(car);
              return (
                <li key={car.id} className="dashboard-car-card">
                  <Link
                    to={`/cars/${car.id}`}
                    className="dashboard-car-card__title"
                  >
                    <BrandBadge make={car.make} /> {car.year} {car.make} {car.model}
                  </Link>
                  {meta && (
                    <p className="dashboard-car-card__meta">{meta}</p>
                  )}
                  {specs.length > 0 ? (
                    <dl
                      className="dashboard-car-card__specs"
                      aria-label={`${car.make} ${car.model} specifications`}
                    >
                      {specs.map((spec) => (
                        <div key={spec.label} className="dashboard-car-card__spec">
                          <dt>{spec.label}</dt>
                          <dd>{spec.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="dashboard-car-card__hint">
                      Add efficiency, cylinders and more on the{" "}
                      <Link to={`/cars/${car.id}`}>car profile</Link> to see them here.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dashboard-section" aria-label="Maintenance due">
        <h2>Maintenance</h2>
        {maintenance === null ? (
          <>
            <p role="status" className="sr-only">Loading maintenance...</p>
            <div className="dashboard-stat-tile dashboard-stat-tile--skeleton" aria-hidden="true">
              <div className="skeleton-bar skeleton-bar--stat-label" />
              <div className="skeleton-bar skeleton-bar--stat-label" />
            </div>
          </>
        ) : maintenance.failed ? (
          <p className="dashboard-diy-empty">
            Couldn&apos;t load your maintenance right now. See <Link to="/maintenance">Maintenance</Link>.
          </p>
        ) : maintenance.total === 0 ? (
          <p className="dashboard-diy-empty">
            Nothing tracked yet. Set up reminders for oil changes, the mécanique and more in{" "}
            <Link to="/maintenance">Maintenance</Link>.
          </p>
        ) : (
          <div className="dashboard-maintenance">
            {maintenance.due.length === 0 ? (
              <p className="dashboard-maintenance__clear">All caught up: nothing is overdue or due soon.</p>
            ) : (
              <ul className="dashboard-maintenance__list">
                {maintenance.due.slice(0, MAX_DUE_SHOWN).map(({ item, status }) => {
                  const car = cars.find((candidate) => candidate.id === item.car_id);
                  return (
                    <li key={item.id}>
                      <Link
                        className="dashboard-maintenance__item"
                        to={`/maintenance?car=${encodeURIComponent(item.car_id)}#${itemAnchorId(item.id)}`}
                      >
                        <span className={`maintenance-badge maintenance-badge--${status.status}`}>
                          {STATUS_LABELS[status.status]}
                        </span>
                        <span className="dashboard-maintenance__name">{item.name}</span>
                        {car && (
                          <span className="dashboard-maintenance__car">
                            {[car.year, car.make, car.model].filter(Boolean).join(" ")}
                          </span>
                        )}
                        <span className="dashboard-maintenance__when">{describeRemaining(status)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {maintenance.due.length > MAX_DUE_SHOWN && (
              <p className="dashboard-maintenance__more">
                And {maintenance.due.length - MAX_DUE_SHOWN} more in <Link to="/maintenance">Maintenance</Link>.
              </p>
            )}
            {maintenance.needsReading > 0 && (
              <p className="dashboard-maintenance__more">
                {maintenance.needsReading} {maintenance.needsReading === 1 ? "item needs" : "items need"} an odometer
                reading (add one with your next fill-up in the <Link to="/fuel-log">Fuel Log</Link>).
              </p>
            )}
            <Link className="dashboard-maintenance__all" to="/maintenance">
              See all maintenance <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </section>

      <section className="dashboard-section" aria-label="DIY suggestion success rate">
        <h2>DIY Success</h2>
        {diyStats.loading ? (
          <>
            <p role="status" className="sr-only">Loading...</p>
            <div className="dashboard-stat-tile dashboard-stat-tile--skeleton" aria-hidden="true">
              <div className="skeleton-bar skeleton-bar--stat-value" />
              <div className="skeleton-bar skeleton-bar--stat-label" />
            </div>
          </>
        ) : diyStats.fixRate === null ? (
          <p className="dashboard-diy-empty">
            No feedback yet. After trying a DIY suggestion in the{" "}
            <Link to="/advisor">AI Advisor</Link>, say whether it fixed the issue
            to start tracking your fix rate here.
          </p>
        ) : (
          <div className="dashboard-diy-stats">
            <div className="dashboard-stat-tile">
              <p className="dashboard-stat-tile__value">{diyStats.fixRate}%</p>
              <p className="dashboard-stat-tile__label">
                of your DIY suggestions with feedback fixed the issue
              </p>
            </div>
            {diyStats.latestFix && (
              <div className="dashboard-latest-fix">
                <p className="dashboard-latest-fix__label">Latest fix</p>
                <p className="dashboard-latest-fix__issue">{diyStats.latestFix.issue}</p>
                <p className="dashboard-latest-fix__time">{diyStats.latestFix.timeAgo}</p>
              </div>
            )}
          </div>
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
          <Link className="dashboard-module-card" to="/fuel-log">
            <span className="dashboard-module-card__icon" aria-hidden="true">
              ⛽
            </span>
            <h3>Fuel Log</h3>
            <p>Log each fill-up and see what you pay per liter.</p>
            <span className="dashboard-module-card__cta">
              Log a fill-up <span aria-hidden="true">→</span>
            </span>
          </Link>
        </div>
      </section>
    </PageShell>
  );
}

export default DashboardPage;
