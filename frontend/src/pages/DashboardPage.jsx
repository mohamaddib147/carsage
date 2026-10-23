// Dashboard / Home screen — the hub a user lands on after logging in (CAR-79, Dashboard v2, docs/DESIGN_PASS_2.md §3.4).
// One hero card for the ACTIVE car (CAR-70's useActiveCar) in its brand theme: a brand badge, the name, a "Default car"
// badge (profiles.default_car_id), a one-line spec summary, and four tiles from the data the page already loads —
// odometer, real fuel economy, last fill-up and next service (lib/carSnapshot.js, lib/odometer.js). Quick actions link
// to the existing screens. With two or more cars the others are a row of switcher chips (never full cards, so the page
// no longer grows ~150 px per car); choosing one changes the active car and the brand theme. Below the hero are three
// equal cards: this month's cost across all cars, maintenance due, and DIY success.
//
// CAR-78 data layer: ONE fuel_logs read (the union of the columns the tiles, the month total and the maintenance
// readings need) plus car_expenses, maintenance_items and the DIY advisor_messages. CAR-79 adds one profiles read for
// the Default car badge (6 requests). No new tables, columns, policies or backend; every read is scoped to the user.
// The three fuel tiles come from the one fuel read, so a single error line with one Try again covers them; next
// service, the month tile, maintenance and DIY each report their own failure, and the rest of the page keeps working.
//
// Numbers are plain text (a fade at most, CAR-75); money goes through <Price>. Each tile and card has a skeleton, empty
// and error state, and the blocks reserve their height so nothing moves when the data lands (CLS measured on Slow 4G).
// Switcher chips carry a small dot in the make's brand accent colour, so cars of different makes are told apart at a
// glance (the logo alone is a bare badge, or missing for a make with none); a make with no theme gets the default gold.
//
// DIY success also shows its sample size, "(3 of 5)", from the same rows and rule as the percentage (lib/diySuccess.js).
//
// Quick actions: while the active car has no odometer reading, "Log a fill-up" is the one filled accent button and the
// other three are outlines, since a reading is the next useful thing to add; with a reading all four are equal.
//
// The optional car photo is intentionally NOT shown here — it stays behind the photo-code boundary; the hero uses the
// brand badge, as the mobile reference does.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import Price from "../components/Price.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useActiveCar } from "../theme/ActiveCarContext.jsx";
import { carSnapshot } from "../lib/carSnapshot.js";
import { heroSpecParts } from "../lib/carFormat.js";
import { formatMonth, monthlySummary, monthOf } from "../lib/costs.js";
import { diyFixCounts, diyFixRate, latestFixedMessage, timeAgo } from "../lib/diySuccess.js";
import { formatFillDate, formatLiters } from "../lib/fuelLog.js";
import {
  dashboardMaintenance,
  describeRemaining,
  itemAnchorId,
  STATUS_LABELS,
  todayInBeirut,
} from "../lib/maintenance.js";
import { formatKm, formatKmPerLiter, realEfficiency } from "../lib/odometer.js";
import { supabase } from "../lib/supabaseClient.js";
import BrandBadge from "../theme/BrandBadge.jsx";
import { getBrandTheme } from "../theme/carBrandThemes.js";
import { ArrowRight } from "../components/icons.jsx";
import { CalendarDays, Car, CircleCheck, Fuel, Gauge, MessageCircle, ReceiptText, Route, Wrench } from "../components/iconsMore.jsx";

// CAR-62: the Maintenance card reads every item (with its history); the per-car latest reading comes from the one
// fuel_logs read (CAR-78). lib/maintenance.js has the thresholds.
const DASHBOARD_ITEM_COLUMNS =
  "id, car_id, name, interval_km, interval_months, baseline_date, baseline_km, created_at, " +
  "maintenance_records(id, done_on, odometer_km, created_at)";
const MAX_DUE_SHOWN = 5;
// CAR-78: the one fuel_logs read serves the tiles, the month's fuel cost and the maintenance readings.
const DASHBOARD_FUEL_COLUMNS = "id, car_id, filled_at, created_at, liters, odometer_km, cost_amount, cost_currency";

// The quick actions under the hero (CAR-79). Each links to an existing screen; targets are 44 px tall (see CSS).
const QUICK_ACTIONS = [
  { to: "/trip-planner", label: "Plan a trip", Icon: Route },
  { to: "/fuel-log", label: "Log a fill-up", Icon: Fuel },
  { to: "/advisor", label: "Ask the advisor", Icon: MessageCircle },
  { to: "/expenses", label: "Add expense", Icon: ReceiptText },
];

/**
 * One hero stat tile. Shows a skeleton while loading, a muted empty message (optionally with a link) when there is no
 * data, or the value with a small caption. Every state is the same height, so the tile never changes the hero's size.
 * With `emptyButton` the empty state's link is a small outline button under the message instead of an inline link (the
 * Next service tile's "Set up reminders"; kept quieter than the accent quick action).
 * @param {{ Icon: Function, label: string, state: "loading"|"empty"|"ok", value?: import('react').ReactNode,
 *   caption?: import('react').ReactNode, emptyText?: string, emptyTo?: string, emptyLinkText?: string,
 *   emptyButton?: boolean }} props
 */
function HeroTile({ Icon, label, state, value, caption, emptyText, emptyTo, emptyLinkText, emptyButton }) {
  return (
    <div className="dashboard-tile">
      <span className="dashboard-tile__icon" aria-hidden="true"><Icon size={20} /></span>
      <p className="dashboard-tile__label">{label}</p>
      {state === "loading" ? (
        <div className="dashboard-tile__loading" aria-hidden="true">
          <span className="skeleton-bar skeleton-bar--tile-value" />
          <span className="skeleton-bar skeleton-bar--tile-caption" />
        </div>
      ) : state === "empty" ? (
        <>
          <p className="dashboard-tile__empty">
            {emptyText}
            {emptyTo && !emptyButton && (
              <>
                {" "}
                <Link to={emptyTo}>{emptyLinkText}</Link>
              </>
            )}
          </p>
          {emptyTo && emptyButton && (
            <Link className="btn-secondary btn-secondary--sm dashboard-tile__button" to={emptyTo}>{emptyLinkText}</Link>
          )}
        </>
      ) : (
        <>
          <p className="dashboard-tile__value">{value}</p>
          {caption != null && <p className="dashboard-tile__caption">{caption}</p>}
        </>
      )}
    </div>
  );
}

/**
 * The four tiles plus the shared fuel error. The three fuel tiles (odometer, economy, last fill-up) come from the one
 * fuel read, so a single error with one Try again replaces them; next service has its own error.
 */
function HeroTiles({ fuelState, odometer, economy, lastFillUp, serviceState, nextService, onRetryFuel, fuelRetrying }) {
  const fuelLoading = fuelState === "loading";
  const fuelOk = fuelState === "ok";
  return (
    <div className="dashboard-tiles">
      {(fuelLoading || serviceState === "loading") && <p role="status" className="sr-only">Loading each car&apos;s details...</p>}
      {fuelState === "error" ? (
        <div className="dashboard-tiles__fuel-error" role="alert">
          <p className="dashboard-tile__error-text">Couldn&apos;t load your fill-ups, so these figures are missing.</p>
          <button className="btn-secondary btn-secondary--sm" type="button" disabled={fuelRetrying} onClick={onRetryFuel}>
            {fuelRetrying ? "Trying again..." : "Try again"}
          </button>
        </div>
      ) : (
        <>
          <HeroTile
            Icon={Gauge}
            label="Odometer"
            state={fuelLoading ? "loading" : fuelOk && odometer ? "ok" : "empty"}
            value={odometer && formatKm(odometer.km)}
            caption={odometer && `as of ${formatFillDate(odometer.filledAt)}`}
            emptyText="No odometer reading yet. Add it when you log a fill-up."
            emptyTo="/fuel-log"
            emptyLinkText="Fuel Log"
          />
          <HeroTile
            Icon={Fuel}
            label="Fuel economy"
            state={fuelLoading ? "loading" : fuelOk && economy ? "ok" : "empty"}
            value={economy && `${formatKmPerLiter(economy.kmPerLiter)} km/L`}
            caption={economy && `${economy.intervalCount} ${economy.intervalCount === 1 ? "fill-up" : "fill-ups"}`}
            emptyText="Log two fill-ups with odometer readings to see this."
            emptyTo="/fuel-log"
            emptyLinkText="Fuel Log"
          />
          <HeroTile
            Icon={CalendarDays}
            label="Last fill-up"
            state={fuelLoading ? "loading" : fuelOk && lastFillUp ? "ok" : "empty"}
            value={lastFillUp && formatFillDate(lastFillUp.filledAt)}
            caption={
              lastFillUp && (
                <>
                  {lastFillUp.liters != null && `${formatLiters(lastFillUp.liters)} L`}
                  {lastFillUp.liters != null && lastFillUp.costAmount != null && lastFillUp.costCurrency && ", "}
                  {lastFillUp.costAmount != null && lastFillUp.costCurrency && (
                    <Price amount={lastFillUp.costAmount} currency={lastFillUp.costCurrency} />
                  )}
                </>
              )
            }
            emptyText="No fill-ups logged yet."
            emptyTo="/fuel-log"
            emptyLinkText="Log a fill-up"
          />
        </>
      )}
      {serviceState === "error" ? (
        <div className="dashboard-tiles__service-error" role="alert">
          <p className="dashboard-tile__error-text">Couldn&apos;t load your maintenance.</p>
          <Link className="dashboard-tile__error-link" to="/maintenance">Maintenance</Link>
        </div>
      ) : (
        <HeroTile
          Icon={Wrench}
          label="Next service"
          state={serviceState === "loading" ? "loading" : nextService ? "ok" : "empty"}
          value={nextService && nextService.item.name}
          caption={nextService && (describeRemaining(nextService.status) || STATUS_LABELS[nextService.status.status])}
          emptyText="No service reminders yet."
          emptyTo="/maintenance"
          emptyLinkText="Set up reminders"
          emptyButton
        />
      )}
    </div>
  );
}

/**
 * The hero card for the active car (CAR-79). The car row is available as soon as the car list loads, so the badge,
 * name, specs line and actions render immediately; the tiles and the Default badge fill in when their data settles.
 * Once the fill-ups have loaded and the car has no odometer reading, "Log a fill-up" becomes the accent call to action
 * and the other quick actions outlines; while loading, on an error, or with a reading, all four are equal.
 */
function CarHero({ car, isDefault, tiles }) {
  const specs = heroSpecParts(car);
  const needsOdometer = tiles.fuelState === "ok" && !tiles.odometer;
  const actionClass = (to) =>
    needsOdometer ? `dashboard-action dashboard-action--${to === "/fuel-log" ? "cta" : "outline"}` : "dashboard-action";
  return (
    <section className="dashboard-hero" aria-label={`${car.year} ${car.make} ${car.model}`}>
      <div className="dashboard-hero__head">
        <span className="dashboard-hero__badge" aria-hidden="true">
          <BrandBadge make={car.make} size={32} />
        </span>
        <div className="dashboard-hero__title-block">
          <h2 className="dashboard-hero__title">
            <Link to={`/cars/${car.id}`} className="dashboard-hero__name">
              {car.year} {car.make} {car.model}
            </Link>
            {isDefault && (
              <span className="dashboard-hero__default">
                <CircleCheck size={14} /> Default car
              </span>
            )}
          </h2>
          {specs.length > 0 && <p className="dashboard-hero__specs">{specs.join(" · ")}</p>}
        </div>
      </div>

      <HeroTiles {...tiles} />

      <div className="dashboard-hero__actions">
        {QUICK_ACTIONS.map(({ to, label, Icon }) => (
          <Link key={to} className={actionClass(to)} to={to}>
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </div>
    </section>
  );
}

/**
 * The car switcher (shown with 2 or more cars): a chip per car, the active one pressed, each with a dot in its make's
 * brand accent colour. Choosing one makes it the active car (and the brand theme follows). Buttons with aria-pressed, operable by keyboard; they scroll sideways at
 * phone width (see CSS).
 */
function CarSwitcher({ cars, activeCarId, onSelect }) {
  if (cars.length < 2) return null;
  return (
    <nav className="dashboard-switcher" aria-label="Your cars">
      <ul className="dashboard-switcher__list">
        {cars.map((car) => {
          const active = car.id === activeCarId;
          return (
            <li key={car.id}>
              <button
                type="button"
                className="dashboard-chip"
                aria-pressed={active}
                onClick={() => onSelect(car)}
              >
                <BrandBadge make={car.make} size={18} />
                <span className="dashboard-chip__dot" aria-hidden="true" style={{ "--chip-dot": getBrandTheme(car.make)["--color-accent"] }} />
                <span className="dashboard-chip__name">{car.make} {car.model}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Link className="dashboard-add-car" to="/cars/new">
        <span aria-hidden="true">+</span> Add another car
      </Link>
    </nav>
  );
}

/**
 * Dashboard / Home screen (CAR-79). Loads the user's cars, their fill-ups, expenses, maintenance items, DIY feedback
 * and default-car id (all RLS-scoped), and shows the active car's hero with switcher chips and three summary cards.
 * @returns {JSX.Element}
 */
function DashboardPage() {
  const { user } = useAuth();
  const { activeCarId, setActiveCarId, selectInitialCar } = useActiveCar();

  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);

  // CAR-79: profiles.default_car_id, for the "Default car" badge. null while loading; { id } or { failed: true } once
  // loaded (a failure just hides the badge — it is not worth an error state of its own).
  const [defaultCar, setDefaultCar] = useState(null);

  const [diyStats, setDiyStats] = useState({ loading: true, fixRate: null, counts: null, latestFix: null });
  // CAR-78: the one fuel_logs read. { status: "loading"|"ok"|"failed", rows }. Retried on its own.
  const [fuel, setFuel] = useState({ status: "loading", rows: null });
  const [fuelAttempt, setFuelAttempt] = useState(0);
  const [fuelRetrying, setFuelRetrying] = useState(false);
  const [expenses, setExpenses] = useState(null); // { rows } | { failed: true } | null
  const [items, setItems] = useState(null); // { rows } | { failed: true } | null

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    async function loadCars() {
      setLoading(true);
      let result;
      try {
        result = await supabase.from("cars").select("*").eq("user_id", user.id).order("created_at", { ascending: true });
      } catch {
        result = { data: null, error: { message: "network error" } };
      }
      const { data, error } = result ?? {};
      if (cancelled) return;
      setCarsFailed(Boolean(error || !data));
      setCars(error || !data ? [] : data);
      setLoading(false);
    }
    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user, carsAttempt]);

  // Report the active car (or the first) once the list is in, so the brand theme matches the hero (CAR-70).
  useEffect(() => {
    if (cars.length > 0) selectInitialCar(cars);
  }, [cars, selectInitialCar]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    async function loadDefaultCar() {
      const reply = await supabase.from("profiles").select("default_car_id").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      setDefaultCar(reply.error ? { failed: true } : { id: reply.data?.default_car_id ?? null });
    }
    loadDefaultCar();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    async function loadFuelLogs() {
      let reply;
      try {
        reply = await supabase.from("fuel_logs").select(DASHBOARD_FUEL_COLUMNS).eq("user_id", user.id);
      } catch {
        reply = { data: null, error: { message: "network error" } };
      }
      if (cancelled) return;
      setFuelRetrying(false);
      setFuel(reply?.error || !reply?.data ? { status: "failed", rows: null } : { status: "ok", rows: reply.data });
    }
    loadFuelLogs();
    return () => {
      cancelled = true;
    };
  }, [user, fuelAttempt]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    async function loadExpenses() {
      const reply = await supabase.from("car_expenses").select("id, car_id, spent_on, category, amount, currency").eq("user_id", user.id);
      if (cancelled) return;
      setExpenses(reply.error || !reply.data ? { failed: true } : { rows: reply.data });
    }
    loadExpenses();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    async function loadMaintenanceItems() {
      const reply = await supabase.from("maintenance_items").select(DASHBOARD_ITEM_COLUMNS).eq("user_id", user.id);
      if (cancelled) return;
      setItems(reply.error || !reply.data ? { failed: true } : { rows: reply.data });
    }
    loadMaintenanceItems();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
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
        setDiyStats({ loading: false, fixRate: null, counts: null, latestFix: null });
        return;
      }
      const fixRate = diyFixRate(data);
      const counts = diyFixCounts(data); // the same rows and rule as the rate, shown as "(3 of 5)"
      const latest = latestFixedMessage(data);
      if (!latest) {
        setDiyStats({ loading: false, fixRate, counts, latestFix: null });
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
        counts,
        latestFix: { issue: issueRow?.message_text || "A DIY suggestion", timeAgo: timeAgo(latest.created_at) },
      });
    }
    loadDiyStats();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const today = todayInBeirut();
  const fuelSettled = fuel.status !== "loading";
  const fuelRows = fuel.status === "ok" ? fuel.rows : null;

  // The active car is the one the brand theme follows (CAR-70); fall back to the first until it is reported.
  const activeCar = cars.find((car) => car.id === activeCarId) ?? cars[0] ?? null;

  // The hero tiles for the active car. The three fuel tiles share the fuel request's state; next service has its own.
  const fuelState = !fuelSettled ? "loading" : fuelRows ? "ok" : "error";
  const activeFuel = fuelRows && activeCar ? fuelRows.filter((row) => row.car_id === activeCar.id) : null;
  const heroSnapshot =
    activeCar && fuelRows ? carSnapshot(activeCar, { fuelLogs: fuelRows, maintenanceItems: [], today }) : null;
  const economy = activeFuel ? realEfficiency(activeFuel) : null; // the raw real average (no rated fallback in this tile)
  const serviceState = items === null ? "loading" : items.failed ? "error" : "ok";
  const nextService =
    activeCar && items && !items.failed
      ? carSnapshot(activeCar, { fuelLogs: fuelRows ?? [], maintenanceItems: items.rows, today }).nextService
      : null;

  const heroTiles = {
    fuelState,
    odometer: heroSnapshot?.odometer ?? null,
    economy,
    lastFillUp: heroSnapshot?.lastFillUp ?? null,
    serviceState,
    nextService,
    onRetryFuel: () => {
      setFuelRetrying(true);
      setFuelAttempt((count) => count + 1);
    },
    fuelRetrying,
  };

  // CAR-64: this month's costs across all cars. Waits for the fill-ups (the total needs them).
  let monthCosts = null;
  if (expenses && fuelSettled) {
    const month = monthOf(today);
    if (expenses.failed) monthCosts = { failed: true, month };
    else if (!fuelRows) monthCosts = { fuelFailed: true, month };
    else monthCosts = { summary: monthlySummary(fuelRows, expenses.rows, month, "LBP"), month };
  }

  // CAR-62: maintenance due across all cars. Readings come from the one fuel read.
  let maintenance = null;
  if (items && fuelSettled) {
    maintenance = items.failed ? { due: [], needsReading: 0, total: 0, failed: true } : dashboardMaintenance(items.rows, fuelRows ?? [], today);
  }

  return (
    <PageShell title="Welcome back" description="Your car at a glance: odometer, fuel economy and next service.">
      <section className="dashboard-hero-section" aria-label="Your active car">
        {loading ? (
          <>
            <p role="status" className="sr-only">Loading your cars...</p>
            {/* Matches the loaded hero's shape (head, four tiles, four actions) so the layout does not move when the
                cars arrive. */}
            <div className="dashboard-hero dashboard-hero--skeleton" aria-hidden="true">
              <div className="dashboard-hero__head">
                <span className="dashboard-hero__badge"><span className="skeleton-bar skeleton-bar--avatar" /></span>
                <div className="dashboard-hero__title-block">
                  <span className="skeleton-bar skeleton-bar--w-40 skeleton-bar--h-lg" />
                  <span className="skeleton-bar skeleton-bar--w-70 skeleton-bar--h-sm" />
                </div>
              </div>
              <div className="dashboard-tiles">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="dashboard-tile">
                    <span className="skeleton-bar skeleton-bar--tile-value" />
                    <span className="skeleton-bar skeleton-bar--tile-caption" />
                  </div>
                ))}
              </div>
              <div className="dashboard-hero__actions">
                {[0, 1, 2, 3].map((index) => (
                  <span key={index} className="skeleton-bar skeleton-bar--action" />
                ))}
              </div>
            </div>
          </>
        ) : carsFailed ? (
          <div className="dashboard-hero dashboard-hero--message">
            <p role="alert" className="dashboard-error">Couldn&apos;t load your cars. Check your connection and try again.</p>
            <button className="btn-primary" type="button" onClick={() => setCarsAttempt((count) => count + 1)}>Try again</button>
          </div>
        ) : cars.length === 0 ? (
          <div className="dashboard-hero dashboard-hero--message">
            <span className="dashboard-hero__empty-icon" aria-hidden="true"><Car size={32} /></span>
            <h2 className="dashboard-hero__empty-title">Add your first car</h2>
            <p>Add a car to see its odometer, fuel economy and upcoming service here.</p>
            <Link className="btn-primary" to="/cars/new">Add your car</Link>
          </div>
        ) : (
          activeCar && (
            <>
              <CarHero car={activeCar} isDefault={defaultCar?.id === activeCar.id} tiles={heroTiles} />
              <CarSwitcher cars={cars} activeCarId={activeCar.id} onSelect={(car) => setActiveCarId(car.id, car.make)} />
            </>
          )
        )}
      </section>

      <div className="dashboard-lower">
        <section className="dashboard-section dashboard-lower__card" aria-label="All cars, this month" style={{ "--i": 0 }}>
          <h2>
            This month, all cars
            {monthCosts?.month && <span className="dashboard-costs__month"> ({formatMonth(monthCosts.month)})</span>}
          </h2>
          {monthCosts === null ? (
            <>
              <p role="status" className="sr-only">Loading this month&apos;s costs...</p>
              <div className="dashboard-stat-tile dashboard-stat-tile--skeleton dashboard-stat-tile--skeleton-tall" aria-hidden="true">
                <div className="skeleton-bar skeleton-bar--stat-value" />
                <div className="skeleton-bar skeleton-bar--stat-label" />
                <div className="skeleton-bar skeleton-bar--w-70 skeleton-bar--h-md" style={{ marginTop: "1rem" }} />
                <div className="skeleton-bar skeleton-bar--w-40 skeleton-bar--h-sm" style={{ marginTop: "0.75rem" }} />
              </div>
            </>
          ) : monthCosts.fuelFailed ? (
            <p className="dashboard-diy-empty">Shown once your fill-ups load. See <Link to="/expenses">Expenses</Link>.</p>
          ) : monthCosts.failed ? (
            <p className="dashboard-diy-empty">Couldn&apos;t load this month&apos;s costs right now. See <Link to="/expenses">Expenses</Link>.</p>
          ) : monthCosts.summary.total == null ? (
            <p className="dashboard-diy-empty">
              Nothing logged for {formatMonth(monthCosts.month)} yet. Log fill-ups in the{" "}
              <Link to="/fuel-log">Fuel Log</Link> and other costs in <Link to="/expenses">Expenses</Link>.
            </p>
          ) : (
            <div className="dashboard-stat-tile dashboard-costs">
              <p className="dashboard-stat-tile__value"><Price amount={monthCosts.summary.total} currency="LBP" /></p>
              <p className="dashboard-stat-tile__label">spent on all your cars this month</p>
              <dl className="dashboard-costs__split">
                <div>
                  <dt>Fuel</dt>
                  <dd>{monthCosts.summary.fuel == null ? "none logged" : <Price amount={monthCosts.summary.fuel} currency="LBP" />}</dd>
                </div>
                <div>
                  <dt>Other costs</dt>
                  <dd>{monthCosts.summary.other == null ? "none logged" : <Price amount={monthCosts.summary.other} currency="LBP" />}</dd>
                </div>
              </dl>
              <Link className="dashboard-maintenance__all" to="/expenses">See expenses <ArrowRight size={16} /></Link>
            </div>
          )}
        </section>

        <section className="dashboard-section dashboard-lower__card" aria-label="Maintenance due" style={{ "--i": 1 }}>
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
            <p className="dashboard-diy-empty">Couldn&apos;t load your maintenance right now. See <Link to="/maintenance">Maintenance</Link>.</p>
          ) : maintenance.total === 0 ? (
            <p className="dashboard-diy-empty">
              No service reminders yet. Set up reminders for oil changes, the yearly vehicle inspection and more in{" "}
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
                          <StatusBadge status={status.status} />
                          <span className="dashboard-maintenance__name">{item.name}</span>
                          {car && <span className="dashboard-maintenance__car">{[car.year, car.make, car.model].filter(Boolean).join(" ")}</span>}
                          <span className="dashboard-maintenance__when">{describeRemaining(status)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {maintenance.due.length > MAX_DUE_SHOWN && (
                <p className="dashboard-maintenance__more">And {maintenance.due.length - MAX_DUE_SHOWN} more in <Link to="/maintenance">Maintenance</Link>.</p>
              )}
              {maintenance.needsReading > 0 && (
                <p className="dashboard-maintenance__more">
                  {maintenance.needsReading} {maintenance.needsReading === 1 ? "item needs" : "items need"} an odometer reading (add one with your next fill-up in the <Link to="/fuel-log">Fuel Log</Link>).
                </p>
              )}
              <Link className="dashboard-maintenance__all" to="/maintenance">See all maintenance <ArrowRight size={16} /></Link>
            </div>
          )}
        </section>

        <section className="dashboard-section dashboard-lower__card" aria-label="DIY suggestion success rate" style={{ "--i": 2 }}>
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
              No feedback yet. After trying a DIY suggestion in the <Link to="/advisor">AI Advisor</Link>, say whether it fixed the issue to start tracking your fix rate here.
            </p>
          ) : (
            <div className="dashboard-diy-stats">
              <div className="dashboard-stat-tile">
                <p className="dashboard-stat-tile__value">{diyStats.fixRate}%</p>
                <p className="dashboard-stat-tile__label">({diyStats.counts.fixed} of {diyStats.counts.answered}) of your DIY suggestions with feedback fixed the issue</p>
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
      </div>
    </PageShell>
  );
}

export default DashboardPage;
