// CAR-79 (with the CAR-78 data layer): the Dashboard v2 data and states. One hero for the ACTIVE car with four tiles
// (odometer, real economy, last fill-up, next service), a switcher for the other cars, and three lower cards. ONE
// fuel_logs read feeds the fuel tiles, the month total and the maintenance readings; the page makes six reads in all
// (cars, fuel_logs, car_expenses, maintenance_items, advisor_messages, and the CAR-79 profiles read for the Default
// badge), each scoped to the user. The economy tile is the real average (realEfficiency), the same figure the Fuel Log
// shows. Supabase is mocked by a small in-memory table store; nothing is sent.

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
import { ActiveCarProvider } from "../theme/ActiveCarContext.jsx";
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
 * An in-memory stand-in for the tables. Each query builder records its select and filters, honours eq filters (user_id
 * included), and resolves when awaited, ordered or single-ed. `fail[table]` makes that table's reads fail; `pending`
 * lists tables whose reads never resolve (to see the loading state).
 */
function mockTables({ cars = [], fuelLogs = [], expenses = [], items = [], advisor = [], profile = { default_car_id: null }, fail = {}, pending = [] } = {}) {
  const store = { cars, fuel_logs: fuelLogs, car_expenses: expenses, maintenance_items: items, advisor_messages: advisor, profiles: [{ id: USER.id, ...profile }] };
  const requests = [];
  supabase.from.mockImplementation((table) => {
    if (!(table in store)) throw new Error(`unexpected table ${table}`);
    const request = { table, columns: null, filters: [] };
    requests.push(request);
    const number = requests.filter((r) => r.table === table).length;
    const reply = () => {
      const failing = typeof fail[table] === "function" ? fail[table](number) : fail[table];
      if (failing) return { data: null, error: { message: "boom" } };
      const rows = store[table].filter((row) => request.filters.every(([column, value]) => (column === "user_id" ? value === USER.id : String(row[column]) === String(value))));
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
      maybeSingle: () => (pending.includes(table) ? new Promise(() => {}) : Promise.resolve((() => { const r = reply(); return { data: r.error ? null : (r.data[0] ?? null), error: r.error }; })())),
      then: settle,
    };
    return builder;
  });
  return requests;
}

/** Renders the Dashboard. With `activeCar: true` it wraps ActiveCarProvider (so choosing a chip really changes the
 *  active car); the provider makes its own `cars` read for theming, which the request-count test avoids by omitting it. */
function renderAt(path, { activeCar = false } = {}) {
  const page = (
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/fuel-log" element={<FuelLogPage />} />
    </Routes>
  );
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CurrencyProvider>{activeCar ? <ActiveCarProvider>{page}</ActiveCarProvider> : page}</CurrencyProvider>
      </AuthProvider>
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
// 3 measured intervals over 1,200 km at `kmPerL` for car n, its odometer offset so each car's figures differ.
const enough = (n, kmPerL = 10) =>
  [0, 1, 2, 3].map((i) => fill(`car-${n}`, `f${n}-${i}`, `2026-09-0${i + 1}`, n * 100000 + i * 400, i === 0 ? 30 : 400 / kmPerL));

/** The hero tile whose label is `label` (e.g. "Odometer"); its text content holds the value/caption or empty message. */
function tile(label) {
  return screen.getByText(label, { selector: ".dashboard-tile__label" }).closest(".dashboard-tile");
}
const hero = () => document.querySelector(".dashboard-hero");
const settled = () => waitFor(() => expect(screen.queryAllByRole("status")).toHaveLength(0));

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: "token" } } });
  apiFetch.mockResolvedValue({ prices: {}, lbp_per_usd: 89000 });
});

describe("the page's reads: six, one fuel_logs, each user-scoped", () => {
  it("reads cars, fuel_logs, car_expenses, maintenance_items, advisor_messages and profiles, every one scoped to the user", async () => {
    const requests = mockTables({ cars: [car(1)], fuelLogs: enough(1), profile: { default_car_id: "car-1" } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    expect(requests.map((r) => r.table).sort()).toEqual(["advisor_messages", "car_expenses", "cars", "fuel_logs", "maintenance_items", "profiles"]);
    expect(requests.filter((r) => r.table === "fuel_logs")).toHaveLength(1);
    // Every read but the advisor stat filters by user_id (advisor relies on RLS and filters by sender/recommendation).
    for (const r of requests.filter((x) => x.table !== "advisor_messages")) {
      expect(r.filters.some(([c, v]) => c === "user_id" && v === USER.id) || r.filters.some(([c, v]) => c === "id" && v === USER.id)).toBe(true);
    }
    const fuel = requests.find((r) => r.table === "fuel_logs");
    for (const column of ["id", "car_id", "filled_at", "cost_amount", "cost_currency", "created_at", "liters", "odometer_km"]) {
      expect(fuel.columns.split(",").map((c) => c.trim())).toContain(column);
    }
  });

  it("the one fuel read feeds the hero's odometer, the month total and the maintenance reading", async () => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
    const thisMonth = { ...fill("car-1", "now", today, 120000, 40), cost_amount: "1000000", cost_currency: "LBP" };
    mockTables({
      cars: [car(1)],
      fuelLogs: [...enough(1), thisMonth],
      items: [{ id: "m1", car_id: "car-1", user_id: USER.id, name: "Oil change", interval_km: 20000, baseline_date: "2026-01-01", baseline_km: 100000 }],
    });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    expect(tile("Odometer")).toHaveTextContent("120,000 km"); // the newest reading
    expect(within(screen.getByRole("region", { name: "All cars, this month" })).getAllByText(/1,000,000/).length).toBeGreaterThan(0);
    const maintenance = screen.getByRole("region", { name: "Maintenance due" });
    expect(within(maintenance).getByText("Oil change")).toBeInTheDocument();
  });
});

describe("the hero tiles for the active car", () => {
  it("odometer, real economy, last fill-up and next service show real values", async () => {
    mockTables({
      cars: [car(1, { fuel_efficiency: 12 })],
      fuelLogs: enough(1),
      items: [{ id: "m1", car_id: "car-1", user_id: USER.id, name: "Oil change", interval_months: 12, baseline_date: "2026-10-01" }],
    });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    expect(tile("Odometer")).toHaveTextContent("101,200 km");
    expect(tile("Odometer")).toHaveTextContent("as of 4 Sep 2026");
    expect(tile("Fuel economy")).toHaveTextContent("10.0 km/L");
    expect(tile("Fuel economy")).toHaveTextContent("3 fill-ups");
    expect(tile("Last fill-up")).toHaveTextContent("4 Sep 2026");
    expect(tile("Next service")).toHaveTextContent("Oil change");
  });

  it("each tile has its own empty state (no NaN or 0) when the car has no data", async () => {
    mockTables({ cars: [car(1)], fuelLogs: [], items: [] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    expect(tile("Odometer")).toHaveTextContent("No odometer reading yet");
    expect(tile("Fuel economy")).toHaveTextContent("Log two fill-ups with odometer readings to see this.");
    expect(tile("Last fill-up")).toHaveTextContent("No fill-ups logged yet.");
    expect(tile("Next service")).toHaveTextContent("No service reminders yet.");
    expect(hero()).not.toHaveTextContent(/NaN|\b0 km\/L/);
  });

  it("the real economy tile needs at least one measured interval; a single reading shows the empty state", async () => {
    mockTables({ cars: [car(1, { fuel_efficiency: 12 })], fuelLogs: [fill("car-1", "a", "2026-09-01", 1000, 30)] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(tile("Odometer")).toHaveTextContent("1,000 km");
    expect(tile("Fuel economy")).toHaveTextContent("Log two fill-ups with odometer readings to see this.");
  });

  it("the hero shows the active (first) car only; the others are chips, not tiles", async () => {
    mockTables({ cars: [car(1), car(2), car(3)], fuelLogs: [...enough(1, 8), ...enough(2, 16)] });
    renderAt("/dashboard");
    await screen.findByLabelText(/2020 Make1 Model1/);
    await settled();
    // One hero, one set of tiles, for car 1 (8 km/L); car 2's 16 km/L never appears as a tile.
    expect(screen.getAllByText("Odometer", { selector: ".dashboard-tile__label" })).toHaveLength(1);
    expect(tile("Fuel economy")).toHaveTextContent("8.0 km/L");
    expect(hero()).not.toHaveTextContent("16.0 km/L");
    expect(screen.getByRole("button", { name: /Make2 Model2/ })).toBeInTheDocument();
  });
});

describe("the Default car badge (CAR-79, profiles.default_car_id)", () => {
  it("shows on the hero when the active car is the default", async () => {
    mockTables({ cars: [car(1), car(2)], profile: { default_car_id: "car-1" } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(within(hero()).getByText("Default car")).toBeInTheDocument();
  });

  it("is absent when the active car is not the default, and when profiles has no default", async () => {
    mockTables({ cars: [car(1), car(2)], profile: { default_car_id: "car-2" } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(within(hero()).queryByText("Default car")).not.toBeInTheDocument();
  });

  it("a failed profiles read just hides the badge, with no error state of its own", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { profiles: true } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(within(hero()).queryByText("Default car")).not.toBeInTheDocument();
    expect(tile("Fuel economy")).toHaveTextContent("10.0 km/L"); // the rest of the hero still works
  });
});

describe("the car switcher", () => {
  it("is absent with one car", async () => {
    mockTables({ cars: [car(1)] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    expect(screen.queryByRole("navigation", { name: "Your cars" })).not.toBeInTheDocument();
  });

  it("with two or more cars, each is a chip with aria-pressed, the active one pressed", async () => {
    mockTables({ cars: [car(1), car(2), car(3)] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    const chips = within(screen.getByRole("navigation", { name: "Your cars" })).getAllByRole("button");
    expect(chips).toHaveLength(3);
    expect(chips[0]).toHaveAttribute("aria-pressed", "true");
    expect(chips[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("choosing a chip changes the active car and the hero (keyboard-operable)", async () => {
    const user = userEvent.setup();
    mockTables({ cars: [car(1), car(2)], fuelLogs: [...enough(1, 8), ...enough(2, 16)] });
    renderAt("/dashboard", { activeCar: true });
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(tile("Fuel economy")).toHaveTextContent("8.0 km/L");

    const secondChip = screen.getByRole("button", { name: /Make2 Model2/ });
    secondChip.focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByLabelText(/2020 Make2 Model2/)).toBeInTheDocument());
    expect(tile("Fuel economy")).toHaveTextContent("16.0 km/L");
    expect(secondChip).toHaveAttribute("aria-pressed", "true");
  });
});

describe("quick actions and the three lower cards", () => {
  it("links to Trip Planner, Fuel Log, Advisor and Expenses", async () => {
    mockTables({ cars: [car(1)] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    const hrefs = within(hero()).getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const to of ["/trip-planner", "/fuel-log", "/advisor", "/expenses"]) expect(hrefs).toContain(to);
  });

  const actionClasses = () => Object.fromEntries(within(hero()).getAllByRole("link").filter((a) => a.classList.contains("dashboard-action")).map((a) => [a.textContent, a.className]));

  it("makes Log a fill-up the accent button, and the other three outlines, while the car has no odometer reading", async () => {
    mockTables({ cars: [car(1)], fuelLogs: [fill("car-1", "f1", "2026-09-30", null, 6.33)] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await waitFor(() => expect(actionClasses()["Log a fill-up"]).toContain("dashboard-action--cta"));

    expect(actionClasses()).toEqual({
      "Plan a trip": "dashboard-action dashboard-action--outline",
      "Log a fill-up": "dashboard-action dashboard-action--cta",
      "Ask the advisor": "dashboard-action dashboard-action--outline",
      "Add expense": "dashboard-action dashboard-action--outline",
    });
  });

  it("keeps all four quick actions equal once the car has a reading", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1) });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    expect(Object.values(actionClasses())).toEqual(Array(4).fill("dashboard-action"));
  });

  it("keeps them equal while the fill-ups load and when they fail (nothing is known about the reading)", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), pending: ["fuel_logs"] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    expect(Object.values(actionClasses())).toEqual(Array(4).fill("dashboard-action"));
  });

  it("keeps them equal when the fill-ups fail to load", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { fuel_logs: true } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(Object.values(actionClasses())).toEqual(Array(4).fill("dashboard-action"));
  });

  it("shows Set up reminders as a small outline button under the Next service message, not an inline link", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1) });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    const empty = tile("Next service").querySelector(".dashboard-tile__empty");
    expect(empty).not.toBeNull(); // the message is still there
    expect(within(empty).queryByRole("link")).not.toBeInTheDocument(); // but the link is not inline in it
    const button = within(tile("Next service")).getByRole("link", { name: "Set up reminders" });
    expect(button).toHaveAttribute("href", "/maintenance");
    expect(button).toHaveClass("btn-secondary", "btn-secondary--sm", "dashboard-tile__button");
    expect(button).not.toHaveClass("dashboard-action"); // never one of the quick actions
  });

  it("leaves the other tiles' empty links inline", async () => {
    mockTables({ cars: [car(1)], fuelLogs: [] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    // The first three tiles (odometer, economy, last fill-up), found by position so the test does not depend on their wording.
    const fuelTiles = [...document.querySelectorAll(".dashboard-tile")].slice(0, 3);
    expect(fuelTiles).toHaveLength(3);
    for (const fuelTile of fuelTiles) {
      expect(within(fuelTile.querySelector(".dashboard-tile__empty")).getByRole("link")).toBeInTheDocument();
    }
  });

  it("styles the small outline button in the stylesheet (transparent fill, primary outline)", () => {
    expect(indexCss).toMatch(/\.dashboard-tile__button[^{]*\{[^}]*background-color:\s*transparent[^}]*var\(--color-primary\)/);
  });

  it("keeps the Set up reminders button compact so the Next service tile never grows the hero (CLS)", () => {
    expect(indexCss).toMatch(/\.dashboard-tile__button \{[^}]*margin-top:[^}]*padding-block:/);
  });

  it("gives each switcher chip a dot in its make's brand accent colour (the default gold for a make with no theme)", async () => {
    mockTables({ cars: [car(1, { make: "Ferrari", model: "488" }), car(2, { make: "Honda", model: "CR-V" }), car(3, { make: "Mazda", model: "MX-5" })] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Ferrari 488/);

    const dots = Object.fromEntries(
      within(screen.getByRole("navigation", { name: "Your cars" })).getAllByRole("button").map((chip) => {
        const dot = chip.querySelector(".dashboard-chip__dot");
        expect(dot).toHaveAttribute("aria-hidden", "true"); // decoration: the name already says which car it is
        return [chip.textContent, dot.style.getPropertyValue("--chip-dot")];
      }),
    );
    expect(dots).toEqual({ "Ferrari 488": "#ffd900", "Honda CR-V": "#e4002b", "Mazda MX-5": "#c9a24b" });
  });

  it("paints the dot from that colour in the stylesheet", () => {
    expect(indexCss).toMatch(/\.dashboard-chip__dot \{[^}]*border-radius:\s*50%[^}]*var\(--chip-dot\)/);
  });

  it("styles the accent and outline variants in the stylesheet", () => {
    expect(indexCss).toMatch(/\.dashboard-action--cta[^{]*\{[^}]*var\(--color-accent\)/);
    expect(indexCss).toMatch(/\.dashboard-action--outline[^{]*\{[^}]*transparent/);
  });

  it("the three lower cards are present (this month, maintenance, DIY)", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1) });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(screen.getByRole("region", { name: "All cars, this month" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Maintenance due" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "DIY suggestion success rate" })).toBeInTheDocument();
  });
});

describe("a failure of each read is handled on its own", () => {
  it("fuel_logs fails: one shared error over the fuel tiles with a retry that refetches only fuel_logs; the rest works", async () => {
    const user = userEvent.setup();
    const requests = mockTables({
      cars: [car(1, { fuel_efficiency: 12 })],
      fuelLogs: enough(1),
      items: [{ id: "m1", car_id: "car-1", user_id: USER.id, name: "Inspection", interval_months: 12, baseline_date: "2026-10-01" }],
      fail: { fuel_logs: (n) => n === 1 },
    });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();

    const heroAlerts = within(hero()).getAllByRole("alert");
    expect(heroAlerts).toHaveLength(1);
    expect(heroAlerts[0]).toHaveTextContent("Couldn't load your fill-ups");
    expect(within(hero()).queryByText("Odometer", { selector: ".dashboard-tile__label" })).not.toBeInTheDocument();
    expect(tile("Next service")).toHaveTextContent("Inspection"); // next service still shows
    expect(screen.getByText(/Shown once your fill-ups load/)).toBeInTheDocument(); // month tile, no second error

    const before = requests.length;
    await user.click(within(hero()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(hero()).queryByRole("alert")).not.toBeInTheDocument());
    expect(requests.slice(before).map((r) => r.table)).toEqual(["fuel_logs"]);
    expect(tile("Odometer")).toHaveTextContent("101,200 km");
  });

  it("cars fails: the hero shows the cars error with a retry; the lower cards still load", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { cars: true } });
    renderAt("/dashboard");
    expect(await screen.findByText(/Couldn't load your cars/)).toBeInTheDocument();
    await settled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByText(/No feedback yet/)).toBeInTheDocument();
  });

  it("car_expenses fails: only the month card says so; the hero and maintenance are fine", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { car_expenses: true } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(screen.getByText(/Couldn't load this month's costs/)).toBeInTheDocument();
    expect(tile("Fuel economy")).toHaveTextContent("10.0 km/L");
  });

  it("maintenance_items fails: the next-service tile and the lower maintenance card both say so, nothing else", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { maintenance_items: true } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(within(hero()).getByText("Couldn't load your maintenance.")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load your maintenance right now/)).toBeInTheDocument();
    expect(tile("Odometer")).toHaveTextContent("101,200 km");
  });

  it("advisor_messages fails: the DIY card shows its empty state; the hero is fine", async () => {
    mockTables({ cars: [car(1)], fuelLogs: enough(1), fail: { advisor_messages: true } });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(screen.getByText(/No feedback yet/)).toBeInTheDocument();
    expect(tile("Fuel economy")).toHaveTextContent("10.0 km/L");
  });
});

describe("the real economy tile equals the Fuel Log's real average (shared backend fixtures)", () => {
  const withInterval = cases.filter((c) => c.expected && c.expected.interval_count >= 1);

  it("has fixtures to compare", () => {
    expect(withInterval.length).toBeGreaterThanOrEqual(3);
  });

  it.each(withInterval)("hero tile and Fuel Log agree: $name", async ({ rows, expected }) => {
    const logs = rows.map((row) => ({ ...row, car_id: "car-1", user_id: USER.id, cost_amount: "45", cost_currency: "USD" }));
    const figure = `${formatKmPerLiter(expected.km_per_liter)} km/L`;

    mockTables({ cars: [car(1, { fuel_efficiency: 7 })], fuelLogs: logs });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    await settled();
    expect(tile("Fuel economy")).toHaveTextContent(figure);
  });

  it.each(withInterval)("Fuel Log shows the same figure: $name", async ({ rows, expected }) => {
    const logs = rows.map((row) => ({ ...row, car_id: "car-1", user_id: USER.id, cost_amount: "45", cost_currency: "USD" }));
    mockTables({ cars: [car(1, { fuel_efficiency: 7 })], fuelLogs: logs });
    renderAt("/fuel-log");
    const average = await screen.findByText(/Your real average/);
    expect(average.closest(".fuel-log-real-average")).toHaveTextContent(`Your real average: ${formatKmPerLiter(expected.km_per_liter)} km/L`);
  });
});

describe("the blocks reserve their height while loading (no slow-connection jump)", () => {
  it("the hero renders a skeleton that matches its loaded shape (head, four tiles, four actions)", async () => {
    mockTables({ cars: [car(1)], pending: ["cars"] });
    renderAt("/dashboard");
    await screen.findByText("Loading your cars...");
    const skeleton = document.querySelector(".dashboard-hero--skeleton");
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.querySelectorAll(".dashboard-tile")).toHaveLength(4);
    expect(skeleton.querySelectorAll(".skeleton-bar--action")).toHaveLength(4);
  });

  it("each hero tile shows a skeleton until the fuel data settles, then its value (same tile, reserved height)", async () => {
    mockTables({ cars: [car(1, { fuel_efficiency: 12 })], fuelLogs: enough(1), pending: ["fuel_logs"] });
    renderAt("/dashboard");
    await screen.findByLabelText(/Make1 Model1/);
    expect(tile("Odometer").querySelector(".skeleton-bar")).toBeInTheDocument();
    expect(screen.getByText("Loading each car's details...")).toHaveAttribute("role", "status");
  });

  it("the stylesheet reserves the hero's and the tiles' height (what makes CLS 0; jsdom has no layout)", () => {
    const heroRule = /\.dashboard-hero \{([^}]*)\}/.exec(indexCss);
    expect(heroRule[1]).toMatch(/min-height:\s*[\d.]+rem/);
    const tileRule = /\.dashboard-tile \{([^}]*)\}/.exec(indexCss);
    expect(tileRule[1]).toMatch(/min-height:\s*[\d.]+rem/);
    expect(indexCss).toMatch(/\.dashboard-lower__card \{[^}]*min-height:\s*[\d.]+rem/);
  });
});
