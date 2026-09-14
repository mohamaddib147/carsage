// Tests for the Dashboard / Home screen: the empty state (no car yet),
// showing the user's saved car(s), "Add Another Car" routing to Car
// Onboarding, and the two Trip Planner / AI Advisor module cards.

import { render, screen } from "@testing-library/react";
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

/** Wires supabase.from("cars").select().eq().order() to resolve `result`. */
function mockCarsList(result) {
  const order = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  supabase.from.mockReturnValue({ select });
  return { select, eq, order };
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
  it("shows exactly two module cards, linking to Trip Planner and AI Advisor", async () => {
    mockCarsList({ data: [], error: null });

    renderDashboard();
    await screen.findByText("You haven't added a car yet.");

    const tripPlannerLink = screen.getByRole("link", { name: /Trip Planner/ });
    const advisorLink = screen.getByRole("link", { name: /AI Advisor/ });
    expect(tripPlannerLink).toHaveAttribute("href", "/trip-planner");
    expect(advisorLink).toHaveAttribute("href", "/advisor");
  });
});
