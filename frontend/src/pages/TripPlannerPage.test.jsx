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
// changes it; a car with no tank size gets a clear "not set" message), and
// the polish pass (Fuel Price / Tank Size tucked into a collapsed
// "Advanced options" section, shown with thousand separators).
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
import CurrencyToggle from "../components/CurrencyToggle.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { CURRENCY_STORAGE_KEY } from "../lib/currency.js";
import { supabase } from "../lib/supabaseClient.js";
import { priceText } from "../test/priceText.js";
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

    expect(await screen.findByText(priceText("$6.35 (569,696 LBP)"))).toBeInTheDocument();
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
      expect(screen.getByLabelText(/Fuel Price/)).toHaveValue("91,000"),
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
    await waitFor(() => expect(screen.getByLabelText(/Fuel Price/)).toHaveValue("91,000"));

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
    expect(await screen.findByText(priceText("$45.15 (4,050,000 LBP)"))).toBeInTheDocument();
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
    expect(await screen.findByText(priceText("$40.13 (3,600,000 LBP)"))).toBeInTheDocument();
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
    expect(screen.getByText(priceText("$10.03 (900,000 LBP)"))).toBeInTheDocument();
    expect(screen.getByText(priceText("$10.79 (967,500 LBP)"))).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue("52"));
  });

  // Regression for the reported "430L / $420.10" figure: whatever shape the
  // numeric column arrives in (a number, or a string such as "43.0" — Postgres
  // numeric can serialize either way), the field and the cost must use the
  // value exactly, never 10x it.
  it.each([
    [43, "43", "$43.14 (3,870,000 LBP)"],
    ["43.0", "43", "$43.14 (3,870,000 LBP)"],
    [43.5, "43.5", "$43.65 (3,915,000 LBP)"],
  ])(
    "reads a stored tank capacity of %j as exactly %j litres (no 10x)",
    async (stored, expectedField, expectedCost) => {
      const user = userEvent.setup();
      mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: stored }]);
      mockApiFetch({ estimate: ESTIMATE_90K });

      renderPage();
      await waitFor(() =>
        expect(screen.getByLabelText(/Tank Size/)).toHaveValue(expectedField),
      );
      await planTrip(user);

      expect(await screen.findByText(priceText(expectedCost))).toBeInTheDocument();
      expect(screen.queryByText(/430L/)).not.toBeInTheDocument();
    },
  );

  it("changes the tank size and full tank cost when switching between cars with different capacities", async () => {
    const user = userEvent.setup();
    mockCarsLookup([
      { id: "car-1", make: "Toyota", model: "Corolla", year: 2020, fuel_tank_capacity_liters: 40 },
      { id: "car-2", make: "Nissan", model: "Patrol", year: 2018, fuel_tank_capacity_liters: 55 },
    ]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue("40"));
    await planTrip(user);
    // 40L * 90000 = 3,600,000 LBP.
    expect(await screen.findByText(priceText("$40.13 (3,600,000 LBP)"))).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    expect(screen.getByLabelText(/Tank Size/)).toHaveValue("55");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    // 55L * 90000 = 4,950,000 LBP.
    expect(await screen.findByText(priceText("$55.18 (4,950,000 LBP)"))).toBeInTheDocument();
    expect(screen.queryByText(priceText("$40.13 (3,600,000 LBP)"))).not.toBeInTheDocument();
  });

  it("shows a clear message, not a fake default, when the car has no tank size (null case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    const tankInput = await screen.findByLabelText(/Tank Size/);
    expect(tankInput).toHaveValue("");
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
    expect(await screen.findByText(priceText("$30.10 (2,700,000 LBP)"))).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue("40"));

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");

    expect(screen.getByLabelText(/Tank Size/)).toHaveValue("");
  });
});

describe("TripPlannerPage — tank size reset and range check (CAR-49)", () => {
  async function planTrip(user) {
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));
  }

  it("leaves no stale digits when switching cars repeatedly", async () => {
    const user = userEvent.setup();
    mockCarsLookup([
      { id: "car-a", make: "Toyota", model: "Corolla", year: 2020, fuel_tank_capacity_liters: 40 },
      { id: "car-b", make: "Fiat", model: "500", year: 2015, fuel_tank_capacity_liters: null },
      { id: "car-c", make: "Nissan", model: "Patrol", year: 2018, fuel_tank_capacity_liters: 55 },
    ]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue("40"));

    // Type extra digits onto car A's value, then bounce around the cars.
    await user.type(screen.getByLabelText(/Tank Size/), "3");
    expect(screen.getByLabelText(/Tank Size/)).toHaveValue("403");

    const carSelect = screen.getByLabelText("Car");
    for (const [carId, expected] of [
      ["car-b", ""],
      ["car-a", "40"],
      ["car-c", "55"],
      ["car-b", ""],
      ["car-c", "55"],
      ["car-a", "40"],
    ]) {
      await user.selectOptions(carSelect, carId);
      expect(screen.getByLabelText(/Tank Size/)).toHaveValue(expected);
    }
  });

  it("flags an out-of-range size (430) and never uses it for a figure", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await user.type(await screen.findByLabelText(/Tank Size/), "430");

    expect(
      screen.getByText("Tank capacity must be between 5 and 200 liters."),
    ).toBeInTheDocument();

    await planTrip(user);

    expect(await screen.findByText("Tank size out of range")).toBeInTheDocument();
    // 430 L x 90,000 LBP/L must never be shown or used.
    expect(screen.queryByText(/38,700,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/430L at/)).not.toBeInTheDocument();
    // The trip itself still plans and shows the rest of the results.
    expect(screen.getByText(/Fuel Cost/)).toBeInTheDocument();
  });

  it("flags a stored capacity that is out of range instead of using it", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: 430 }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Tank Size/)).toHaveValue("430"));
    await planTrip(user);

    expect(await screen.findByText("Tank size out of range")).toBeInTheDocument();
    expect(screen.queryByText(/38,700,000/)).not.toBeInTheDocument();
  });

  it.each([
    ["5", "$5.02 (450,000 LBP)"],
    ["200", "$200.67 (18,000,000 LBP)"],
  ])("accepts the boundary size %s L", async (typed, expectedCost) => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await user.type(await screen.findByLabelText(/Tank Size/), typed);
    await planTrip(user);

    expect(await screen.findByText(priceText(expectedCost))).toBeInTheDocument();
    expect(screen.queryByText(/out of range/)).not.toBeInTheDocument();
  });
});

describe("TripPlannerPage — Advanced options & thousand separators (polish)", () => {
  const FUEL_PRICES = {
    prices: { "95_octane": { lbp_per_liter: 140500, usd_per_liter: 1.58 } },
    lbp_per_usd: 89000,
  };

  async function openAdvanced(user) {
    await user.click(screen.getByText("Advanced options"));
  }

  it("keeps Fuel Price and Tank Size collapsed by default, with the toggle visible", async () => {
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline", fuel_tank_capacity_liters: 64 }]);
    mockApiFetch({ fuelPrices: FUEL_PRICES });

    renderPage();
    await screen.findByLabelText("Destination *");

    expect(screen.getByText("Advanced options")).toBeVisible();
    expect(screen.getByLabelText(/Fuel Price/)).not.toBeVisible();
    expect(screen.getByLabelText(/Tank Size/)).not.toBeVisible();
  });

  it("reveals both fields when the toggle is clicked, and hides them again on a second click", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({ fuelPrices: FUEL_PRICES });

    renderPage();
    await screen.findByLabelText("Destination *");
    await openAdvanced(user);

    expect(screen.getByLabelText(/Fuel Price/)).toBeVisible();
    expect(screen.getByLabelText(/Tank Size/)).toBeVisible();

    await openAdvanced(user);
    expect(screen.getByLabelText(/Fuel Price/)).not.toBeVisible();
  });

  it("still uses the auto-filled price and tank size while the section stays closed (default flow)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline", fuel_tank_capacity_liters: 64 }]);
    mockApiFetch({
      fuelPrices: FUEL_PRICES,
      estimate: { ...ESTIMATE_90K, fuel_price_used_lbp: 140500 },
    });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Fuel Price/)).toHaveValue("140,500"));
    // Pick car -> destination -> Plan Trip, never opening the section.
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/trip-planner/estimate",
        expect.objectContaining({
          body: expect.objectContaining({ fuel_price_per_liter_lbp: 140500 }),
        }),
      ),
    );
    // 64 L x 140,500 = 8,992,000 LBP.
    expect(await screen.findByText(priceText("$100.25 (8,992,000 LBP)"))).toBeInTheDocument();
  });

  it("shows the prefilled fuel price and tank size with thousand separators", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline", fuel_tank_capacity_liters: 1200 }]);
    mockApiFetch({ fuelPrices: FUEL_PRICES });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Fuel Price/)).toHaveValue("140,500"));
    await openAdvanced(user);

    expect(screen.getByLabelText(/Fuel Price/)).toHaveValue("140,500");
    expect(screen.getByLabelText(/Tank Size/)).toHaveValue("1,200");
  });

  it("formats a typed fuel price live and submits the plain number (no commas)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({ fuelPrices: FUEL_PRICES, estimate: ESTIMATE_90K });

    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/Fuel Price/)).toHaveValue("140,500"));
    await openAdvanced(user);

    const priceInput = screen.getByLabelText(/Fuel Price/);
    await user.clear(priceInput);
    await user.type(priceInput, "1234567");
    expect(priceInput).toHaveValue("1,234,567");

    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/trip-planner/estimate",
        expect.objectContaining({
          body: expect.objectContaining({ fuel_price_per_liter_lbp: 1234567 }),
        }),
      ),
    );
  });

  it("formats a typed tank size and calculates from the plain number (decimals kept)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await screen.findByLabelText("Destination *");
    await openAdvanced(user);
    const tankInput = screen.getByLabelText(/Tank Size/);
    await user.type(tankInput, "43.5");
    expect(tankInput).toHaveValue("43.5");

    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    // 43.5 L x 90,000 = 3,915,000 LBP.
    expect(await screen.findByText(priceText("$43.65 (3,915,000 LBP)"))).toBeInTheDocument();
  });

  it("ignores letters typed into the number fields", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await screen.findByLabelText("Destination *");
    await openAdvanced(user);
    const tankInput = screen.getByLabelText(/Tank Size/);
    await user.type(tankInput, "4a5e");

    expect(tankInput).toHaveValue("45");
  });

  it("opens the section by itself when the tank size is invalid, so the error is visible", async () => {
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: 430 }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();

    const error = await screen.findByText("Tank capacity must be between 5 and 200 liters.");
    expect(error).toBeVisible();
    expect(screen.getByLabelText(/Tank Size/)).toBeVisible();
  });

  it("points to Advanced options when the car has no tank size", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_tank_capacity_liters: null }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await user.type(await screen.findByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    expect(await screen.findByText(/Enter a tank size under Advanced options/)).toBeInTheDocument();
  });
});

describe("TripPlannerPage — input limits (CAR-23)", () => {
  it("caps both place fields at 300 characters", async () => {
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();

    expect(await screen.findByLabelText("Destination *")).toHaveAttribute("maxlength", "300");
    expect(screen.getByLabelText(/Starting Location/)).toHaveAttribute("maxlength", "300");
  });

  it("refuses a fuel price above 10,000,000 with a visible message, opens Advanced options, and sends nothing", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await screen.findByLabelText("Destination *");
    await user.click(screen.getByText("Advanced options"));
    const price = screen.getByLabelText(/Fuel Price/);
    await user.clear(price);
    await user.type(price, "99999999999");
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    expect(
      await screen.findByText(/Fuel price must be between 1 and 10,000,000/),
    ).toBeVisible();
    expect(apiFetch).not.toHaveBeenCalledWith("/trip-planner/estimate", expect.anything());
  });

  it("shows the fuel price error even while Advanced options is closed (it opens by itself)", async () => {
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({
      fuelPrices: {
        prices: { "95_octane": { lbp_per_liter: 99999999999, usd_per_liter: 1 } },
        lbp_per_usd: 89000,
      },
    });

    renderPage();

    expect(await screen.findByText(/Fuel price must be between 1 and 10,000,000/)).toBeVisible();
  });

  it("sends a fuel price of exactly 10,000,000 (the upper bound)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await screen.findByLabelText("Destination *");
    await user.click(screen.getByText("Advanced options"));
    const price = screen.getByLabelText(/Fuel Price/);
    await user.clear(price);
    await user.type(price, "10000000");
    await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/trip-planner/estimate",
        expect.objectContaining({
          body: expect.objectContaining({ fuel_price_per_liter_lbp: 10000000 }),
        }),
      ),
    );
  });
});

describe("TripPlannerPage — authenticated API calls (CAR-24)", () => {
  it("sends the session token when loading the current fuel prices (the endpoint requires login)", async () => {
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({ fuelPrices: { prices: {}, lbp_per_usd: 89000 } });

    renderPage();

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/trip-planner/fuel-prices", {
        accessToken: "test-access-token",
      }),
    );
  });

  it("does not call the fuel prices endpoint at all without a session", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    mockCarsLookup([{ id: "car-1" }]);
    mockApiFetch({ estimate: ESTIMATE_90K });

    renderPage();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(apiFetch).not.toHaveBeenCalledWith("/trip-planner/fuel-prices", expect.anything());
  });
});

describe("TripPlannerPage — example placeholders", () => {
  it("shows realistic examples in the route fields", async () => {
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline" }]);
    mockApiFetch({ fuelPrices: { prices: {}, lbp_per_usd: 89000 } });

    renderPage();

    expect(await screen.findByPlaceholderText("e.g. Beirut, Lebanon")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Byblos, Lebanon")).toBeInTheDocument();
  });
});

describe("TripPlannerPage — currency toggle (CAR-54)", () => {
  // Round numbers at the app rate (1 USD = 89,700 LBP): 50 L x 89,700 = 4,485,000 LBP = $50.00.
  const ESTIMATE = {
    distance_km: 100,
    duration_min: 60,
    duration_in_traffic_min: 75,
    fuel_price_used_lbp: 89700,
    estimated_cost_lbp: 897000,
    estimated_cost_usd: 999.99, // deliberately wrong: the page must use the app's own rate, not this
    estimated_cost_current_traffic_lbp: 1794000,
    estimated_cost_current_traffic_usd: 999.99,
  };

  /** Renders the Trip Planner with the currency provider (and, optionally, the header switch). */
  function renderWithCurrency({ stored, withToggle = false } = {}) {
    window.localStorage.clear();
    if (stored) window.localStorage.setItem(CURRENCY_STORAGE_KEY, stored);
    return render(
      <MemoryRouter initialEntries={["/trip-planner"]}>
        <AuthProvider>
          <CurrencyProvider>
            {withToggle && <CurrencyToggle />}
            <Routes>
              <Route path="/trip-planner" element={<TripPlannerPage />} />
            </Routes>
          </CurrencyProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  async function planTrip(user) {
    mockCarsLookup([{ id: "car-1", fuel_type: "Gasoline", fuel_tank_capacity_liters: 50 }]);
    mockApiFetch({ estimate: ESTIMATE });
    await user.type(await screen.findByLabelText("Destination *"), "Byblos, Lebanon");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));
    await screen.findByText("Full Tank Cost");
  }

  const shownPrices = () => [...document.querySelectorAll(".trip-result-card .price")].map((node) => node.textContent);

  it("shows every price dollars-first by default: fuel cost, current-traffic cost, full tank and the price per liter", async () => {
    const user = userEvent.setup();
    renderWithCurrency();
    await planTrip(user);

    expect(shownPrices()).toEqual([
      "$10.00 (897,000 LBP)", // fuel cost (light traffic)
      "$1.00/L (89,700 LBP/L)", // "Based on" price per liter
      "$20.00 (1,794,000 LBP)", // fuel cost (current traffic)
      "$50.00 (4,485,000 LBP)", // full tank
      "$1.00/L (89,700 LBP/L)", // "50L at" price per liter
    ]);
    expect(document.querySelectorAll(".trip-result-card .price[data-primary='USD']")).toHaveLength(5);
  });

  it("shows every price pounds-first when LBP is the primary currency, with the same amounts", async () => {
    const user = userEvent.setup();
    renderWithCurrency({ stored: "LBP" });
    await planTrip(user);

    expect(shownPrices()).toEqual([
      "897,000 LBP ($10.00)",
      "89,700 LBP/L ($1.00/L)",
      "1,794,000 LBP ($20.00)",
      "4,485,000 LBP ($50.00)",
      "89,700 LBP/L ($1.00/L)",
    ]);
    expect(document.querySelectorAll(".trip-result-card .price[data-primary='LBP']")).toHaveLength(5);
  });

  it("flips the whole results card the moment the header switch is used, without planning again", async () => {
    const user = userEvent.setup();
    renderWithCurrency({ withToggle: true });
    await planTrip(user);
    const callsBefore = apiFetch.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "LBP" }));
    expect(shownPrices()[0]).toBe("897,000 LBP ($10.00)");
    expect(shownPrices()[3]).toBe("4,485,000 LBP ($50.00)");

    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(shownPrices()[0]).toBe("$10.00 (897,000 LBP)");
    expect(apiFetch.mock.calls.length).toBe(callsBefore); // no new request
  });

  it("uses the app's one rate for dollars, never the API's own dollar figure", async () => {
    const user = userEvent.setup();
    renderWithCurrency();
    await planTrip(user);

    expect(screen.queryByText(/999\.99/)).not.toBeInTheDocument();
    expect(screen.getByText(priceText("$10.00 (897,000 LBP)"))).toBeInTheDocument();
  });
});
