// End-to-end check of the sitewide currency toggle (CAR-54, acceptance test): the
// REAL header switch, Trip Planner and Fuel Log rendered together. Flipping the
// switch changes which currency is primary on both screens, and the choice is
// still there after a page reload (a completely fresh render of the app). Only the
// network (Supabase, the FastAPI client) is mocked.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteNav from "../components/SiteNav.jsx";
import FuelLogPage from "../pages/FuelLogPage.jsx";
import TripPlannerPage from "../pages/TripPlannerPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { CurrencyProvider } from "./CurrencyContext.jsx";
import { CURRENCY_STORAGE_KEY } from "../lib/currency.js";
import { apiFetch } from "../lib/apiClient.js";
import { supabase } from "../lib/supabaseClient.js";

const SESSION = { user: { id: "user-123", email: "driver@example.com" }, access_token: "test-access-token" };
const CAR = { id: "car-1", make: "Toyota", model: "Corolla", year: 2020, fuel_type: "Gasoline", fuel_tank_capacity_liters: 50 };
const LOGS = [
  { id: "log-1", filled_at: "2026-09-21", liters: "19.6", cost_amount: "30", cost_currency: "USD", created_at: "2026-09-21T09:00:00Z" },
];
const ESTIMATE = {
  distance_km: 100,
  duration_min: 60,
  duration_in_traffic_min: 75,
  fuel_price_used_lbp: 89700,
  estimated_cost_lbp: 897000,
  estimated_cost_usd: 1,
  estimated_cost_current_traffic_lbp: 1794000,
  estimated_cost_current_traffic_usd: 2,
};

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

/** A fresh render of the whole app shell at `path` — what opening the page (or reloading it) does. */
function openApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CurrencyProvider>
          <SiteNav />
          <Routes>
            <Route path="/trip-planner" element={<TripPlannerPage />} />
            <Route path="/fuel-log" element={<FuelLogPage />} />
          </Routes>
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Every price currently on screen, as text, in page order. */
const prices = () => [...document.querySelectorAll(".price")].map((node) => node.textContent);
const primaries = () => [...new Set([...document.querySelectorAll(".price")].map((node) => node.dataset.primary))];

async function planATrip(user) {
  await user.type(await screen.findByLabelText("Destination *"), "Byblos, Lebanon");
  await user.click(screen.getByRole("button", { name: "Plan Trip" }));
  await screen.findByText("Full Tank Cost");
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
  supabase.from.mockImplementation((table) => ({
    select: () => ({
      eq: () => ({ order: () => Promise.resolve({ data: table === "cars" ? [CAR] : LOGS, error: null }) }),
    }),
  }));
  apiFetch.mockImplementation((path) =>
    Promise.resolve(path === "/trip-planner/estimate" ? ESTIMATE : { prices: {}, lbp_per_usd: 89700 }),
  );
});

describe("the currency toggle across screens", () => {
  it("switches the primary currency on the Trip Planner AND the Fuel Log, and back", async () => {
    const user = userEvent.setup();
    openApp("/trip-planner");
    await planATrip(user);

    // Trip Planner: dollars first by default
    expect(primaries()).toEqual(["USD"]);
    expect(prices()[0]).toBe("$10.00 (897,000 LBP)");

    // one click in the header ...
    await user.click(screen.getByRole("button", { name: "LBP" }));
    expect(primaries()).toEqual(["LBP"]);
    expect(prices()[0]).toBe("897,000 LBP ($10.00)");

    // ... and the Fuel Log, opened afterwards, is already pounds-first
    await user.click(screen.getByRole("link", { name: "Fuel Log" }));
    const table = await screen.findByRole("table");
    expect(primaries()).toEqual(["LBP"]);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "21 Sep 2026",
      "19.6 L",
      "2,691,000 LBP ($30.00)",
      "137,296 LBP/L ($1.53/L)",
      "2,745,918 LBP/20 L ($30.61/20 L)",
    ]);

    // switching back to USD on the Fuel Log flips it too
    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(primaries()).toEqual(["USD"]);
    expect(within(table).getAllByRole("cell").map((cell) => cell.textContent).slice(2)).toEqual([
      "$30.00 (2,691,000 LBP)",
      "$1.53/L (137,296 LBP/L)",
      "$30.61/20 L (2,745,918 LBP/20 L)",
    ]);

    // and the Trip Planner, opened again, follows the same choice
    await user.click(screen.getByRole("link", { name: "Trip Planner" }));
    await planATrip(user);
    expect(primaries()).toEqual(["USD"]);
  });

  it("remembers the choice after a page reload, on both screens", async () => {
    const user = userEvent.setup();
    const firstVisit = openApp("/fuel-log");
    await user.click(await screen.findByRole("button", { name: "LBP" }));
    expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("LBP");
    firstVisit.unmount(); // the tab is closed ...

    const secondVisit = openApp("/fuel-log"); // ... and the site is opened again
    await screen.findByRole("table");
    expect(screen.getByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "true");
    expect(primaries()).toEqual(["LBP"]);
    expect(prices()).toEqual(["2,691,000 LBP ($30.00)", "137,296 LBP/L ($1.53/L)", "2,745,918 LBP/20 L ($30.61/20 L)"]);
    secondVisit.unmount();

    openApp("/trip-planner"); // a different screen after the reload
    await planATrip(user);
    expect(screen.getByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "true");
    expect(primaries()).toEqual(["LBP"]);
    expect(prices()[0]).toBe("897,000 LBP ($10.00)");
  });

  it("remembers USD after a reload too (switching back is kept, not just the first choice)", async () => {
    const user = userEvent.setup();
    const firstVisit = openApp("/fuel-log");
    await user.click(await screen.findByRole("button", { name: "LBP" }));
    await user.click(screen.getByRole("button", { name: "USD" }));
    firstVisit.unmount();

    openApp("/fuel-log");
    await screen.findByRole("table");

    expect(primaries()).toEqual(["USD"]);
    expect(prices()[0]).toBe("$30.00 (2,691,000 LBP)");
  });

  it("does not need a saved choice: a first visit starts on USD everywhere", async () => {
    openApp("/fuel-log");
    await screen.findByRole("table");

    expect(primaries()).toEqual(["USD"]);
    expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBeNull(); // nothing is written until the user chooses
  });
});
