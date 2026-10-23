// CAR-70: the brand theme follows the car a screen is SHOWING, on each of the six car screens (Trip Planner,
// AI Advisor, Fuel Log, Maintenance, Expenses, Car Profile). Before, a screen started on the user's oldest car
// but the theme followed whichever car was last reported, so the two could disagree (the Mercedes theme over a
// Honda, say). These tests render the real screens inside the real providers, against one small fake backend,
// with the user's remembered ("active") car set to car B and car A being the oldest.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { ActiveCarProvider } from "../theme/ActiveCarContext.jsx";
import { getBrandTheme } from "../theme/carBrandThemes.js";
import AIAdvisorPage from "./AIAdvisorPage.jsx";
import CarProfilePage from "./CarProfilePage.jsx";
import ExpensesPage from "./ExpensesPage.jsx";
import FuelLogPage from "./FuelLogPage.jsx";
import MaintenancePage from "./MaintenancePage.jsx";
import TripPlannerPage from "./TripPlannerPage.jsx";

// One fake backend for every screen: the user's cars (and the profile's default car); every other table is empty.
// The query builder accepts any chain the screens use (select, eq, order, in, gte, limit, ...) and resolves to
// rows when awaited or to one row from maybeSingle()/single().
const backend = vi.hoisted(() => {
  const state = { cars: [], defaultCarId: null };
  function query(table) {
    const filters = {};
    const rows = () => (table === "cars" ? state.cars.filter((car) => filters.id === undefined || car.id === filters.id) : []);
    const one = () => (table === "cars" ? (rows()[0] ?? null) : table === "profiles" ? { default_car_id: state.defaultCarId } : null);
    const chain = new Proxy(
      {},
      {
        get(_target, name) {
          if (name === "then") return (resolve) => resolve({ data: rows(), error: null });
          if (name === "maybeSingle" || name === "single") return () => Promise.resolve({ data: one(), error: null });
          if (name === "eq") return (column, value) => { filters[column] = value; return chain; };
          return () => chain;
        },
      },
    );
    return chain;
  }
  return { state, query };
});

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn((table) => backend.query(table)),
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null, error: null }) }) },
  },
}));

vi.mock("../lib/apiClient.js", () => ({
  apiFetch: vi.fn(() => Promise.resolve({ prices: {}, lbp_per_usd: 89700 })),
}));

const USER = { id: "user-123", email: "driver@example.com" };
const carRow = (id, make, model, year) => ({
  id, user_id: USER.id, make, model, year, fuel_type: "gasoline", fuel_efficiency: 8, fuel_tank_capacity_liters: 60,
  engine_type: null, cylinders: null, drivetrain: null, transmission: null, license_plate: null, vin: null, photo_path: null,
});
const CAR_A = carRow("car-a", "Ferrari", "488 GTB", 2019);   // the oldest: what a screen used to start on
const CAR_B = carRow("car-b", "BMW", "320i", 2016);

const primary = (make) => getBrandTheme(make)["--color-primary"];
const rootPrimary = () => document.documentElement.style.getPropertyValue("--color-primary");

/** What an earlier visit left behind. */
function remember(carId, make) {
  window.localStorage.setItem(`carsage.activeCar.${USER.id}`, JSON.stringify({ carId, make }));
  window.localStorage.setItem("carsage.activeCarUser", USER.id);
}
const rememberedCarId = () => JSON.parse(window.localStorage.getItem(`carsage.activeCar.${USER.id}`) ?? "null")?.carId;

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CurrencyProvider>
          <ActiveCarProvider>
            <Routes>
              <Route path="/trip-planner" element={<TripPlannerPage />} />
              <Route path="/advisor" element={<AIAdvisorPage />} />
              <Route path="/fuel-log" element={<FuelLogPage />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/cars/mine" element={<CarProfilePage />} />
              <Route path="/cars/:carId" element={<CarProfilePage />} />
            </Routes>
          </ActiveCarProvider>
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute("style");
  backend.state.cars = [CAR_A, CAR_B];
  backend.state.defaultCarId = null;
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: "token-1" } } });
});

const SELECTOR_SCREENS = [
  ["Trip Planner", "/trip-planner"],
  ["AI Advisor", "/advisor"],
  ["Fuel Log", "/fuel-log"],
  ["Maintenance", "/maintenance"],
  ["Expenses", "/expenses"],
];

describe.each(SELECTOR_SCREENS)("%s: the theme follows the car shown", (_name, path) => {
  it("starts on the remembered car B, not the oldest car A, and the theme is B's", async () => {
    remember("car-b", "BMW");
    renderAt(path);

    const select = await screen.findByLabelText("Car");
    await waitFor(() => expect(select).toHaveValue("car-b"));
    await waitFor(() => expect(rootPrimary()).toBe(primary("BMW")));
  });

  it("with nothing remembered it starts on the first car, and the theme is that car's (the old bug: the theme stayed default)", async () => {
    renderAt(path);

    const select = await screen.findByLabelText("Car");
    await waitFor(() => expect(select).toHaveValue("car-a"));
    await waitFor(() => expect(rootPrimary()).toBe(primary("Ferrari")));
    await waitFor(() => expect(rememberedCarId()).toBe("car-a"));
  });

  it("when the remembered car is gone it shows the first car and the theme matches it, not the stale brand (edge case)", async () => {
    remember("car-deleted", "Toyota");
    renderAt(path);

    const select = await screen.findByLabelText("Car");
    await waitFor(() => expect(select).toHaveValue("car-a"));
    await waitFor(() => expect(rootPrimary()).toBe(primary("Ferrari")));
  });

  it("picking the other car switches the theme with it and remembers the pick", async () => {
    remember("car-b", "BMW");
    renderAt(path);
    const select = await screen.findByLabelText("Car");
    await waitFor(() => expect(select).toHaveValue("car-b"));

    await userEvent.setup().selectOptions(select, "car-a");

    await waitFor(() => expect(rootPrimary()).toBe(primary("Ferrari")));
    expect(select).toHaveValue("car-a");
    expect(rememberedCarId()).toBe("car-a");
  });
});

describe("Maintenance: a ?car= link wins, and the theme follows it", () => {
  it("opens on the car in the link even when another car is remembered", async () => {
    remember("car-b", "BMW");
    renderAt("/maintenance?car=car-a");

    const select = await screen.findByLabelText("Car");
    await waitFor(() => expect(select).toHaveValue("car-a"));
    await waitFor(() => expect(rootPrimary()).toBe(primary("Ferrari")));
  });
});

describe("Car Profile: the theme follows the car shown", () => {
  it("/cars/car-b shows car B and the theme is B's, whatever was remembered", async () => {
    remember("car-a", "Ferrari");
    renderAt("/cars/car-b");

    expect(await screen.findByRole("heading", { name: /320i/ })).toBeInTheDocument();
    await waitFor(() => expect(rootPrimary()).toBe(primary("BMW")));
    await waitFor(() => expect(rememberedCarId()).toBe("car-b"));
  });

  it("/cars/mine opens the user's default car, and the theme follows what is shown (not the remembered car)", async () => {
    backend.state.defaultCarId = "car-a";
    remember("car-b", "BMW");
    renderAt("/cars/mine");

    expect(await screen.findByRole("heading", { name: /488 GTB/ })).toBeInTheDocument();
    await waitFor(() => expect(rootPrimary()).toBe(primary("Ferrari")));
    await waitFor(() => expect(rememberedCarId()).toBe("car-a"));
  });

  it("/cars/mine with no default car opens the oldest, and the theme is its brand", async () => {
    renderAt("/cars/mine");

    expect(await screen.findByRole("heading", { name: /488 GTB/ })).toBeInTheDocument();
    await waitFor(() => expect(rootPrimary()).toBe(primary("Ferrari")));
  });

  it("switching to another car in the page's own selector switches the theme", async () => {
    remember("car-a", "Ferrari");
    renderAt("/cars/car-a");
    await screen.findByRole("heading", { name: /488 GTB/ });
    await waitFor(() => expect(rootPrimary()).toBe(primary("Ferrari")));

    await userEvent.setup().selectOptions(screen.getByLabelText("Car"), "car-b");

    expect(await screen.findByRole("heading", { name: /320i/ })).toBeInTheDocument();
    await waitFor(() => expect(rootPrimary()).toBe(primary("BMW")));
  });
});

describe("moving between screens keeps one car and one theme", () => {
  it("a car picked on the Fuel Log is the car Expenses opens on, with the same theme", async () => {
    remember("car-a", "Ferrari");
    const first = renderAt("/fuel-log");
    const select = await screen.findByLabelText("Car");
    await userEvent.setup().selectOptions(select, "car-b");
    await waitFor(() => expect(rootPrimary()).toBe(primary("BMW")));
    first.unmount();

    renderAt("/expenses");

    const expensesSelect = await screen.findByLabelText("Car");
    await waitFor(() => expect(expensesSelect).toHaveValue("car-b"));
    expect(rootPrimary()).toBe(primary("BMW"));
  });
});
