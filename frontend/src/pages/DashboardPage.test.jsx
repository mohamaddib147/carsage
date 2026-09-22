// Tests for the Dashboard / Home screen: the empty state (no car yet),
// showing the user's saved car(s), "Add Another Car" routing to Car
// Onboarding, and the two Trip Planner / AI Advisor module cards.

import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
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
function mockCarsList(carsResult, { diyMessages = { data: [], error: null }, issueRow = { data: null, error: null } } = {}) {
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
    throw new Error(`mockCarsList: unexpected table "${table}"`);
  });

  return { select, eq, order, advisorBuilder };
}

function renderDashboard() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
          <Route path="/cars/:carId" element={<p>Car profile placeholder</p>} />
          <Route path="/trip-planner" element={<p>Trip planner placeholder</p>} />
          <Route path="/advisor" element={<p>AI advisor placeholder</p>} />
        </Routes>
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

  it("falls back to the empty state without crashing if loading the cars fails", async () => {
    mockCarsList({ data: null, error: { message: "network error" } });

    renderDashboard();

    expect(
      await screen.findByText("You haven't added a car yet."),
    ).toBeInTheDocument();
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
