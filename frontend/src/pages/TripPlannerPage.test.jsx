// Tests for the Trip Planner screen: the empty state (no car yet),
// required-destination validation, a successful trip (loading state +
// results card), the clear-error case when the backend rejects the
// trip, that Starting Location really is optional, and the CAR-37 car
// selector (hidden with 0-1 cars, shown and switchable with 2+).

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripPlannerPage from "./TripPlannerPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { apiFetch } from "../lib/apiClient.js";

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };
const SESSION = { user: LOGGED_IN_USER, access_token: "test-access-token" };

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

vi.mock("../lib/apiClient.js", () => ({
  apiFetch: vi.fn(),
}));

/** Wires supabase.from("cars").select().eq().order() to resolve to the
 * given list of the user's cars (CAR-37 loads all of them, not just one). */
function mockCarsLookup(carsArray) {
  const order = vi.fn().mockResolvedValue({ data: carsArray, error: null });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  supabase.from.mockReturnValue({ select });
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/trip-planner"]}>
      <AuthProvider>
        <Routes>
          <Route path="/trip-planner" element={<TripPlannerPage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
});

describe("TripPlannerPage — no car yet", () => {
  it("shows an empty state linking to Car Onboarding (edge case)", async () => {
    mockCarsLookup([]);

    renderPage();

    expect(
      await screen.findByText(/Add a car before planning a trip/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Add Your Car" });
    expect(link).toHaveAttribute("href", "/cars/new");
  });
});

describe("TripPlannerPage — planning a trip", () => {
  it("requires a destination before submitting (invalid input case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Plan Trip" }));

    expect(
      await screen.findByText("Destination is required."),
    ).toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("shows a loading state, then the results card, on a successful trip (normal case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);

    let resolveFetch;
    apiFetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    renderPage();
    await user.type(
      await screen.findByLabelText("Destination *"),
      "Tripoli, Lebanon",
    );
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    expect(screen.getByRole("button", { name: "Planning..." })).toBeDisabled();

    resolveFetch({
      distance_km: 81.9,
      duration_min: 79,
      duration_in_traffic_min: 92,
      fuel_price_used_lbp: 86950,
      estimated_cost_lbp: 569696,
      estimated_cost_usd: 6.4,
    });

    expect(await screen.findByText("$6.40 (569,696 LBP)")).toBeInTheDocument();
    expect(screen.getByText("92 min")).toBeInTheDocument();
    expect(screen.getByText("81.9 km")).toBeInTheDocument();
  });

  it("submits without a Starting Location, since it's optional", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    apiFetch.mockResolvedValue({
      distance_km: 10,
      duration_min: 10,
      duration_in_traffic_min: 12,
      fuel_price_used_lbp: 90000,
      estimated_cost_lbp: 50000,
      estimated_cost_usd: 0.56,
    });

    renderPage();
    await user.type(
      await screen.findByLabelText("Destination *"),
      "Byblos, Lebanon",
    );
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith(
      "/trip-planner/estimate",
      expect.objectContaining({
        accessToken: "test-access-token",
        body: expect.objectContaining({
          car_id: "car-1",
          destination: "Byblos, Lebanon",
          origin: undefined,
        }),
      }),
    );
  });

  it("shows a clear error message when the trip can't be planned", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    apiFetch.mockRejectedValue(
      new Error(
        "Could not find a route between that origin and destination. Check that both addresses are valid.",
      ),
    );

    renderPage();
    await user.type(
      await screen.findByLabelText("Destination *"),
      "???",
    );
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not find a route between that origin and destination.",
    );
    expect(screen.queryByText("Fuel Cost")).not.toBeInTheDocument();
  });
});

describe("TripPlannerPage — car selector (CAR-37)", () => {
  it("does not show a selector with only one car (normal case)", async () => {
    mockCarsLookup([{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020 }]);

    renderPage();

    await screen.findByLabelText("Destination *");
    expect(screen.queryByLabelText("Car")).not.toBeInTheDocument();
  });

  it("shows a selector defaulting to the first car when there are multiple (normal case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([
      { id: "car-1", make: "Toyota", model: "Corolla", year: 2020 },
      { id: "car-2", make: "Mercedes-Benz", model: "C230", year: 2005 },
    ]);
    apiFetch.mockResolvedValue({
      distance_km: 10,
      duration_min: 10,
      duration_in_traffic_min: 12,
      fuel_price_used_lbp: 90000,
      estimated_cost_lbp: 50000,
      estimated_cost_usd: 0.56,
    });

    renderPage();
    const carSelect = await screen.findByLabelText("Car");
    expect(carSelect).toHaveValue("car-1");

    await user.selectOptions(carSelect, "car-2");
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith(
      "/trip-planner/estimate",
      expect.objectContaining({
        body: expect.objectContaining({ car_id: "car-2" }),
      }),
    );
  });
});
