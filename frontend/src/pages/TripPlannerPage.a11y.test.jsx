// The Trip Planner result card runs through axe (definition-list and dlitem among them). Before this, each row of the result <dl> held an
// icon <span>, a <dt>, a <dd> and <p> captions, which axe reports as invalid (a <dl> row may hold only <dt> and <dd>). The icon now sits
// inside the <dt>, and the caption and traffic badge are their own <dd>s. Mocked data only; nothing is sent.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TripPlannerPage from "./TripPlannerPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { apiFetch } from "../lib/apiClient.js";

const SESSION = { user: { id: "user-123", email: "driver@example.com" }, access_token: "test-access-token" };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

vi.mock("../lib/apiClient.js", () => ({
  apiFetch: vi.fn(),
}));

function mockCars(cars) {
  const order = vi.fn().mockResolvedValue({ data: cars, error: null });
  supabase.from.mockReturnValue({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) });
}

// Every row of the result: light and current-traffic fuel cost, a heavy-traffic duration with its badge, distance, full tank cost.
const FULL_ESTIMATE = {
  distance_km: 81.9,
  duration_min: 60,
  duration_in_traffic_min: 105,
  fuel_price_used_lbp: 90000,
  estimated_cost_lbp: 400000,
  estimated_cost_current_traffic_lbp: 520000,
  estimated_cost_usd: 4.49,
  efficiency_source: "real",
};

async function planTrip(estimate, car) {
  const user = userEvent.setup();
  mockCars([car]);
  apiFetch.mockImplementation((path) =>
    path === "/trip-planner/fuel-prices"
      ? Promise.resolve({ prices: {}, lbp_per_usd: 89000 })
      : Promise.resolve(estimate),
  );
  render(
    <MemoryRouter initialEntries={["/trip-planner"]}>
      <AuthProvider><CurrencyProvider>
        <Routes>
          <Route path="/trip-planner" element={<TripPlannerPage />} />
        </Routes>
      </CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
  await user.type(await screen.findByLabelText(/Starting Location/), "Beirut, Lebanon");
  await user.type(screen.getByLabelText("Destination *"), "Byblos, Lebanon");
  await user.click(screen.getByRole("button", { name: "Plan Trip" }));
  await waitFor(() => expect(document.querySelector(".trip-result")).not.toBeNull());
  return document.querySelector(".trip-result");
}

async function violations(container, ruleIds) {
  const result = await axe.run(container, { runOnly: { type: "rule", values: ruleIds } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 80)).join(" | ")}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
});

describe("TripPlannerPage result card — accessibility (axe)", () => {
  it("has no definition-list, dlitem or duplicate-id violation with every row shown", async () => {
    const list = await planTrip(FULL_ESTIMATE, { id: "car-1", fuel_tank_capacity_liters: 50 });
    expect(list.children).toHaveLength(5);
    expect(await violations(list, ["definition-list", "dlitem", "duplicate-id", "aria-hidden-focus"])).toEqual([]);
  });

  it("is valid when the tank size is not set (the link caption row) and there is no traffic comparison", async () => {
    const list = await planTrip(
      { distance_km: 10, duration_min: 10, duration_in_traffic_min: 10, fuel_price_used_lbp: 90000, estimated_cost_lbp: 50000, estimated_cost_usd: 0.56 },
      { id: "car-1" },
    );
    expect(list.children).toHaveLength(4);
    expect(await violations(list, ["definition-list", "dlitem"])).toEqual([]);
  });

  it("the whole rendered page has no axe violation (color-contrast needs real layout, and region needs the app shell, so those two are not run here)", async () => {
    await planTrip(FULL_ESTIMATE, { id: "car-1", fuel_tank_capacity_liters: 50 });
    const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });

  it("each row holds only a <dt> and <dd>s, with the icon inside the term (structure the rules check)", async () => {
    const list = await planTrip(FULL_ESTIMATE, { id: "car-1", fuel_tank_capacity_liters: 50 });
    for (const row of list.children) {
      expect(row.tagName).toBe("DIV");
      const tags = [...row.children].map((child) => child.tagName);
      expect(tags[0]).toBe("DT");
      expect(tags.slice(1).every((tag) => tag === "DD")).toBe(true);
      const icon = row.querySelector("dt > .trip-result__icon");
      expect(icon).toHaveAttribute("aria-hidden", "true");
      expect(icon.querySelector("svg.icon")).toBeInTheDocument();
    }
    expect(list.querySelectorAll(":scope > div > :not(dt):not(dd)")).toHaveLength(0);
  });

  it("shows the same labels, values and captions as before (markup only)", async () => {
    const list = await planTrip(FULL_ESTIMATE, { id: "car-1", fuel_tank_capacity_liters: 50 });
    const labels = [...list.querySelectorAll("dt")].map((dt) => dt.textContent.replace(/About this fuel cost estimate/, "").trim());
    expect(labels[0]).toMatch(/^Fuel Cost \(Light Traffic\)/);
    expect(labels.slice(1)).toEqual(["Fuel Cost (Current Traffic)", "Duration", "Distance", "Full Tank Cost"]);
    const text = list.textContent;
    expect(text).toContain("Adjusted for current congestion");
    expect(text).toContain("Traffic-adjusted estimate");
    expect(text).toContain("105 min");
    expect(text).toContain("81.9 km");
    expect(list.querySelector(".traffic-badge")).toBeInTheDocument();
  });
});
