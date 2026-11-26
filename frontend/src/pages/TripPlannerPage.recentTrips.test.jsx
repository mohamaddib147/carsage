// Tests for the Trip Planner's "Recent trips" list (PLAN-06): the selected car's five newest saved trips read straight
// from Supabase, the empty state, a failed read (plain error, form still works), delete with its confirm step
// (confirmed, kept, and refused by the server), choosing a row (fills the form, sends no request of any kind), a row
// saved without an origin, a fresh estimate added to the top of the list from its own response, and axe on the list.
// Mocked data only.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../lib/apiClient.js", () => ({ apiFetch: vi.fn() }));

// Local noon, so the shown date is the same day in any time zone the suite runs in.
const TRIPS = [
  { id: "t1", origin: "Beirut", destination: "Byblos", distance_km: 37.2, estimated_cost: 250000, created_at: new Date(2026, 10, 20, 12, 5).toISOString() },
  { id: "t2", origin: "Beirut", destination: "Tyre", distance_km: 81.5, estimated_cost: 540000, created_at: new Date(2026, 10, 18, 9, 30).toISOString() },
];

/**
 * Routes supabase.from() by table: "cars" lists one car, "trips" answers the list read and a delete.
 * @param {{ trips?: object[], tripsError?: object | null, deleted?: object[] | null, deleteError?: object | null }} options
 * @returns {{ limit: import('vitest').Mock, eq: import('vitest').Mock, deleteEq: import('vitest').Mock }} the spies a test checks.
 */
function mockBackend({ trips = TRIPS, tripsError = null, deleted = [{ id: "t1" }], deleteError = null } = {}) {
  const limit = vi.fn().mockResolvedValue({ data: tripsError ? null : trips, error: tripsError });
  const eq = vi.fn(() => ({ order: vi.fn(() => ({ limit })) }));
  const deleteEq = vi.fn(() => ({ select: vi.fn().mockResolvedValue({ data: deleted, error: deleteError }) }));
  supabase.from.mockImplementation((table) =>
    table === "trips"
      ? { select: vi.fn(() => ({ eq })), delete: vi.fn(() => ({ eq: deleteEq })) }
      : { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ id: "car-1" }], error: null }) }) }) },
  );
  return { limit, eq, deleteEq };
}

/**
 * Renders Trip Planner with the real auth and currency providers (Supabase and apiFetch are mocked above).
 * @returns {void}
 */
function renderPage() {
  render(
    <MemoryRouter>
      <AuthProvider><CurrencyProvider><TripPlannerPage /></CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
}

/**
 * Waits for the Recent trips section to finish loading.
 * @returns {Promise<HTMLElement>} the section, once its rows (or message) have loaded.
 */
async function recentSection() {
  const section = await screen.findByRole("region", { name: "Recent trips" });
  await waitFor(() => expect(within(section).queryByText(/Loading recent trips/)).not.toBeInTheDocument());
  return section;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
  apiFetch.mockImplementation((path) =>
    path === "/trip-planner/fuel-prices" ? Promise.resolve({ prices: {}, lbp_per_usd: 89000 }) : Promise.reject(new Error("unexpected")),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("TripPlannerPage — recent trips", () => {
  it("lists the selected car's newest trips, read from Supabase and limited to five (normal case)", async () => {
    const { limit, eq } = mockBackend();
    renderPage();
    const section = await recentSection();

    expect(eq).toHaveBeenCalledWith("car_id", "car-1");
    expect(limit).toHaveBeenCalledWith(5);
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Beirut to Byblos");
    expect(rows[0]).toHaveTextContent("37.2 km");
    expect(rows[0]).toHaveTextContent("20 Nov 2026, 12:05");
    // Delete names are unique per row: destination and date.
    expect(within(section).getByRole("button", { name: "Delete the trip to Byblos on 20 Nov 2026, 12:05" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Delete the trip to Tyre on 18 Nov 2026, 09:30" })).toBeInTheDocument();
  });

  it("shows a plain empty state when the car has no trips (edge case)", async () => {
    mockBackend({ trips: [] });
    renderPage();
    const section = await recentSection();
    expect(within(section).getByText("No trips planned yet for this car.")).toBeInTheDocument();
    expect(within(section).queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows a plain error when the list can't be read, and the form still plans a trip (invalid case)", async () => {
    mockBackend({ tripsError: { code: "XX000", message: "relation trips: internal detail" } });
    apiFetch.mockImplementation((path) =>
      path === "/trip-planner/estimate"
        ? Promise.resolve({ id: "new", distance_km: 10, duration_min: 10, duration_in_traffic_min: 10, fuel_price_used_lbp: 90000, estimated_cost_lbp: 50000 })
        : Promise.resolve({ prices: {}, lbp_per_usd: 89000 }),
    );
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();

    expect(within(section).getByRole("alert")).toHaveTextContent("Could not load your recent trips. Please try again.");
    expect(section).not.toHaveTextContent("internal detail");

    await user.type(screen.getByLabelText(/Starting Location/), "Beirut");
    await user.type(screen.getByLabelText("Destination *"), "Byblos");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));
    expect(await screen.findByText("Distance")).toBeInTheDocument();
  });

  it("deletes a trip after the confirm, asking the server for the deleted row, and focuses the notice", async () => {
    const { deleteEq } = mockBackend();
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();

    await user.click(within(section).getByRole("button", { name: "Delete the trip to Byblos on 20 Nov 2026, 12:05" }));
    // Focus starts on the safe choice.
    expect(within(section).getByRole("button", { name: "Keep it" })).toHaveFocus();
    await user.click(within(section).getByRole("button", { name: "Delete" }));

    const notice = await within(section).findByRole("status");
    expect(notice).toHaveTextContent("Trip to Byblos deleted.");
    expect(notice).toHaveFocus();
    expect(deleteEq).toHaveBeenCalledWith("id", "t1");
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Beirut to Tyre");
  });

  it("keeps the trip and returns focus to its Delete button when the user picks Keep it", async () => {
    const { deleteEq } = mockBackend();
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();

    await user.click(within(section).getByRole("button", { name: "Delete the trip to Tyre on 18 Nov 2026, 09:30" }));
    await user.click(within(section).getByRole("button", { name: "Keep it" }));

    expect(within(section).getByRole("button", { name: "Delete the trip to Tyre on 18 Nov 2026, 09:30" })).toHaveFocus();
    expect(deleteEq).not.toHaveBeenCalled();
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
  });

  it("keeps the row and says so when the server refuses the delete (empty reply under RLS)", async () => {
    mockBackend({ deleted: [] });
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();

    await user.click(within(section).getByRole("button", { name: "Delete the trip to Byblos on 20 Nov 2026, 12:05" }));
    await user.click(within(section).getByRole("button", { name: "Delete" }));

    expect(await within(section).findByText("Could not delete this trip. Please try again.")).toBeInTheDocument();
    expect(within(section).queryByRole("status")).not.toBeInTheDocument();
    expect(within(section).getAllByRole("listitem")).toHaveLength(2);
  });

  it("fills the route from a chosen row and focuses Plan Trip without sending any request", async () => {
    // A Maps key is set, so a Places lookup would fire if the filled text were treated as typing.
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    mockBackend();
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();
    const callsBefore = apiFetch.mock.calls.length;
    const fromCallsBefore = supabase.from.mock.calls.length;

    await user.click(within(section).getByRole("button", { name: /Beirut to Tyre/ }));

    expect(screen.getByLabelText(/Starting Location/)).toHaveValue("Beirut");
    expect(screen.getByLabelText("Destination *")).toHaveValue("Tyre");
    expect(screen.getByRole("button", { name: "Plan Trip" })).toHaveFocus();
    await new Promise((resolve) => setTimeout(resolve, 450)); // past the Places debounce
    expect(apiFetch.mock.calls.length).toBe(callsBefore);
    expect(supabase.from.mock.calls.length).toBe(fromCallsBefore);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a trip saved without an origin by its destination alone, and choosing it clears the origin (edge case)", async () => {
    mockBackend({ trips: [{ ...TRIPS[0], id: "t9", origin: null }] });
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();
    await user.type(screen.getByLabelText(/Starting Location/), "Sidon");

    const row = within(section).getByRole("listitem");
    expect(row).not.toHaveTextContent("null");
    await user.click(within(row).getByRole("button", { name: /^Byblos/ }));
    expect(screen.getByLabelText(/Starting Location/)).toHaveValue("");
    expect(screen.getByLabelText("Destination *")).toHaveValue("Byblos");
  });

  it("adds a new estimate to the top of the list from its response, without reading the list again", async () => {
    const { limit } = mockBackend({ trips: TRIPS.concat(TRIPS.map((trip, i) => ({ ...trip, id: `old${i}` })), [{ ...TRIPS[0], id: "oldest", destination: "Sidon" }]) });
    apiFetch.mockImplementation((path) =>
      path === "/trip-planner/estimate"
        ? Promise.resolve({ id: "new", distance_km: 12.4, duration_min: 20, duration_in_traffic_min: 25, fuel_price_used_lbp: 90000, estimated_cost_lbp: 60000 })
        : Promise.resolve({ prices: {}, lbp_per_usd: 89000 }),
    );
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();
    expect(within(section).getAllByRole("listitem")).toHaveLength(5);

    await user.type(screen.getByLabelText(/Starting Location/), "Jounieh");
    await user.type(screen.getByLabelText("Destination *"), "Batroun");
    await user.click(screen.getByRole("button", { name: "Plan Trip" }));

    await waitFor(() => expect(within(section).getAllByRole("listitem")[0]).toHaveTextContent("Jounieh to Batroun"));
    expect(within(section).getAllByRole("listitem")[0]).toHaveTextContent("12.4 km");
    expect(within(section).getAllByRole("listitem")).toHaveLength(5);
    expect(section).not.toHaveTextContent("Sidon");
    expect(limit).toHaveBeenCalledTimes(1);

    // Choosing another row refills the fields but leaves the result labelled with the route it was planned for.
    await user.click(within(section).getAllByRole("button", { name: /Beirut to Tyre/ })[0]);
    expect(document.querySelector(".trip-result-card__route")).toHaveTextContent("Jounieh to Batroun");
  });

  it("passes axe with rows and with a delete confirm open (colour contrast is checked in the browser)", async () => {
    mockBackend();
    const user = userEvent.setup();
    renderPage();
    const section = await recentSection();
    const check = async () =>
      (await axe.run(section, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id);

    expect(await check()).toEqual([]);
    await user.click(within(section).getByRole("button", { name: "Delete the trip to Byblos on 20 Nov 2026, 12:05" }));
    expect(await check()).toEqual([]);
  });
});
