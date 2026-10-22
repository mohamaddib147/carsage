// CAR-78: the Dashboard's data layer. One fuel_logs read (the union of the columns the month tile and the maintenance
// card each read before), five requests instead of six, each car's snapshot built from that car's rows only, and a
// failure of any one request handled on its own: a failed fuel_logs read is ONE error state with a retry that
// refetches only fuel_logs. The economy shown equals the Fuel Log's real average and the Trip Planner's choice for
// the same car (shared backend fixtures). Supabase is mocked by a small in-memory table store; nothing is sent.

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, waitFor, within } from "@testing-library/react";
// eslint-disable-next-line import/order -- grouped with the node imports above
const indexCss = readFileSync("src/index.css", "utf8");
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage.jsx";
import FuelLogPage from "./FuelLogPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { formatKmPerLiter } from "../lib/odometer.js";
import { supabase } from "../lib/supabaseClient.js";

const here = dirname(fileURLToPath(import.meta.url));
const { cases } = JSON.parse(readFileSync(resolve(here, "../../../backend/tests/fixtures/efficiency_cases.json"), "utf-8"));

const USER = { id: "user-123", email: "driver@example.com" };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

vi.mock("../lib/apiClient.js", () => ({ apiFetch: vi.fn() }));

/**
 * An in-memory stand-in for the tables. Every query builder records its select and filters, honours eq filters
 * (user_id included), and resolves when awaited or ordered. `fail[table]` makes that table's reads fail (an
 * { error } reply); a function there decides per request (its argument is the request's number for that table).
 */
function mockTables({ cars = [], fuelLogs = [], expenses = [], items = [], advisor = [], fail = {}, pending = [] } = {}) {
  const store = { cars, fuel_logs: fuelLogs, car_expenses: expenses, maintenance_items: items, advisor_messages: advisor };
  const requests = [];
  supabase.from.mockImplementation((table) => {
    if (!(table in store)) throw new Error(`unexpected table ${table}`);
    const request = { table, columns: null, filters: [] };
    requests.push(request);
    const number = requests.filter((r) => r.table === table).length;
    const reply = () => {
      const failing = typeof fail[table] === "function" ? fail[table](number) : fail[table];
      if (failing) return { data: null, error: { message: "boom" } };
      const rows = store[table].filter((row) => request.filters.every(([column, value]) => (column === "user_id" ? value === USER.id : row[column] === value)));
      return { data: rows, error: null };
    };
    const settle = (resolveReply, reject) =>
      pending.includes(table) ? new Promise(() => {}) : Promise.resolve(reply()).then(resolveReply, reject);
    const builder = {
      select: (columns) => ((request.columns = columns), builder),
      eq: (column, value) => (request.filters.push([column, value]), builder),
      lte: () => builder,
      limit: () => builder,
      order: () => builder,
      maybeSingle: () => (pending.includes(table) ? new Promise(() => {}) : Promise.resolve({ data: null, error: null })),
      then: settle,
    };
    return builder;
  });
  return requests;
}

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><CurrencyProvider>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/fuel-log" element={<FuelLogPage />} />
        </Routes>
      </CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
}

const car = (n, extra = {}) => ({ id: `car-${n}`, make: `Make${n}`, model: `Model${n}`, year: 2020, created_at: `2026-01-0${n}T00:00:00Z`, ...extra });
const fill = (carId, id, date, odometer, liters) => ({
  id,
  car_id: carId,
  user_id: USER.id,
  filled_at: date,
  created_at: `${date}T09:00:00Z`,
  odometer_km: odometer,
  liters: String(liters),
  cost_amount: "45",
  cost_currency: "USD",
});
// 3 measured intervals over 1,200 km at 10 km/L for car n, its odometer offset so each car's figures differ.
const enough = (n, kmPerL = 10) =>
  [0, 1, 2, 3].map((i) => fill(`car-${n}`, `f${n}-${i}`, `2026-09-0${i + 1}`, n * 100000 + i * 400, i === 0 ? 30 : 400 / kmPerL));

const glance = (n) => screen.findByLabelText(`Make${n} Model${n} at a glance`);
const settled = () => waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(0));

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: "token" } } });
  apiFetch.mockResolvedValue({ prices: {}, lbp_per_usd: 89000 });
});

describe("one fuel_logs read", () => {
  it("sends five requests, one of them fuel_logs with the union of the columns, scoped to the user", async () => {
    const requests = mockTables({ cars: [car(1)], fuelLogs: enough(1) });
    renderAt("/dashboard");
    await glance(1);
    await settled();

    expect(requests.map((r) => r.table).sort()).toEqual(["advisor_messages", "car_expenses", "cars", "fuel_logs", "maintenance_items"]);
    const fuel = requests.filter((r) => r.table === "fuel_logs");
    expect(fuel).toHaveLength(1);
    expect(fuel[0].filters).toEqual([["user_id", USER.id]]);
    // Every column either earlier read used: the month tile (id, car_id, filled_at, cost_amount, cost_currency)
    // and the maintenance card (id, car_id, filled_at, created_at, liters, odometer_km).
    const columns = fuel[0].columns.split(",").map((c) => c.trim());
    for (const column of ["id", "car_id", "filled_at", "cost_amount", "cost_currency", "created_at", "liters", "odometer_km"]) {
      expect(columns).toContain(column);
    }
    for (const r of requests.filter((x) => x.table !== "advisor_messages")) expect(r.filters).toContainEqual(["user_id", USER.id]);
  });

  it("the one read gives the month tile and the maintenance card what the two reads did", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
    const thisMonth = { ...fill("car-1", "now", today, 120000, 40), cost_amount: "1000000", cost_currency: "LBP" };
    mockTables({
      cars: [car(1)],
      fuelLogs: [...enough(1), thisMonth],
      items: [{ id: "m1", car_id: "car-1", user_id: USER.id, name: "Oil change", interval_km: 20000, baseline_date: "2026-01-01", baseline_km: 100000 }],
    });
    renderAt("/dashboard");
    await glance(1);
    await settled();

    // Month: this month's fill-up cost. Maintenance: due at 120,000 km, latest reading 120,000 km -> due soon.
    expect(within(screen.getByRole("region", { name: "All cars, this month" })).getAllByText(/1,000,000/).length).toBeGreaterThan(0);
    const maintenance = screen.getByRole("region", { name: "Maintenance due" });
    expect(within(maintenance).getByText("Oil change")).toBeInTheDocument();
    expect(within(maintenance).getByText("Due soon")).toBeInTheDocument();
  });
});

describe("the at-a-glance block reserves its space while the data loads (no slow-connection jump)", () => {
  it("renders an aria-hidden skeleton in the same grid as the loaded block, so nothing below the card moves when the data lands", async () => {
    mockTables({ cars: [car(1, { fuel_efficiency: 12 })], fuelLogs: enough(1), pending: ["fuel_logs", "maintenance_items", "car_expenses"] });
    renderAt("/dashboard");

    await screen.findByText("Loading each car's details...");
    const card = document.querySelector(".dashboard-car-card");
    expect(card).not.toBeNull();
    // The reserved placeholder uses the SAME class the loaded list uses (so it reserves the same CSS min-height),
    // is hidden from the a11y tree, and holds skeleton bars — not the real "at a glance" list yet.
    const placeholder = card.querySelector(".dashboard-car-card__specs[aria-hidden='true']");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder.querySelectorAll(".skeleton-bar").length).toBeGreaterThanOrEqual(4);
    expect(card.querySelector("[aria-label$='at a glance']")).not.toBeInTheDocument();
    // A screen reader is told the details are loading.
    expect(screen.getByText("Loading each car's details...")).toHaveAttribute("role", "status");
  });

  it("swaps the skeleton for the real list once the data settles (same class, so the height is unchanged)", async () => {
    mockTables({ cars: [car(1, { fuel_efficiency: 12 })], fuelLogs: enough(1) });
    renderAt("/dashboard");

    const list = await glance(1);
    expect(list).toHaveClass("dashboard-car-card__specs");
    expect(list.querySelector(".skeleton-bar")).toBeNull();
    expect(screen.queryByText("Loading each car's details...")).not.toBeInTheDocument();
  });

  it("the block reserves a min-height in the stylesheet (what makes the reserve real; CLS is measured on Slow 4G, jsdom has no layout)", () => {
    // The .dashboard-car-card__specs rule, and its phone-width override, both set a min-height.
    const base = /\.dashboard-car-card__specs\s*\{([^}]*)\}/.exec(indexCss);
    expect(base, "the .dashboard-car-card__specs rule exists").not.toBeNull();
    expect(base[1]).toMatch(/min-height:\s*[\d.]+rem/);
    expect(indexCss).toMatch(/@media\s*\(max-width:\s*600px\)\s*\{\s*\.dashboard-car-card__specs\s*\{[^}]*min-height:\s*[\d.]+rem/);
  });
});

describe("each car's snapshot, for 0, 1, 3 and 4 cars", () => {
  it("0 cars: no snapshot, the add-a-car prompt", async () => {
    mockTables({ fuelLogs: enough(9) });
    renderAt("/dashboard");
    expect(await screen.findByText("You haven't added a car yet.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/at a glance/)).not.toBeInTheDocument();
  });

  it("1 car: odometer, real economy, last fill-up and next service", async () => {
    mockTables({ cars: [car(1, { fuel_efficiency: 12 })], fuelLogs: enough(1) });
    renderAt("/dashboard");
    const list = await glance(1);
    expect(list).toHaveTextContent("Odometer101,200 km");
    expect(list).toHaveTextContent("Economy10.0 km/L (real average)");
    expect(list).toHaveTextContent(/Last fill-up4 Sep 2026, 40 L, /);
    expect(list).toHaveTextContent("Next serviceNothing tracked");
  });

  it.each([3, 4])("%i cars: each card has its own figures, never another car's", async (count) => {
    const cars = Array.from({ length: count }, (_, i) => car(i + 1, { fuel_efficiency: 12 }));
    // Car 1: no fill-ups (rated). Car 2: one reading. Car 3: real 8 km/L. Car 4: real 16 km/L.
    const logs = [fill("car-2", "f2", "2026-09-10", 200000, 30), ...enough(3, 8), ...(count === 4 ? enough(4, 16) : [])];
    mockTables({ cars, fuelLogs: logs });
    renderAt("/dashboard");

    const one = await glance(1);
    expect(one).toHaveTextContent("OdometerNo reading yet");
    expect(one).toHaveTextContent("Economy12.0 km/L (rated)");
    expect(one).toHaveTextContent("Last fill-upNone yet");
    const two = await glance(2);
    expect(two).toHaveTextContent("Odometer200,000 km");
    expect(two).toHaveTextContent("Economy12.0 km/L (rated)");
    const three = await glance(3);
    expect(three).toHaveTextContent("Odometer301,200 km");
    expect(three).toHaveTextContent("Economy8.0 km/L (real average)");
    if (count === 4) {
      const four = await glance(4);
      expect(four).toHaveTextContent("Odometer401,200 km");
      expect(four).toHaveTextContent("Economy16.0 km/L (real average)");
    }
    expect(screen.getAllByLabelText(/at a glance/)).toHaveLength(count);
  });

  it("a car with no rated figure and too little data says so in words, never NaN or 0", async () => {
    mockTables({ cars: [car(1)], fuelLogs: [fill("car-1", "a", "2026-09-01", 1000, 30)] });
    renderAt("/dashboard");
    const list = await glance(1);
    expect(list).toHaveTextContent("EconomyNot enough data yet");
    expect(list).not.toHaveTextContent(/NaN|\b0(\.0)? km\/L/);
  });
});

describe("a failure of each query is handled on its own", () => {
  it("fuel_logs fails: one error state with a retry; maintenance, other costs and DIY still load; the retry refetches only fuel_logs", async () => {
    const user = userEvent.setup();
    const requests = mockTables({
      cars: [car(1, { fuel_efficiency: 12 })],
      fuelLogs: enough(1),
      items: [{ id: "m1", car_id: "car-1", user_id: USER.id, name: "Inspection", interval_months: 12, baseline_date: "2026-10-01" }],
      fail: { fuel_logs: (n) => n === 1 },
    });
    renderAt("/dashboard");

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent("Couldn't load your fill-ups");
    await settled();
    // The other sections are unaffected: maintenance shows its item, DIY its empty state, the month tile no second error.
    expect(within(screen.getByRole("region", { name: "Maintenance due" })).getByText(/All caught up/)).toBeInTheDocument();
    expect(screen.getByText(/No feedback yet/)).toBeInTheDocument();
    expect(screen.getByText(/Shown once your fill-ups load/)).toBeInTheDocument();
    // The car keeps its rated figure (Trip Planner's fallback too); no fuel-derived row is guessed.
    const list = await glance(1);
    expect(list).toHaveTextContent("Economy12.0 km/L (rated)");
    expect(list).not.toHaveTextContent(/Odometer|Last fill-up/);

    const before = requests.length;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(requests.slice(before).map((r) => r.table)).toEqual(["fuel_logs"]);
    expect(await glance(1)).toHaveTextContent("Economy10.0 km/L (real average)");
  });

  it("cars fails: the cars error with its retry; the other sections still load", async () => {
    mockTables({ fuelLogs: enough(1), fail: { cars: true } });
    renderAt("/dashboard");
    expect(await screen.findByText(/Couldn't load your cars/)).toBeInTheDocument();
    await settled();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(/No feedback yet/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing tracked yet/)).toBeInTheDocument();
  });

  it("car_expenses fails: only the month tile says so; snapshots and maintenance are unaffected", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { car_expenses: true } });
    renderAt("/dashboard");
    expect(await screen.findByText(/Couldn't load this month's costs/)).toBeInTheDocument();
    expect(await glance(1)).toHaveTextContent("Economy10.0 km/L (real average)");
    expect(screen.getByText(/Nothing tracked yet/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("maintenance_items fails: only the maintenance card says so; the snapshot leaves out the next service", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { maintenance_items: true } });
    renderAt("/dashboard");
    expect(await screen.findByText(/Couldn't load your maintenance/)).toBeInTheDocument();
    const list = await glance(1);
    expect(list).toHaveTextContent("Odometer101,200 km");
    expect(list).not.toHaveTextContent("Next service");
  });

  it("advisor_messages fails: the DIY card shows its empty state; everything else loads", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { advisor_messages: true } });
    renderAt("/dashboard");
    expect(await glance(1)).toHaveTextContent("Economy10.0 km/L (real average)");
    await settled();
    expect(screen.getByText(/No feedback yet/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the Dashboard's economy equals the Fuel Log's and the Trip Planner's for the same car", () => {
  // The backend's expected figure IS Trip Planner's real km/L for these rows (backend/tests/test_real_efficiency.py).
  const overFloor = cases.filter((c) => c.expected && c.expected.interval_count >= 3 && c.expected.distance_km >= 500);

  it("there are fixtures over the floor to compare", () => {
    expect(overFloor.length).toBeGreaterThanOrEqual(2);
  });

  it.each(overFloor)("$name", async ({ rows, expected }) => {
    const logs = rows.map((row) => ({ ...row, car_id: "car-1", user_id: USER.id, cost_amount: "45", cost_currency: "USD" }));
    const otherCar = logs.map((row) => ({ ...row, id: `x-${row.id}`, car_id: "car-2", liters: "1" }));
    const figure = `${formatKmPerLiter(expected.km_per_liter)} km/L`;

    mockTables({ cars: [car(1, { fuel_efficiency: 7 }), car(2)], fuelLogs: [...logs, ...otherCar] });
    renderAt("/dashboard");
    expect(await glance(1)).toHaveTextContent(`Economy${figure} (real average)`);
  });

  it.each(overFloor)("Fuel Log shows the same figure: $name", async ({ rows, expected }) => {
    const logs = rows.map((row) => ({ ...row, car_id: "car-1", user_id: USER.id, cost_amount: "45", cost_currency: "USD" }));
    mockTables({ cars: [car(1, { fuel_efficiency: 7 })], fuelLogs: logs });
    renderAt("/fuel-log");
    const average = await screen.findByText(/Your real average/);
    expect(average.closest(".fuel-log-real-average")).toHaveTextContent(`Your real average: ${formatKmPerLiter(expected.km_per_liter)} km/L`);
    expect(average.closest(".fuel-log-real-average")).toHaveTextContent("Trip Planner uses it");
  });

  it("below the floor, the Dashboard shows the rated figure, the one Trip Planner uses", async () => {
    const below = cases.find((c) => c.expected && c.expected.interval_count < 3);
    const logs = below.rows.map((row) => ({ ...row, car_id: "car-1", user_id: USER.id }));
    mockTables({ cars: [car(1, { fuel_efficiency: 7 })], fuelLogs: logs });
    renderAt("/dashboard");
    expect(await glance(1)).toHaveTextContent("Economy7.0 km/L (rated)");
  });
});
