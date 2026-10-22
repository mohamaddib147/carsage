// Tests for the Dashboard / Home screen: the empty state (no car yet),
// showing the user's saved car(s), "Add Another Car" routing to Car
// Onboarding, and the two Trip Planner / AI Advisor module cards.

import { act, render, screen, within } from "@testing-library/react";
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

describe("DashboardPage — vehicle summary", () => {
  it("shows an empty state prompting onboarding when the user has no car (edge case)", async () => {
    mockCarsList({ data: [], error: null });

    renderDashboard();

    expect(
      await screen.findByText("You haven't added a car yet."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Add Your Car" });
    expect(link).toHaveAttribute("href", "/cars/new");
  });

  it("shows the user's saved car with an Add Another Car link to Car Onboarding (normal case)", async () => {
    mockCarsList({
      data: [{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020 }],
      error: null,
    });

    renderDashboard();

    expect(await screen.findByText("2020 Toyota Corolla")).toBeInTheDocument();
    const addAnother = screen.getByRole("link", { name: "Add Another Car" });
    expect(addAnother).toHaveAttribute("href", "/cars/new");
  });

  it("lists more than one saved car if present", async () => {
    mockCarsList({
      data: [
        { id: "car-1", make: "Toyota", model: "Corolla", year: 2020 },
        { id: "car-2", make: "Honda", model: "Civic", year: 2019 },
      ],
      error: null,
    });

    renderDashboard();

    expect(await screen.findByText("2020 Toyota Corolla")).toBeInTheDocument();
    expect(screen.getByText("2019 Honda Civic")).toBeInTheDocument();
  });

  it("shows a brand badge next to a recognized make, and none for an unrecognized one (CAR-55)", async () => {
    mockCarsList({
      data: [
        { id: "car-1", make: "Ferrari", model: "488 GTB", year: 2019 },
        { id: "car-2", make: "Yugo", model: "45", year: 1985 },
      ],
      error: null,
    });

    renderDashboard();

    expect(await screen.findByLabelText("Ferrari brand badge")).toBeInTheDocument();
    expect(screen.getByText("2019 Ferrari 488 GTB")).toBeInTheDocument();
    expect(screen.getByText("1985 Yugo 45")).toBeInTheDocument();
    expect(screen.queryByLabelText("Yugo brand badge")).not.toBeInTheDocument();
  });

  // CAR-74 follow-up: a failed lookup used to be shown as "no car yet", which is wrong and has no way out.
  it("shows an error, not the empty state, if loading the cars fails (details in the failure tests below)", async () => {
    mockCarsList({ data: null, error: { message: "network error" } });

    renderDashboard();

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your cars.");
    expect(screen.queryByText("You haven't added a car yet.")).not.toBeInTheDocument();
  });
});

describe("DashboardPage — quick access", () => {
  it("shows the three module cards, linking to Trip Planner, AI Advisor and the Fuel Log (CAR-53)", async () => {
    mockCarsList({ data: [], error: null });

    renderDashboard();
    await screen.findByText("You haven't added a car yet.");

    // Scoped to the Quick Access section: the DIY empty state (a different
    // section, shown here since there's no feedback yet) also links to "AI Advisor".
    const quickAccess = within(screen.getByRole("heading", { name: "Quick Access" }).closest("section"));
    expect(quickAccess.getByRole("link", { name: /Trip Planner/ })).toHaveAttribute("href", "/trip-planner");
    expect(quickAccess.getByRole("link", { name: /AI Advisor/ })).toHaveAttribute("href", "/advisor");
    expect(quickAccess.getByRole("link", { name: /Fuel Log/ })).toHaveAttribute("href", "/fuel-log");
  });
});

describe("DashboardPage — specs summary on each car", () => {
  const FULL_CAR = {
    id: "car-1",
    make: "Mercedes-Benz",
    model: "C230 Kompressor",
    year: 2005,
    engine_type: "1.8L Inline-4",
    fuel_type: "Gasoline",
    license_plate: "B 123456",
    fuel_efficiency: 9.5,
    cylinders: 4,
    drivetrain: "rwd",
    transmission: "Automatic",
    fuel_tank_capacity_liters: 62,
  };

  it("shows the saved specs with units next to the car's name (normal case)", async () => {
    mockCarsList({ data: [FULL_CAR], error: null });

    renderDashboard();

    const specs = await screen.findByLabelText("Mercedes-Benz C230 Kompressor specifications");
    expect(specs).toHaveTextContent("Efficiency9.5 km/L");
    expect(specs).toHaveTextContent("Cylinders4");
    expect(specs).toHaveTextContent("Drivetrainrwd");
    expect(specs).toHaveTextContent("TransmissionAutomatic");
    expect(specs).toHaveTextContent("Fuel tank62 L");
    // the existing meta line is still there
    expect(screen.getByText("1.8L Inline-4 • Gasoline • B 123456")).toBeInTheDocument();
  });

  it("shows only the specs that are set — no blanks or dashes (edge case)", async () => {
    mockCarsList({
      data: [{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020, cylinders: 4, fuel_tank_capacity_liters: 50 }],
      error: null,
    });

    renderDashboard();

    const specs = await screen.findByLabelText("Toyota Corolla specifications");
    expect(specs).toHaveTextContent("Cylinders4");
    expect(specs).toHaveTextContent("Fuel tank50 L");
    expect(specs).not.toHaveTextContent(/Efficiency|Drivetrain|Transmission|—/);
  });

  it("formats numbers that arrive as strings (Postgres numeric) without extra zeros", async () => {
    mockCarsList({
      data: [{ id: "car-1", make: "Honda", model: "Civic", year: 2019, fuel_efficiency: "11.50", fuel_tank_capacity_liters: "47.0" }],
      error: null,
    });

    renderDashboard();

    const specs = await screen.findByLabelText("Honda Civic specifications");
    expect(specs).toHaveTextContent("Efficiency11.5 km/L");
    expect(specs).toHaveTextContent("Fuel tank47 L");
  });

  it("keeps each car's specs on its own card, never mixing them", async () => {
    mockCarsList({
      data: [
        { id: "car-1", make: "Toyota", model: "Corolla", year: 2020, cylinders: 4 },
        { id: "car-2", make: "Ford", model: "Mustang", year: 2018, cylinders: 8 },
      ],
      error: null,
    });

    renderDashboard();

    expect(await screen.findByLabelText("Toyota Corolla specifications")).toHaveTextContent("Cylinders4");
    expect(screen.getByLabelText("Ford Mustang specifications")).toHaveTextContent("Cylinders8");
  });

  it("points a car with no specs at its profile instead of leaving the card bare (edge case)", async () => {
    mockCarsList({ data: [{ id: "car-9", make: "Kia", model: "Rio", year: 2016 }], error: null });

    renderDashboard();

    const hint = await screen.findByRole("link", { name: "car profile" });
    expect(hint).toHaveAttribute("href", "/cars/car-9");
    expect(screen.queryByLabelText("Kia Rio specifications")).not.toBeInTheDocument();
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
    expect(within(tile()).getByRole("heading")).toHaveTextContent("All cars, this month (October 2026)");
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

describe("DashboardPage — the car list fails to load, or is empty (CAR-74 follow-up)", () => {
  const ONE_CAR = { data: [{ id: "car-1", make: "Honda", model: "CR-V", year: 2018 }], error: null };

  // Each way the request can fail. The first three come back as { error } (what supabase-js does for a network
  // failure, an expired or missing token, and a server fault); the last is a request that THROWS.
  const FAILURES = [
    ["a network error (status 0)", { kind: "reply", reply: { data: null, error: { message: "TypeError: Failed to fetch" }, status: 0 } }],
    ["a 401 (token expired or missing)", { kind: "reply", reply: { data: null, error: { code: "PGRST301", message: "JWT expired" }, status: 401 } }],
    ["a 500 (server fault)", { kind: "reply", reply: { data: null, error: { code: "XX000", message: "internal error" }, status: 500 } }],
    ["a request that throws", { kind: "throw" }],
  ];

  /** Mocks the car list to fail the given way, and returns the mock so a test can change the next answer. */
  function mockFailure(failure) {
    const mocks = mockCarsList({ data: [], error: null });
    if (failure.kind === "throw") mocks.order.mockRejectedValue(new TypeError("Failed to fetch"));
    else mocks.order.mockResolvedValue(failure.reply);
    return mocks;
  }

  describe.each(FAILURES)("when the request fails with %s", (_label, failure) => {
    it("shows a clear error with a Try again button, not 'no car yet', and the sections below are shown", async () => {
      mockFailure(failure);
      renderDashboard();
    const container = document.body;

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Couldn't load your cars. Check your connection and try again.");
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      expect(screen.queryByText("You haven't added a car yet.")).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Add Your Car" })).not.toBeInTheDocument();
      // Nothing from the server's reply is shown.
      expect(alert.textContent).not.toMatch(/JWT|PGRST|internal error|Failed to fetch/);

      // The sections below "Your Cars" are hidden by CSS only while the car list is a skeleton: it must be gone.
      expect(container.querySelector(".dashboard-car-card--skeleton")).not.toBeInTheDocument();
      expect(screen.queryByText("Loading your cars...")).not.toBeInTheDocument();
      for (const name of ["All cars, this month", "Maintenance due", "DIY suggestion success rate"]) {
        expect(screen.getByRole("region", { name })).toBeInTheDocument();
      }
      expect(screen.getByRole("heading", { name: "Quick Access" })).toBeInTheDocument();
    });

    it("Try again after the server recovers shows the cars", async () => {
      const user = userEvent.setup();
      const mocks = mockFailure(failure);
      renderDashboard();
      const retry = await screen.findByRole("button", { name: "Try again" });

      mocks.order.mockReset();
      mocks.order.mockResolvedValue(ONE_CAR);
      await user.click(retry);

      expect(await screen.findByText(/CR-V/)).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
      expect(mocks.order).toHaveBeenCalledTimes(1);
    });

    it("if it fails again, the error and the button are still there to try once more", async () => {
      const user = userEvent.setup();
      const mocks = mockFailure(failure);
      renderDashboard();
      await user.click(await screen.findByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      expect(mocks.order).toHaveBeenCalledTimes(2);
    });
  });

  it("while the request is out the sections stay behind the skeleton; when it fails they are released", async () => {
    const mocks = mockCarsList({ data: [], error: null });
    let fail;
    mocks.order.mockReturnValue(new Promise((resolve) => { fail = resolve; }));
    renderDashboard();
    const container = document.body;

    expect(await screen.findByText("Loading your cars...")).toBeInTheDocument();
    expect(container.querySelector(".dashboard-car-card--skeleton")).toBeInTheDocument();
    expect(container.querySelector(".dashboard-car-list--waiting")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => fail({ data: null, error: { message: "boom" }, status: 500 }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(container.querySelector(".dashboard-car-card--skeleton")).not.toBeInTheDocument();
  });

  it("a request that stays out (quiet retries on a bad connection) releases the sections after 1.5 s, still showing the skeleton, and ends in the error", async () => {
    const mocks = mockCarsList({ data: [], error: null });
    let fail;
    mocks.order.mockReturnValue(new Promise((resolve) => { fail = resolve; }));
    renderDashboard();
    await screen.findByText("Loading your cars...");
    const list = () => document.querySelector(".dashboard-car-list");

    // At first the sections below are held back (the layout-shift protection)...
    expect(list()).toHaveClass("dashboard-car-list--waiting");
    await act(() => new Promise((resolve) => setTimeout(resolve, 1000)));
    expect(list()).toHaveClass("dashboard-car-list--waiting");

    // ...but only briefly: past 1.5 s they are released although the list is still loading.
    await act(() => new Promise((resolve) => setTimeout(resolve, 700)));
    expect(list()).not.toHaveClass("dashboard-car-list--waiting");
    expect(screen.getByText("Loading your cars...")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await act(async () => fail({ data: null, error: { message: "boom" }, status: 0 }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.querySelector(".dashboard-car-list--waiting")).not.toBeInTheDocument();
  });

  it("no cars (a good reply with an empty list) is not an error: the 'add your first car' prompt, no alert, no Try again", async () => {
    mockCarsList({ data: [], error: null, status: 200 });
    renderDashboard();
    const container = document.body;

    expect(await screen.findByText("You haven't added a car yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add Your Car" })).toHaveAttribute("href", "/cars/new");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(container.querySelector(".dashboard-car-card--skeleton")).not.toBeInTheDocument();
  });
});
