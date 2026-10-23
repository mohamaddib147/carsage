// Tests for the Dashboard / Home screen lower cards: the DIY fix-rate stat, the Maintenance-due card and the
// "This month, all cars" cost card (CAR-62/CAR-64). The CAR-79 hero, tiles, switcher, requests and per-state
// behaviour are covered in DashboardPage.data.test.jsx; the lower cards were kept largely unchanged by CAR-79 and
// their detailed logic is tested here. useActiveCar falls back to inert defaults without a provider (the hero shows
// the first car), which is all these lower-card tests need.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import CurrencyToggle from "../components/CurrencyToggle.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(),
  },
}));

/**
 * Wires supabase.from("cars").select().eq().order() to resolve `carsResult`,
 * and supabase.from("advisor_messages") for the Dashboard's DIY fix-rate stat
 * (mentor feedback, no Jira task) — the diy-messages query is awaited
 * directly (no terminal call), so the builder itself is a thenable that
 * resolves to `diyMessages`; the separate issue-description lookup ends in
 * .maybeSingle(), resolving to `issueRow`. Callers that don't pass either just
 * get "no feedback yet" (the common case for the pre-existing car-list tests).
 */
function mockCarsList(
  carsResult,
  {
    diyMessages = { data: [], error: null },
    issueRow = { data: null, error: null },
    maintenanceItems = { data: [], error: null },
    readings = { data: [], error: null },
    expenses = { data: [], error: null },
  } = {},
) {
  // CAR-62: the Maintenance card's two reads, each filtered by the caller's user_id.
  const maintenanceFilters = [];
  const userScoped = (table, result) => ({
    select: vi.fn(() => ({
      eq: vi.fn((column, value) => {
        maintenanceFilters.push([table, column, value]);
        return Promise.resolve(result);
      }),
    })),
  });
  const order = vi.fn().mockResolvedValue(carsResult);
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));

  const advisorBuilder = {
    select: vi.fn(() => advisorBuilder),
    eq: vi.fn(() => advisorBuilder),
    lte: vi.fn(() => advisorBuilder),
    order: vi.fn(() => advisorBuilder),
    limit: vi.fn(() => advisorBuilder),
    maybeSingle: vi.fn().mockResolvedValue(issueRow),
    then: (resolve, reject) => Promise.resolve(diyMessages).then(resolve, reject),
  };

  supabase.from.mockImplementation((table) => {
    if (table === "cars") return { select };
    if (table === "advisor_messages") return advisorBuilder;
    if (table === "maintenance_items") return userScoped(table, maintenanceItems);
    if (table === "fuel_logs") return userScoped(table, readings);
    if (table === "car_expenses") return userScoped(table, expenses);
    // CAR-79: the Default-car badge reads profiles.default_car_id (no default here, so the badge never shows).
    if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { default_car_id: null }, error: null }) }) }) };
    throw new Error(`mockCarsList: unexpected table "${table}"`);
  });

  return { select, eq, order, advisorBuilder, maintenanceFilters };
}

function renderDashboard() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <CurrencyProvider>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
          <Route path="/cars/:carId" element={<p>Car profile placeholder</p>} />
          <Route path="/trip-planner" element={<p>Trip planner placeholder</p>} />
          <Route path="/advisor" element={<p>AI advisor placeholder</p>} />
        </Routes>
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: LOGGED_IN_USER } },
  });
});

describe("DashboardPage — DIY fix-rate stat (mentor feedback, no Jira task)", () => {
  it("shows a sensible empty state, not a broken 0% or NaN, when nobody has given feedback yet (edge case)", async () => {
    mockCarsList({ data: [], error: null });

    renderDashboard();

    expect(
      await screen.findByText(/No feedback yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(screen.queryByText("Latest fix")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "AI Advisor" });
    expect(link).toHaveAttribute("href", "/advisor");
  });

  it("stays the empty state when there are DIY replies but none has been answered yet (edge case)", async () => {
    mockCarsList(
      { data: [], error: null },
      {
        diyMessages: {
          data: [
            { conversation_id: "c1", marked_fixed: null, created_at: "2026-09-20T10:00:00Z" },
            { conversation_id: "c2", marked_fixed: null, created_at: "2026-09-19T10:00:00Z" },
          ],
          error: null,
        },
      },
    );

    renderDashboard();

    expect(await screen.findByText(/No feedback yet/)).toBeInTheDocument();
  });

  it("shows the percentage fixed among only the suggestions with feedback, not diluted by the unanswered one (normal case)", async () => {
    mockCarsList(
      { data: [], error: null },
      {
        diyMessages: {
          data: [
            { conversation_id: "c1", marked_fixed: true, created_at: "2026-09-20T10:00:00Z" },
            { conversation_id: "c2", marked_fixed: false, created_at: "2026-09-19T10:00:00Z" },
            { conversation_id: "c3", marked_fixed: null, created_at: "2026-09-18T10:00:00Z" }, // no feedback — excluded
          ],
          error: null,
        },
        issueRow: { data: { message_text: "Squeaking brakes" }, error: null },
      },
    );

    renderDashboard();

    // 1 of 2 answered = 50%, not 1 of 3 = 33%.
    expect(await screen.findByText("50%")).toBeInTheDocument();
    expect(screen.getByText(/of your DIY suggestions with feedback fixed the issue/)).toBeInTheDocument();
  });

  it("shows the sample size next to the percentage: 60% (3 of 5), counting only suggestions with feedback", async () => {
    const row = (n, fixed) => ({ conversation_id: `c${n}`, marked_fixed: fixed, created_at: `2026-09-1${n}T10:00:00Z` });
    mockCarsList(
      { data: [], error: null },
      {
        diyMessages: { data: [row(1, true), row(2, true), row(3, true), row(4, false), row(5, false), row(6, null)], error: null },
        issueRow: { data: { message_text: "Squeaking brakes" }, error: null },
      },
    );

    renderDashboard();

    expect(await screen.findByText("60%")).toBeInTheDocument();
    expect(screen.getByText("(3 of 5) of your DIY suggestions with feedback fixed the issue")).toBeInTheDocument();
  });

  it("highlights the most recently confirmed fix with its issue description and how long ago", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    mockCarsList(
      { data: [], error: null },
      {
        diyMessages: {
          data: [
            { conversation_id: "c-old", marked_fixed: true, created_at: "2026-01-01T10:00:00Z" },
            { conversation_id: "c-new", marked_fixed: true, created_at: threeDaysAgo },
          ],
          error: null,
        },
        issueRow: { data: { message_text: "Squeaking brakes at low speed" }, error: null },
      },
    );

    renderDashboard();

    expect(await screen.findByText("Latest fix")).toBeInTheDocument();
    expect(screen.getByText("Squeaking brakes at low speed")).toBeInTheDocument();
    expect(screen.getByText("3 days ago")).toBeInTheDocument();
  });

  it("shows the rate but no Latest fix panel when nobody's feedback was 'fixed'", async () => {
    mockCarsList(
      { data: [], error: null },
      {
        diyMessages: { data: [{ conversation_id: "c1", marked_fixed: false, created_at: "2026-09-20T10:00:00Z" }], error: null },
      },
    );

    renderDashboard();

    expect(await screen.findByText("0%")).toBeInTheDocument();
    expect(screen.queryByText("Latest fix")).not.toBeInTheDocument();
  });

  it("falls back to the empty state, not a crash, if loading the stat fails", async () => {
    mockCarsList({ data: [], error: null }, { diyMessages: { data: null, error: { message: "network error" } } });

    renderDashboard();

    expect(await screen.findByText(/No feedback yet/)).toBeInTheDocument();
  });
});

describe("DashboardPage — Maintenance card (CAR-62)", () => {
  const CAR_A = { id: "car-a", make: "Mercedes-Benz", model: "C230", year: 2005, user_id: "user-123" };
  const CAR_B = { id: "car-b", make: "Toyota", model: "Corolla", year: 2020, user_id: "user-123" };
  const dateItem = (id, carId, name, baselineDate) => ({
    id, car_id: carId, name, interval_km: null, interval_months: 12, baseline_date: baselineDate, baseline_km: null, created_at: "x", maintenance_records: [],
  });
  const kmItem = (id, carId, name, baselineKm) => ({
    id, car_id: carId, name, interval_km: 5000, interval_months: null, baseline_date: "2026-05-01", baseline_km: baselineKm, created_at: "x", maintenance_records: [],
  });
  const reading = (carId, km) => ({ id: `f-${carId}`, car_id: carId, filled_at: "2026-10-10", created_at: "2026-10-10T09:00:00Z", liters: 40, odometer_km: km });
  const card = () => screen.getByRole("region", { name: "Maintenance due" });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T09:00:00Z")); // 19 Oct in Beirut
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks only for the caller's own items and readings", async () => {
    const { maintenanceFilters } = mockCarsList({ data: [CAR_A], error: null });
    renderDashboard();
    await within(await screen.findByRole("region", { name: "Maintenance due" })).findByText(/Nothing tracked yet/);

    expect(maintenanceFilters).toEqual(
      expect.arrayContaining([["maintenance_items", "user_id", "user-123"], ["fuel_logs", "user_id", "user-123"]]),
    );
  });

  it("has a friendly empty state when nothing is tracked yet", async () => {
    mockCarsList({ data: [CAR_A], error: null });
    renderDashboard();

    const empty = await within(await screen.findByRole("region", { name: "Maintenance due" })).findByText(/Nothing tracked yet/);
    expect(within(empty).getByRole("link", { name: "Maintenance" })).toHaveAttribute("href", "/maintenance");
  });

  it("says 'All caught up' when items exist but none is due", async () => {
    mockCarsList({ data: [CAR_A], error: null }, { maintenanceItems: { data: [dateItem("i1", "car-a", "Brake check", "2026-09-01")], error: null } });
    renderDashboard();

    expect(await within(await screen.findByRole("region", { name: "Maintenance due" })).findByText("All caught up: nothing is overdue or due soon.")).toBeInTheDocument();
  });

  it("lists what's overdue or due soon across cars, most urgent first, each linking to its item, with OK items left out", async () => {
    mockCarsList(
      { data: [CAR_A, CAR_B], error: null },
      {
        maintenanceItems: {
          data: [
            dateItem("ok", "car-a", "Brake check", "2026-09-01"),
            kmItem("soon", "car-b", "Toyota oil", 10000), // due at 15,000; car B is at 14,800
            dateItem("late", "car-a", "Vehicle inspection", "2025-10-01"), // due 1 Oct: overdue
          ],
          error: null,
        },
        readings: { data: [reading("car-a", 88000), reading("car-b", 14800)], error: null },
      },
    );
    renderDashboard();

    await within(await screen.findByRole("region", { name: "Maintenance due" })).findByText("Vehicle inspection");
    const links = within(card()).getAllByRole("link").filter((link) => link.classList.contains("dashboard-maintenance__item"));
    expect(links.map((link) => link.textContent)).toEqual([
      "OverdueVehicle inspection2005 Mercedes-Benz C23018 days overdue",
      "Due soonToyota oil2020 Toyota Corolla200 km left",
    ]);
    expect(links[0]).toHaveAttribute("href", "/maintenance?car=car-a#maintenance-item-late");
    expect(links[1]).toHaveAttribute("href", "/maintenance?car=car-b#maintenance-item-soon");
    expect(within(card()).queryByText("Brake check")).not.toBeInTheDocument();
  });

  it("never uses one car's reading for another car's item", async () => {
    // The km item is on car B, which has NO reading; car A's 88,000 km must not be used.
    mockCarsList(
      { data: [CAR_A, CAR_B], error: null },
      { maintenanceItems: { data: [kmItem("b1", "car-b", "Toyota oil", 84000)], error: null }, readings: { data: [reading("car-a", 88900)], error: null } },
    );
    renderDashboard();

    expect(await within(await screen.findByRole("region", { name: "Maintenance due" })).findByText(/1 item needs an odometer reading/)).toBeInTheDocument();
    expect(within(card()).queryByText("Toyota oil")).not.toBeInTheDocument();
  });

  it("shows at most five, with a count of the rest", async () => {
    const items = Array.from({ length: 7 }, (_, index) => dateItem(`d${index}`, "car-a", `Item ${index}`, "2025-09-01"));
    mockCarsList({ data: [CAR_A], error: null }, { maintenanceItems: { data: items, error: null } });
    renderDashboard();

    expect(await within(await screen.findByRole("region", { name: "Maintenance due" })).findByText(/And 2 more in/)).toBeInTheDocument();
    expect(within(card()).getAllByRole("link").filter((link) => link.classList.contains("dashboard-maintenance__item"))).toHaveLength(5);
  });

  it("shows a plain message if maintenance can't be loaded", async () => {
    mockCarsList({ data: [CAR_A], error: null }, { maintenanceItems: { data: null, error: { message: 'relation "maintenance_items" does not exist' } } });
    renderDashboard();

    const message = await within(await screen.findByRole("region", { name: "Maintenance due" })).findByText(/Couldn't load your maintenance/);
    expect(message).not.toHaveTextContent(/relation/);
  });
});

describe("DashboardPage — All cars, this month (CAR-64)", () => {
  const CAR_A = { id: "car-a", make: "Mercedes-Benz", model: "C230", year: 2005, user_id: "user-123" };
  const CAR_B = { id: "car-b", make: "Toyota", model: "Corolla", year: 2020, user_id: "user-123" };
  const fill = (carId, date, amount, currency = "USD") => ({ id: `f-${carId}-${date}`, car_id: carId, filled_at: date, created_at: `${date}T09:00:00Z`, liters: 30, odometer_km: null, cost_amount: String(amount), cost_currency: currency });
  const expense = (carId, date, amount, currency = "USD") => ({ id: `e-${carId}-${date}`, car_id: carId, spent_on: date, category: "parking", amount: String(amount), currency });
  const tile = () => screen.getByRole("region", { name: "All cars, this month" });

  function renderWithSwitch() {
    window.localStorage.clear();
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider>
          <CurrencyProvider>
            <CurrencyToggle />
            <Routes>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Routes>
          </CurrencyProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T09:00:00Z")); // October 2026 in Beirut
    window.localStorage.clear(); // the saved USD | LBP choice must not leak between tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sums fuel and other costs across ALL cars for this month, mixed currencies, and follows the switch", async () => {
    mockCarsList(
      { data: [CAR_A, CAR_B], error: null },
      {
        // car A fuel $30, car B fuel 2,691,000 LBP ($30), September fuel ignored;
        // car A parking $5, car B parking 448,500 LBP ($5) => $70.00 across both cars.
        readings: { data: [fill("car-a", "2026-10-02", 30), fill("car-b", "2026-10-31", 2_691_000, "LBP"), fill("car-a", "2026-09-30", 500)], error: null },
        expenses: { data: [expense("car-a", "2026-10-01", 5), expense("car-b", "2026-10-09", 448_500, "LBP")], error: null },
      },
    );
    renderWithSwitch();

    await within(await screen.findByRole("region", { name: "All cars, this month" })).findByText("spent on all your cars this month");
    expect(within(tile()).getByRole("heading")).toHaveTextContent("This month, all cars (October 2026)");
    const total = () => tile().querySelector(".dashboard-stat-tile__value").textContent;
    expect(total()).toBe("$70.00 (6,279,000 LBP)");
    expect(tile().querySelector(".dashboard-costs__split").textContent).toBe("Fuel$60.00 (5,382,000 LBP)Other costs$10.00 (897,000 LBP)");

    await userEvent.setup().click(screen.getByRole("button", { name: "LBP" }));
    expect(total()).toBe("6,279,000 LBP ($70.00)");
  });

  it("asks only for the caller's own fill-ups and expenses", async () => {
    const { maintenanceFilters } = mockCarsList({ data: [CAR_A], error: null });
    renderDashboard();
    await within(await screen.findByRole("region", { name: "All cars, this month" })).findByText(/Nothing logged for October 2026 yet/);

    expect(maintenanceFilters).toEqual(expect.arrayContaining([["car_expenses", "user_id", "user-123"], ["fuel_logs", "user_id", "user-123"]]));
  });

  it("has a friendly empty state (no fake $0.00) when nothing was logged this month", async () => {
    mockCarsList({ data: [CAR_A], error: null }, { readings: { data: [fill("car-a", "2026-09-30", 40)], error: null } });
    renderDashboard();

    const empty = await within(await screen.findByRole("region", { name: "All cars, this month" })).findByText(/Nothing logged for October 2026 yet/);
    expect(within(empty).getByRole("link", { name: "Expenses" })).toHaveAttribute("href", "/expenses");
    expect(within(tile()).queryByText(/\$0\.00|NaN/)).not.toBeInTheDocument();
  });

  it("says 'none logged' for the side that has nothing, not a zero", async () => {
    mockCarsList({ data: [CAR_A], error: null }, { expenses: { data: [expense("car-a", "2026-10-03", 12)], error: null } });
    renderDashboard();

    await within(await screen.findByRole("region", { name: "All cars, this month" })).findByText("spent on all your cars this month");
    expect(tile().querySelector(".dashboard-costs__split").textContent).toBe("Fuelnone loggedOther costs$12.00 (1,076,400 LBP)");
  });

  it("shows a plain message if the costs can't be loaded", async () => {
    mockCarsList({ data: [CAR_A], error: null }, { expenses: { data: null, error: { message: 'relation "car_expenses" does not exist' } } });
    renderDashboard();

    const message = await within(await screen.findByRole("region", { name: "All cars, this month" })).findByText(/Couldn't load this month's costs/);
    expect(message).not.toHaveTextContent(/relation/);
  });
});
