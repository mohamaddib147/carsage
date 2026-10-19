// Expenses screen (CAR-64, `/expenses`, in the header's "My Car" menu): a car's
// non-fuel costs (repair, maintenance, insurance, registration / mécanique, parking,
// car wash, tolls, fines, other) and its monthly cost of ownership, fuel included.
//
// Expenses are read and written straight to `car_expenses` through Supabase: row-level
// security scopes every row to its owner and an expense can only go on the caller's own
// car; the table's CHECK constraints (fixed category list, positive capped amount,
// USD/LBP, sane date, note length) are the server-side validation. Expenses are never
// edited (there is no UPDATE); a mistake is deleted, after a confirmation, and re-added.
// The one rule the database can't check, a date in the future (Beirut), is checked here.
// Nothing is created automatically from fill-ups or maintenance completions.
//
// The month summary and the chart combine this car's fill-up costs (fuel_logs) with
// its expenses, every amount converted through lib/currency.js's one rate (see
// lib/costs.js). Months come from the date text, "this month" from today's Beirut date.
// Every amount on screen goes through <Price>, so the header's USD | LBP switch changes
// them all. Loaded data is tagged with its car id, so cars never mix.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageShell from "../components/PageShell.jsx";
import Price from "../components/Price.jsx";
import { useAuth } from "../auth/AuthContext.jsx";
import { useCurrency } from "../currency/CurrencyContext.jsx";
import { CURRENCIES, formatMoney } from "../lib/currency.js";
import { supabase } from "../lib/supabaseClient.js";
import { describeActionError, describeSaveError, LIMITS } from "../lib/limits.js";
import { formatFillDate } from "../lib/fuelLog.js";
import { todayInBeirut } from "../lib/maintenance.js";
import {
  categoryLabel,
  EXPENSE_CATEGORIES,
  formatAxisMoney,
  formatMonth,
  getExpenseErrors,
  hasChartData,
  monthlyChartPoints,
  monthlySummary,
  monthOf,
  monthsEndingWith,
  sortExpenses,
} from "../lib/costs.js";
import { useActiveCar } from "../theme/ActiveCarContext.jsx";

const EXPENSE_COLUMNS = "id, spent_on, category, amount, currency, note, created_at";
const FUEL_COST_COLUMNS = "id, filled_at, cost_amount, cost_currency";

/** "2005 Mercedes-Benz C230" — the car as the user knows it. */
function carLabel(car) {
  return [car.year, car.make, car.model].filter(Boolean).join(" ");
}

/**
 * Loads one car's expenses and its fill-up costs.
 * @param {string} carId
 * @returns {Promise<{ carId: string, expenses: object[], fuelLogs: object[], error: string }>}
 */
async function fetchCarCosts(carId) {
  const [expensesReply, fuelReply] = await Promise.all([
    supabase.from("car_expenses").select(EXPENSE_COLUMNS).eq("car_id", carId).order("spent_on", { ascending: false }),
    supabase.from("fuel_logs").select(FUEL_COST_COLUMNS).eq("car_id", carId),
  ]);
  if (expensesReply.error) {
    return { carId, expenses: [], fuelLogs: [], error: describeActionError(expensesReply.error, "Could not load your expenses. Please try again.") };
  }
  return {
    carId,
    expenses: sortExpenses(expensesReply.data ?? []),
    // Fill-ups only add to the totals; if they fail, expenses still show.
    fuelLogs: fuelReply.error ? [] : (fuelReply.data ?? []),
    error: "",
  };
}

/**
 * The chart's hover/tap detail: the month with its fuel and other costs.
 * @param {{ active?: boolean, payload?: { payload: { label: string, fuel: number | null, other: number | null } }[], currency: "USD" | "LBP" }} props
 * @returns {JSX.Element | null}
 */
function MonthTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="fuel-log-chart__tooltip">
      <p className="fuel-log-chart__tooltip-date">{point.label}</p>
      <p>Fuel: {point.fuel == null ? "none logged" : formatMoney(point.fuel, currency)}</p>
      <p>Other costs: {point.other == null ? "none logged" : formatMoney(point.other, currency)}</p>
    </div>
  );
}

/**
 * Expenses screen: the user's cars (switchable), an add-an-expense form, this month's
 * cost of ownership with a category breakdown, a 6-month chart, and the expense history.
 * @returns {JSX.Element}
 */
function ExpensesPage() {
  const { user } = useAuth();
  const { setActiveCarId } = useActiveCar();
  const { currency: primaryCurrency } = useCurrency();
  const today = todayInBeirut();
  const thisMonth = monthOf(today);

  const [cars, setCars] = useState([]);
  const [loadingCars, setLoadingCars] = useState(true);
  const [selectedCarId, setSelectedCarId] = useState("");
  const [loaded, setLoaded] = useState({ carId: "", expenses: [], fuelLogs: [], error: "" });

  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  // null = not chosen here, so the form follows the header's USD | LBP switch.
  const [chosenCurrency, setChosenCurrency] = useState(null);
  const currency = chosenCurrency ?? primaryCurrency;
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const selectedCar = cars.find((car) => car.id === selectedCarId) ?? null;
  const showingSelectedCar = loaded.carId === selectedCarId && selectedCarId !== "";
  const expenses = showingSelectedCar ? loaded.expenses : null;
  const fuelLogs = showingSelectedCar ? loaded.fuelLogs : [];
  const loadError = showingSelectedCar ? loaded.error : "";
  // Sums are kept in LBP and <Price> shows them in both currencies, so the switch
  // never needs a recalculation; the chart needs one numeric scale, the primary currency.
  const summary = expenses ? monthlySummary(fuelLogs, expenses, thisMonth, "LBP") : null;
  const chartPoints = expenses ? monthlyChartPoints(fuelLogs, expenses, monthsEndingWith(thisMonth), primaryCurrency) : [];

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
      setSelectedCarId(list[0]?.id ?? "");
      setLoadingCars(false);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!selectedCarId) return undefined;
    let stale = false;
    fetchCarCosts(selectedCarId).then((next) => {
      if (!stale) setLoaded(next);
    });
    return () => {
      stale = true;
    };
  }, [selectedCarId]);

  /** Re-reads a car's costs after a write (unless the user has since switched cars). */
  async function reload(carId) {
    const next = await fetchCarCosts(carId);
    setLoaded((previous) => (previous.carId === next.carId ? next : previous));
  }

  /** CAR-55: the picked car also becomes the active one for brand theming. */
  function handleCarChange(carId) {
    setSelectedCarId(carId);
    setActiveCarId(carId);
    setFieldErrors({});
    setActionError("");
    setNotice("");
    setConfirmDeleteId(null);
  }

  async function handleAdd(event) {
    event.preventDefault();
    setActionError("");
    setNotice("");
    const errors = getExpenseErrors({ date, category, amount, note }, today);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const carId = selectedCarId;
    const trimmedNote = note.trim();
    setBusy(true);
    try {
      const { error } = await supabase.from("car_expenses").insert({
        user_id: user.id,
        car_id: carId,
        spent_on: date,
        category,
        amount: Number(amount),
        currency,
        note: trimmedNote === "" ? null : trimmedNote,
      });
      if (error) {
        setActionError(describeSaveError(error));
        return;
      }
      // The message only appears once the list and totals already include it.
      await reload(carId);
      setAmount("");
      setNote("");
      setCategory("");
      setDate(todayInBeirut());
      setNotice(`${categoryLabel(category)} expense added.`);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(expense) {
    setActionError("");
    setNotice("");
    setBusy(true);
    try {
      const { error } = await supabase.from("car_expenses").delete().eq("id", expense.id);
      if (error) {
        setActionError(describeSaveError(error));
        return;
      }
      await reload(selectedCarId);
      setConfirmDeleteId(null);
      setNotice(`${categoryLabel(expense.category)} expense of ${formatFillDate(expense.spent_on)} deleted.`);
    } finally {
      setBusy(false);
    }
  }

  if (loadingCars) {
    return (
      <PageShell title="Expenses" description="">
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
      <PageShell title="Expenses" description="Add a car before logging its costs.">
        <Link className="btn-primary" to="/cars/new">
          Add Your Car
        </Link>
      </PageShell>
    );
  }

  const label = selectedCar ? carLabel(selectedCar) : "";
  const monthName = formatMonth(thisMonth);
  const fieldError = (name) => (fieldErrors[name] ? <p role="alert" className="auth-form__error">{fieldErrors[name]}</p> : null);

  return (
    <PageShell
      title="Expenses"
      description="Log what your car costs beyond fuel and see the full monthly picture, fuel included."
    >
      <div className="route-params-card">
        <p className="form-section-label">Add an expense</p>
        <form onSubmit={handleAdd} noValidate className="car-form">
          {cars.length > 1 ? (
            <div className="form-field">
              <label htmlFor="expenseCarId">Car</label>
              <select id="expenseCarId" value={selectedCarId} onChange={(event) => handleCarChange(event.target.value)}>
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

          <div className="form-field">
            <label htmlFor="expenseDate">Date *</label>
            <input
              id="expenseDate"
              type="date"
              max={today}
              min={LIMITS.MIN_FILL_DATE}
              value={date}
              aria-invalid={fieldErrors.date ? "true" : undefined}
              onChange={(event) => setDate(event.target.value)}
            />
            {fieldError("date")}
          </div>

          <div className="form-field">
            <label htmlFor="expenseCategory">Category *</label>
            <select
              id="expenseCategory"
              value={category}
              aria-invalid={fieldErrors.category ? "true" : undefined}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Choose a category</option>
              {EXPENSE_CATEGORIES.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            {fieldError("category")}
          </div>

          <div className="form-field">
            <label htmlFor="expenseAmount">Amount *</label>
            <div className="fuel-log-cost-row">
              <input
                id="expenseAmount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="e.g. 25"
                value={amount}
                aria-invalid={fieldErrors.amount ? "true" : undefined}
                onChange={(event) => setAmount(event.target.value)}
              />
              <select aria-label="Currency of the amount" value={currency} onChange={(event) => setChosenCurrency(event.target.value)}>
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            {fieldError("amount")}
          </div>

          <div className="form-field">
            <label htmlFor="expenseNote">Note</label>
            <input
              id="expenseNote"
              type="text"
              maxLength={LIMITS.EXPENSE_NOTE}
              placeholder="e.g. Hamra parking, 3 hours"
              value={note}
              aria-invalid={fieldErrors.note ? "true" : undefined}
              onChange={(event) => setNote(event.target.value)}
            />
            {fieldError("note")}
          </div>

          {actionError && <p role="alert" className="auth-form__error">{actionError}</p>}
          {notice && <p role="status" className="fuel-log-saved">{notice}</p>}

          <button className="btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? "Saving..." : "Add Expense"}
          </button>
        </form>
      </div>

      <section className="dashboard-section" aria-label={`Cost of ownership, ${monthName}`}>
        <h2>{monthName}{label ? ` for ${label}` : ""}</h2>
        {expenses === null ? (
          <p>Loading costs...</p>
        ) : loadError ? (
          <p role="alert" className="auth-form__error">{loadError}</p>
        ) : summary.total == null ? (
          <p className="costs-empty">
            Nothing logged for {monthName} yet. Log fill-ups in the <Link to="/fuel-log">Fuel Log</Link> and
            other costs above to see what this car costs you each month.
          </p>
        ) : (
          <div className="costs-summary">
            <div className="costs-summary__total">
              <p className="costs-summary__label">Total this month</p>
              <p className="costs-summary__value">
                <Price amount={summary.total} currency="LBP" />
              </p>
            </div>
            <dl className="costs-summary__split">
              <div>
                <dt>Fuel</dt>
                <dd>{summary.fuel == null ? "No fill-ups logged this month" : <Price amount={summary.fuel} currency="LBP" />}</dd>
              </div>
              <div>
                <dt>Other costs</dt>
                <dd>{summary.other == null ? "No other costs this month" : <Price amount={summary.other} currency="LBP" />}</dd>
              </div>
            </dl>
            {summary.byCategory.length > 0 && (
              <ul className="costs-breakdown" aria-label="Other costs by category">
                {summary.byCategory.map((row) => (
                  <li key={row.key}>
                    <span>{row.label}</span>
                    <Price amount={row.amount} currency="LBP" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {expenses && hasChartData(chartPoints) && (
        <section className="dashboard-section fuel-log-chart" aria-label="Monthly costs chart">
          <h2>Last {chartPoints.length} months</h2>
          <p className="fuel-log-chart__caption">
            Fuel and other costs per month, in {primaryCurrency}. A month with nothing logged is left empty.
          </p>
          <div className="fuel-log-chart__wrap">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
                <YAxis width={76} tickFormatter={(value) => formatAxisMoney(value, primaryCurrency)} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
                <Tooltip content={(tooltipProps) => <MonthTooltip {...tooltipProps} currency={primaryCurrency} />} cursor={{ fill: "var(--color-border)", opacity: 0.4 }} />
                <Legend />
                <Bar dataKey="fuel" name="Fuel" stackId="cost" fill="var(--color-primary)" />
                <Bar dataKey="other" name="Other costs" stackId="cost" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="dashboard-section" aria-label="Expense history">
        <h2>Expenses{label ? ` for ${label}` : ""}</h2>
        {expenses === null ? (
          <p>Loading expenses...</p>
        ) : loadError ? null : expenses.length === 0 ? (
          <div className="fuel-log-empty">
            <p className="fuel-log-empty__title">No expenses logged yet</p>
            <p>Add a repair, parking, insurance or any other cost above. Fuel is counted from your Fuel Log.</p>
          </div>
        ) : (
          <div className="fuel-log-table-wrap">
            <table className="fuel-log-table">
              <caption className="sr-only">Expenses for {label}, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Category</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Note</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((expense) => (
                  <tr key={expense.id}>
                    <td>{formatFillDate(expense.spent_on)}</td>
                    <td>{categoryLabel(expense.category)}</td>
                    <td>
                      <Price amount={Number(expense.amount)} currency={expense.currency} />
                    </td>
                    <td>{expense.note || "-"}</td>
                    <td>
                      {confirmDeleteId === expense.id ? (
                        <span role="alert" className="costs-confirm">
                          Delete this expense?{" "}
                          <button type="button" className="maintenance-danger-btn" disabled={busy} onClick={() => handleDelete(expense)}>
                            Delete
                          </button>{" "}
                          <button type="button" className="maintenance-link-btn" onClick={() => setConfirmDeleteId(null)}>
                            Keep it
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="maintenance-link-btn maintenance-link-btn--danger"
                          aria-label={`Delete the ${categoryLabel(expense.category)} expense of ${formatFillDate(expense.spent_on)}`}
                          onClick={() => setConfirmDeleteId(expense.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

export default ExpensesPage;
