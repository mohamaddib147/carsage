// Tests for the Trip Planner screen: the empty state (no car yet),
// required-destination validation, a successful trip (loading state +
// results card), the clear-error case when the backend rejects the
// trip, that Starting Location really is optional, the CAR-37 car
// selector (hidden with 0-1 cars, shown and switchable with 2+), CAR-41
// (editable fuel price prefilled from GET /trip-planner/fuel-prices,
// sent as an override; the Full Tank Cost stat), and CAR-42 (light vs
// current-traffic fuel cost estimates + the explainer text — shown only
// when the response includes the new fields, so older-shaped responses
// degrade to the original single "Fuel Cost" stat), and CAR-49 (the Tank
// Size field/Full Tank Cost use the selected car's own
// fuel_tank_capacity_liters — no hardcoded default; switching cars
// changes it; a car with no tank size gets a clear "not set" message).
//
// apiFetch now fires twice per successful flow (a GET for fuel prices
// on mount, then the POST estimate on submit) — tests that don't care
// about the prefill just let both resolve to the same mocked value,
// which is harmless (the fuel-prices prefill effect no-ops on a
// response shape it doesn't recognize); tests that DO care about the
// prefill/override behavior mock each path distinctly via mockApiFetch.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/** Routes apiFetch by path: GET /trip-planner/fuel-prices resolves to
 * `fuelPrices`, POST /trip-planner/estimate resolves to `estimate` (or
 * rejects with `error` if given). Use when a test cares about the two
 * calls behaving differently, rather than a single blanket mock. */
function mockApiFetch({ fuelPrices, estimate, error } = {}) {
  apiFetch.mockImplementation((path) => {
    if (path === "/trip-planner/fuel-prices") {
      return Promise.resolve(fuelPrices ?? { prices: {}, lbp_per_usd: 89000 });
    }
    if (path === "/trip-planner/estimate") {
      return error ? Promise.reject(error) : Promise.resolve(estimate);
    }
    return Promise.reject(new Error(`mockApiFetch: unexpected path "${path}"`));
  });
}

const ESTIMATE_90K = {
  distance_km: 10,
  duration_min: 10,
  duration_in_traffic_min: 10,
  fuel_price_used_lbp: 90000,
  estimated_cost_lbp: 50000,
  estimated_cost_usd: 0.56,
};

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
    // apiFetch may still have fired for the on-mount fuel-prices prefill
    // (CAR-41) — what matters is the estimate itself was never submitted.
    expect(apiFetch).not.toHaveBeenCalledWith(
      "/trip-planner/estimate",
      expect.anything(),
    );
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

describe("TripPlannerPage — editable fuel price & tank cost (CAR-41)", () => {
  it("prefills the fuel price from the current default for the car's fuel grade (normal case)", async () => {
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({
      fuelPrices: {
        prices: { "95_octane": { lbp_per_liter: 91000, usd_per_liter: 1.02 } },
        lbp_per_usd: 89000,
      },
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByLabelText(/Fuel Price/)).toHaveValue(91000),
    );
  });

  it("sends a manually-edited fuel price as the override instead of the prefilled default", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({
      fuelPrices: {
        prices: { "95_octane": { lbp_per_liter: 91000, usd_per_liter: 1.02 } },
        lbp_per_usd: 89000,
      },
      estimate: {
        distance_km: 10,
        duration_min: 10,
        duration_in_traffic_min: 10,
        fuel_price_used_lbp: 100000,
        estimated_cost_lbp: 50000,
        estimated_cost_usd: 0.56,
      },
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Fuel Price/)).toHaveValue(91000));

    const fuelPriceInput = screen.getByLabelText(/Fuel Price/);
    await user.clear(fuelPriceInput);
    await user.type(fuelPriceInput, "100000");
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/trip-planner/estimate",
        expect.objectContaining({
          body: expect.objectContaining({ fuel_price_per_liter_lbp: 100000 }),
        }),
      ),
    );
  });

  it("shows the full tank cost using the car's own tank size (normal case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: 45 }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await user.type(
      await screen.findByLabelText("Destination *"),
      "Byblos, Lebanon",
    );
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    // 45L * 90000 LBP/L = 4,050,000 LBP.
    expect(await screen.findByText("$45.51 (4,050,000 LBP)")).toBeInTheDocument();
  });

  it("recalculates the full tank cost when the tank size is edited", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({
      estimate: {
        distance_km: 10,
        duration_min: 10,
        duration_in_traffic_min: 10,
        fuel_price_used_lbp: 90000,
        estimated_cost_lbp: 50000,
        estimated_cost_usd: 0.56,
      },
    });

    renderPage();
    const tankInput = await screen.findByLabelText(/Tank Size/);
    await user.clear(tankInput);
    await user.type(tankInput, "40");
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    // 40L * 90000 LBP/L = 3,600,000 LBP.
    expect(await screen.findByText("$40.45 (3,600,000 LBP)")).toBeInTheDocument();
  });
});

describe("TripPlannerPage — light vs current-traffic estimates (CAR-42)", () => {
  it("shows both estimates with an explanation when the response includes them (normal case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({
      estimate: {
        distance_km: 100,
        duration_min: 60,
        duration_in_traffic_min: 90,
        fuel_price_used_lbp: 90000,
        estimated_cost_lbp: 900000,
        estimated_cost_usd: 10.11,
        estimated_cost_current_traffic_lbp: 967500,
        estimated_cost_current_traffic_usd: 10.87,
      },
    });

    renderPage();
    await user.type(
      await screen.findByLabelText("Destination *"),
      "Tripoli, Lebanon",
    );
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    expect(await screen.findByText("Fuel Cost (Light Traffic)")).toBeInTheDocument();
    expect(screen.getByText("Fuel Cost (Current Traffic)")).toBeInTheDocument();
    expect(screen.getByText("$10.11 (900,000 LBP)")).toBeInTheDocument();
    expect(screen.getByText("$10.87 (967,500 LBP)")).toBeInTheDocument();
    expect(
      screen.getByText(/Heavy traffic means more stop-and-go driving/),
    ).toBeInTheDocument();
  });

  it("falls back to a single plain Fuel Cost stat when the response has no traffic comparison (edge case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({
      estimate: {
        distance_km: 10,
        duration_min: 10,
        duration_in_traffic_min: 12,
        fuel_price_used_lbp: 90000,
        estimated_cost_lbp: 50000,
        estimated_cost_usd: 0.56,
      },
    });

    renderPage();
    await user.type(
      await screen.findByLabelText("Destination *"),
      "Byblos, Lebanon",
    );
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    expect(await screen.findByText("Fuel Cost")).toBeInTheDocument();
    expect(screen.queryByText(/Light Traffic/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Current Traffic/)).not.toBeInTheDocument();
  });
});

describe("TripPlannerPage — ideal-conditions info tooltip (CAR-45)", () => {
  it("explains the estimate assumes ideal conditions, next to the fuel cost", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({
      estimate: {
        distance_km: 10,
        duration_min: 10,
        duration_in_traffic_min: 10,
        fuel_price_used_lbp: 90000,
        estimated_cost_lbp: 50000,
        estimated_cost_usd: 0.56,
      },
    });

    renderPage();
    await user.type(await screen.findByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    const info = await screen.findByRole("button", {
      name: "About this fuel cost estimate",
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    await user.hover(info);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      /rated fuel efficiency under ideal conditions/,
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(/heavy traffic/);
  });
});

describe("TripPlannerPage — traffic level indicator (CAR-46)", () => {
  it.each([
    [60, 62, "Light Traffic"],
    [60, 72, "Moderate Traffic"],
    [60, 90, "Heavy Traffic"],
  ])(
    "shows the right label for %i min baseline vs %i min in traffic",
    async (baseline, inTraffic, expectedLabel) => {
      const user = userEvent.setup();
      mockCarsLookup([{ id: "car-1" }]);
      mockApiFetch({
        estimate: {
          distance_km: 10,
          duration_min: baseline,
          duration_in_traffic_min: inTraffic,
          fuel_price_used_lbp: 90000,
          estimated_cost_lbp: 50000,
          estimated_cost_usd: 0.56,
        },
      });

      renderPage();
      await user.type(await screen.findByLabelText("Destination *"), "Byblos, Lebanon");
      await user.click(screen.getByRole("button", { name: "Plan Trip" }));

      const badge = await screen.findByText(expectedLabel);
      expect(badge).toHaveClass(
        `traffic-badge--${expectedLabel.split(" ")[0].toLowerCase()}`,
      );
    },
  );
});


describe("TripPlannerPage — address autocomplete (CAR-47)", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          suggestions: [
            { placePrediction: { text: { text: "Tripoli, North Governorate, Lebanon" } } },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the full address of a picked suggestion into the existing estimate call", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({
      estimate: {
        distance_km: 10,
        duration_min: 10,
        duration_in_traffic_min: 10,
        fuel_price_used_lbp: 90000,
        estimated_cost_lbp: 50000,
        estimated_cost_usd: 0.56,
      },
    });

    renderPage();
    await user.type(await screen.findByLabelText("Destination *"), "Trip");
    await user.click(
      await screen.findByRole("option", { name: "Tripoli, North Governorate, Lebanon" }),
    );
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/trip-planner/estimate",
        expect.objectContaining({
          body: expect.objectContaining({
            destination: "Tripoli, North Governorate, Lebanon",
          }),
        }),
      ),
    );
  });

  it("still submits a hand-typed destination when no suggestion is picked", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({
      estimate: {
        distance_km: 10,
        duration_min: 10,
        duration_in_traffic_min: 10,
        fuel_price_used_lbp: 90000,
        estimated_cost_lbp: 50000,
        estimated_cost_usd: 0.56,
      },
    });

    renderPage();
    await user.type(await screen.findByLabelText("Destination *"), "My cousin's house");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/trip-planner/estimate",
        expect.objectContaining({
          body: expect.objectContaining({ destination: "My cousin's house" }),
        }),
      ),
    );
  });
});

describe("TripPlannerPage — static route map (CAR-48)", () => {
  const ESTIMATE = {
    distance_km: 10,
    duration_min: 10,
    duration_in_traffic_min: 10,
    fuel_price_used_lbp: 90000,
    estimated_cost_lbp: 50000,
    estimated_cost_usd: 0.56,
    route_polyline: "_p~iF~ps|U_ulLnnqC",
  };

  async function planTrip(user, estimate = ESTIMATE) {
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({ estimate });
    renderPage();
    await user.type(await screen.findByLabelText(/Starting Location/), "Beirut, Lebanon");
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));
    await screen.findByText(/Fuel Cost/);
  }

  beforeEach(() => {
    // Autocomplete also uses fetch; return no suggestions so it stays quiet.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("shows a map of the submitted route above the results when a key is configured", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    const user = userEvent.setup();

    await planTrip(user);

    const map = await screen.findByTestId("route-map");
    const src = new URL(map.querySelector("img").getAttribute("src"));
    expect(src.searchParams.getAll("markers").join(" ")).toContain("Beirut, Lebanon");
    expect(src.searchParams.getAll("markers").join(" ")).toContain("Byblos, Lebanon");
  });

  it("draws the real driving route from the estimate's polyline, not a straight line", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    const user = userEvent.setup();

    await planTrip(user);

    const src = new URL((await screen.findByTestId("route-map")).querySelector("img").getAttribute("src"));
    expect(src.searchParams.get("path")).toBe("color:0x00594Cff|weight:4|enc:_p~iF~ps|U_ulLnnqC");
    expect(src.searchParams.get("path")).not.toContain("Beirut");
  });

  it("shows markers only (no line) when the estimate has no polyline", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    const user = userEvent.setup();

    await planTrip(user, { ...ESTIMATE, route_polyline: null });

    const src = new URL((await screen.findByTestId("route-map")).querySelector("img").getAttribute("src"));
    expect(src.searchParams.get("path")).toBeNull();
    expect(src.searchParams.getAll("markers")).toHaveLength(2);
  });

  it("keeps the map on the submitted route while the fields are edited afterwards", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    const user = userEvent.setup();
    await planTrip(user);

    await user.type(screen.getByLabelText("Destination *"), " Castle");

    const src = screen.getByTestId("route-map").querySelector("img").getAttribute("src");
    expect(decodeURIComponent(src)).not.toContain("Castle");
  });

  it("shows no map without a key, and the results are unaffected", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");
    const user = userEvent.setup();

    await planTrip(user);

    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
    expect(screen.getByText(/Fuel Cost/)).toBeInTheDocument();
  });

  it("hides the map if the image fails to load but keeps the results", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    const user = userEvent.setup();
    await planTrip(user);

    fireEvent.error((await screen.findByTestId("route-map")).querySelector("img"));

    expect(screen.queryByTestId("route-map")).not.toBeInTheDocument();
    expect(screen.getByText(/Fuel Cost/)).toBeInTheDocument();
  });
});

describe("TripPlannerPage — per-car tank capacity (CAR-49)", () => {
  async function planTrip(user) {
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));
  }

  it("prefills the Tank Size field with the selected car's capacity", async () => {
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: 52 }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue(52));
  });

  it("changes the tank size and full tank cost when switching between cars with different capacities", async () => {
    const user = userEvent.setup();
    mockCarsLookup([
      { id: "car-1", make: "Toyota", model: "Corolla", year: 2020, fuel_tank_capacity_liters: 40 },
      { id: "car-2", make: "Nissan", model: "Patrol", year: 2018, fuel_tank_capacity_liters: 55 },
    ]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue(40));
    await planTrip(user);
    // 40L * 90000 = 3,600,000 LBP.
    expect(await screen.findByText("$40.45 (3,600,000 LBP)")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    expect(screen.getByLabelText(/Tank Size/)).toHaveValue(55);
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    // 55L * 90000 = 4,950,000 LBP.
    expect(await screen.findByText("$55.62 (4,950,000 LBP)")).toBeInTheDocument();
    expect(screen.queryByText("$40.45 (3,600,000 LBP)")).not.toBeInTheDocument();
  });

  it("shows a clear message, not a fake default, when the car has no tank size (null case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    const tankInput = await screen.findByLabelText(/Tank Size/);
    expect(tankInput).toHaveValue(null);
    await planTrip(user);

    expect(await screen.findByText("Tank size not set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /this car's profile/ })).toHaveAttribute(
      "href",
      "/cars/car-1",
    );
    // Nothing tank-cost-shaped (and in particular no 20L figure) is shown.
    expect(screen.queryByText(/1,800,000 LBP/)).not.toBeInTheDocument();
    expect(screen.queryByText(/20L at/)).not.toBeInTheDocument();
    // The rest of the results are unaffected.
    expect(screen.getByText(/Fuel Cost/)).toBeInTheDocument();
  });

  it("still calculates the full tank cost from a size the user types when the car has none", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await user.type(await screen.findByLabelText(/Tank Size/), "30");
    await planTrip(user);

    // 30L * 90000 = 2,700,000 LBP.
    expect(await screen.findByText("$30.34 (2,700,000 LBP)")).toBeInTheDocument();
    expect(screen.queryByText("Tank size not set")).not.toBeInTheDocument();
  });

  it("drops a previous car's typed tank size when switching to a car with none", async () => {
    const user = userEvent.setup();
    mockCarsLookup([
      { id: "car-1", make: "Toyota", model: "Corolla", year: 2020, fuel_tank_capacity_liters: 40 },
      { id: "car-2", make: "Fiat", model: "500", year: 2015, fuel_tank_capacity_liters: null },
    ]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue(40));

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");

    expect(screen.getByLabelText(/Tank Size/)).toHaveValue(null);
  });
});
