// Tests for the Maintenance screen (CAR-62): no car / no items / no readings, presets
// that only fill the form, adding (and its validation, incl. a future date in Beirut),
// the urgency order and badges, Mark as done (ONE insert into maintenance_records, the
// item untouched), Edit (only the editable columns), Delete and Undo (each only after a
// confirmation), plain-language errors, a ?car= link, and two cars never mixing.
// Supabase is mocked; that another USER can't reach these rows is proven against the
// live project by backend/scripts/verify_rls.py (section 11).

import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MaintenancePage from "./MaintenancePage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { addPhoto } from "../lib/recordPhotos.js";
import { scanPhoto } from "../lib/scanPhoto.js";
import { supabase } from "../lib/supabaseClient.js";

// The odometer scan sends a photo to the backend: mocked, so no network call happens.
vi.mock("../lib/scanPhoto.js", () => ({ scanPhoto: vi.fn() }));

// Photos attach to a saved completion through lib/recordPhotos.js: addPhoto is mocked (no storage call).
vi.mock("../lib/recordPhotos.js", async (importOriginal) => ({ ...(await importOriginal()), addPhoto: vi.fn() }));

const USER = { id: "user-123", email: "driver@example.com" };
const CAR_1 = { id: "car-1", make: "Mercedes-Benz", model: "C230", year: 2005 };
const CAR_2 = { id: "car-2", make: "Toyota", model: "Corolla", year: 2020 };
const TODAY = "2026-10-19"; // the pinned Beirut date (see beforeEach)

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

function item(overrides = {}) {
  return {
    id: "item-1",
    car_id: "car-1",
    name: "Oil change",
    interval_km: 5000,
    interval_months: 6,
    baseline_date: "2026-08-01",
    baseline_km: 84000,
    notes: null,
    created_at: "2026-08-01T09:00:00Z",
    maintenance_records: [],
    ...overrides,
  };
}

function reading(carId, km, date = "2026-10-10") {
  return { id: `f-${carId}-${km}`, car_id: carId, filled_at: date, created_at: `${date}T09:00:00Z`, liters: 40, odometer_km: km };
}

/**
 * Wires supabase.from() for every table the page touches. `itemsByCar[carId]` and
 * `readingsByCar[carId]` are the replies for that car; `writeError` makes every write
 * fail. Returns the recorded calls.
 */
function mockDatabase({ cars = [CAR_1], itemsByCar = {}, readingsByCar = {}, itemsError = null, writeError = null } = {}) {
  const calls = { itemQueries: [], readingQueries: [], itemInserts: [], itemUpdates: [], itemDeletes: [], recordInserts: [], recordDeletes: [] };
  const reply = { error: writeError };

  supabase.from.mockImplementation((table) => {
    if (table === "cars") {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: cars, error: null }) })) })) };
    }
    if (table === "maintenance_items") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column, carId) => {
            calls.itemQueries.push([column, carId]);
            // A function value gets the query's number (1 = first load), to model a reload.
            const value = itemsByCar[carId];
            const data = typeof value === "function" ? value(calls.itemQueries.length) : (value ?? []);
            return { order: vi.fn().mockResolvedValue(itemsError ? { data: null, error: itemsError } : { data, error: null }) };
          }),
        })),
        insert: vi.fn((row) => {
          calls.itemInserts.push(row);
          return Promise.resolve(reply);
        }),
        update: vi.fn((row) => ({
          eq: vi.fn((column, id) => {
            calls.itemUpdates.push({ row, where: [column, id] });
            return Promise.resolve(reply);
          }),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn((column, id) => {
            calls.itemDeletes.push([column, id]);
            return Promise.resolve(reply);
          }),
        })),
      };
    }
    if (table === "fuel_logs") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column, carId) => {
            calls.readingQueries.push([column, carId]);
            return Promise.resolve({ data: readingsByCar[carId] ?? [], error: null });
          }),
        })),
      };
    }
    if (table === "maintenance_records") {
      return {
        // insert(...).select("id").single() -> the new completion's id (photos attach to it after saving).
        insert: vi.fn((row) => {
          calls.recordInserts.push(row);
          return { select: () => ({ single: () => Promise.resolve({ data: { id: "rec-new" }, error: reply.error }) }) };
        }),
        delete: vi.fn(() => ({
          eq: vi.fn((column, id) => {
            calls.recordDeletes.push([column, id]);
            return Promise.resolve(reply);
          }),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return calls;
}

function renderPage(path = "/maintenance") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Each item card as { name, badge }, in display order. */
function cards() {
  return screen.getAllByRole("listitem").filter((li) => li.classList.contains("maintenance-card")).map((card) => ({
    name: within(card).getByRole("heading").textContent,
    badge: card.querySelector(".maintenance-badge").textContent,
  }));
}

function cardFor(name) {
  return screen.getByRole("heading", { name }).closest(".maintenance-card");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Only Date is faked (timers stay real for userEvent): 09:00 UTC = 12:00 in Beirut on 19 Oct.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-19T09:00:00Z"));
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MaintenancePage — empty states", () => {
  it("asks for a car first when the user has none", async () => {
    mockDatabase({ cars: [] });
    renderPage();

    expect(await screen.findByRole("link", { name: "Add Your Car" })).toHaveAttribute("href", "/cars/new");
  });

  it("shows a friendly empty state and the presets for a car with nothing tracked", async () => {
    mockDatabase();
    renderPage();

    expect(await screen.findByText("Nothing tracked yet")).toBeInTheDocument();
    for (const name of ["Oil change", "Tire rotation", "Brake check", "Vehicle inspection", "Insurance renewal"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.getByText("No odometer reading yet for this car.")).toBeInTheDocument();
  });

  it("shows a plain message, never the database's wording, if the items can't be loaded", async () => {
    mockDatabase({ itemsError: { code: "XX000", message: 'relation "public.maintenance_items" does not exist' } });
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load your maintenance items. Please try again.");
    expect(alert).not.toHaveTextContent(/relation|public\./);
  });
});

describe("MaintenancePage — adding an item", () => {
  it("a preset only FILLS the form; nothing is saved until Save, then one row with the caller's ids", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ readingsByCar: { "car-1": [reading("car-1", 84610)] } });
    renderPage();

    // The presets show while the car's items and fuel-log readings are still loading, and a
    // preset fills the odometer from the readings loaded AT THAT MOMENT: wait for them.
    await screen.findByText("Nothing tracked yet");
    await user.click(screen.getByRole("button", { name: "Oil change" }));
    expect(screen.getByLabelText("Name *")).toHaveValue("Oil change");
    expect(screen.getByLabelText("Every (km)")).toHaveValue("5,000");
    expect(screen.getByLabelText("Every (months)")).toHaveValue("6");
    expect(screen.getByLabelText("Last done on *")).toHaveValue(TODAY);
    expect(screen.getByLabelText("Odometer when last done (km)")).toHaveValue("84,610"); // the latest reading
    expect(calls.itemInserts).toEqual([]); // not auto-created

    await user.clear(screen.getByLabelText("Every (km)"));
    await user.type(screen.getByLabelText("Every (km)"), "7500"); // editable before saving
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(calls.itemInserts).toHaveLength(1));
    expect(calls.itemInserts[0]).toEqual({
      user_id: "user-123",
      car_id: "car-1",
      name: "Oil change",
      interval_km: 7500,
      interval_months: 6,
      baseline_date: TODAY,
      baseline_km: 84610,
      notes: null,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Oil change added.");
    expect(calls.itemQueries).toHaveLength(2); // reloaded after saving
  });

  it("Cancel closes the form without saving anything", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Insurance renewal" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Name *")).not.toBeInTheDocument();
    expect(calls.itemInserts).toEqual([]);
  });

  it("refuses an item with no interval, without saving", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "+ Custom item" }));
    await user.type(screen.getByLabelText("Name *"), "Car wash");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    expect(await screen.findByText(/Set how often it's due/)).toBeInTheDocument();
    expect(calls.itemInserts).toEqual([]);
  });

  it("refuses a 'last done' date in the future (tomorrow in Beirut)", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Vehicle inspection" }));
    fireEvent.change(screen.getByLabelText("Last done on *"), { target: { value: "2026-10-20" } });
    await user.click(screen.getByRole("button", { name: "Save item" }));

    expect(await screen.findByText("The date can't be in the future.")).toBeInTheDocument();
    expect(calls.itemInserts).toEqual([]);
  });

  it("requires the odometer when the item is tracked by km", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(); // no reading, so the field starts empty
    renderPage();

    await screen.findByText("Nothing tracked yet");
    await user.click(screen.getByRole("button", { name: "Tire rotation" }));
    await user.click(screen.getByRole("button", { name: "Save item" }));

    expect(await screen.findByText(/Enter the odometer when it was last done/)).toBeInTheDocument();
    expect(calls.itemInserts).toEqual([]);
  });

  it("describes a failed save in plain words", async () => {
    const user = userEvent.setup();
    mockDatabase({ writeError: { code: "42501", message: "new row violates row-level security policy for table maintenance_items" } });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Insurance renewal" }));
    await user.click(screen.getByRole("button", { name: "Save item" }));

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/row-level security|maintenance_items/);
  });
});

describe("MaintenancePage — status and order", () => {
  it("sorts by urgency with the right badges (Overdue, Due soon, OK)", async () => {
    mockDatabase({
      itemsByCar: {
        "car-1": [
          item({ id: "ok", name: "Brake check", interval_km: null, interval_months: 12, baseline_date: "2026-09-01", baseline_km: null }),
          item({ id: "soon", name: "Insurance renewal", interval_km: null, interval_months: 12, baseline_date: "2025-10-25", baseline_km: null }), // due 25 Oct: 6 days
          item({ id: "late", name: "Vehicle inspection", interval_km: null, interval_months: 12, baseline_date: "2025-10-01", baseline_km: null }), // due 1 Oct
        ],
      },
    });
    renderPage();
    await screen.findByRole("heading", { name: "Brake check" });

    expect(cards()).toEqual([
      { name: "Vehicle inspection", badge: "Overdue" },
      { name: "Insurance renewal", badge: "Due soon" },
      { name: "Brake check", badge: "OK" },
    ]);
    expect(cardFor("Vehicle inspection")).toHaveTextContent("Next due: 1 Oct 2026 (18 days overdue)");
    expect(cardFor("Insurance renewal")).toHaveTextContent("(6 days left)");
  });

  it("counts a due date of TODAY as Due soon, not Overdue", async () => {
    mockDatabase({ itemsByCar: { "car-1": [item({ interval_km: null, interval_months: 12, baseline_date: "2025-10-19", baseline_km: null })] } });
    renderPage();

    await screen.findByRole("heading", { name: "Oil change" });
    expect(cards()[0].badge).toBe("Due soon");
    expect(cardFor("Oil change")).toHaveTextContent("(due today)");
  });

  it("shows 'Add an odometer reading' (not OK) for a km item on a car with no reading, with a Fuel Log link", async () => {
    mockDatabase({ itemsByCar: { "car-1": [item({ interval_months: null })] } });
    renderPage();

    await screen.findByRole("heading", { name: "Oil change" });
    expect(cards()[0].badge).toBe("Add an odometer reading");
    expect(screen.getByRole("link", { name: "Fuel Log" })).toHaveAttribute("href", "/fuel-log");
  });

  it("uses the car's latest reading for km items", async () => {
    // Due at 89,000 km; the car is at 88,700 km -> 300 km left -> Due soon.
    mockDatabase({
      itemsByCar: { "car-1": [item({ interval_months: null })] },
      readingsByCar: { "car-1": [reading("car-1", 86000, "2026-09-01"), reading("car-1", 88700)] },
    });
    renderPage();

    await screen.findByRole("heading", { name: "Oil change" });
    expect(cards()[0].badge).toBe("Due soon");
    expect(cardFor("Oil change")).toHaveTextContent("Next due: at 89,000 km (300 km left)");
    expect(screen.getByText(/Latest odometer: 88,700 km/)).toBeInTheDocument();
  });

  it("restarts the schedule from the latest completion, not the baseline", async () => {
    mockDatabase({
      itemsByCar: {
        "car-1": [item({
          interval_km: null,
          interval_months: 6,
          baseline_date: "2025-01-01",
          maintenance_records: [{ id: "r1", done_on: "2026-09-01", odometer_km: 88000, note: null, created_at: "2026-09-01T10:00:00Z" }],
        })],
      },
    });
    renderPage();

    await screen.findByRole("heading", { name: "Oil change" });
    expect(cards()[0].badge).toBe("OK");
    expect(cardFor("Oil change")).toHaveTextContent("Next due: 1 Mar 2027");
    expect(cardFor("Oil change")).toHaveTextContent("Last done 1 Sep 2026 at 88,000 km");
  });
});

describe("MaintenancePage — Mark as done", () => {
  it("records ONE completion (today, the latest reading) and never edits the item itself", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({
      itemsByCar: { "car-1": [item()] },
      readingsByCar: { "car-1": [reading("car-1", 89100)] },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Mark as done" }));
    expect(screen.getByLabelText("Done on *")).toHaveValue(TODAY);
    expect(screen.getByLabelText("Odometer (km) *")).toHaveValue("89,100");
    await user.type(screen.getByLabelText("Note"), "New filter too");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls.recordInserts).toHaveLength(1));
    expect(calls.recordInserts[0]).toEqual({ user_id: "user-123", item_id: "item-1", done_on: TODAY, odometer_km: 89100, note: "New filter too" });
    expect(calls.itemUpdates).toEqual([]); // history is a new row; the item is untouched
    expect(await screen.findByRole("status")).toHaveTextContent("Oil change marked as done.");
  });

  it("shows the success message only once the list already shows the completion", async () => {
    const user = userEvent.setup();
    const done = { id: "r1", done_on: TODAY, odometer_km: 89100, note: null, created_at: "2026-10-19T09:00:00Z" };
    mockDatabase({
      itemsByCar: { "car-1": (queryNumber) => (queryNumber === 1 ? [item()] : [item({ maintenance_records: [done] })]) },
      readingsByCar: { "car-1": [reading("car-1", 89100)] },
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Mark as done" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("status");
    // At the moment the message is shown, the card is already up to date.
    expect(cardFor("Oil change")).toHaveTextContent("Last done 19 Oct 2026 at 89,100 km");
    expect(within(cardFor("Oil change")).getByRole("button", { name: "History (1)" })).toBeInTheDocument();
  });

  it("refuses a completion date in the future (Beirut)", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ itemsByCar: { "car-1": [item()] }, readingsByCar: { "car-1": [reading("car-1", 89100)] } });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Mark as done" }));
    fireEvent.change(screen.getByLabelText("Done on *"), { target: { value: "2026-10-20" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The date can't be in the future.")).toBeInTheDocument();
    expect(calls.recordInserts).toEqual([]);
  });

  it("needs the odometer for a km item, but not for a date-only item", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({
      itemsByCar: { "car-1": [item(), item({ id: "item-2", name: "Insurance renewal", interval_km: null, interval_months: 12, baseline_km: null })] },
    });
    renderPage();

    await user.click(within(await screen.findByRole("heading", { name: "Oil change" }).then((h) => h.closest(".maintenance-card"))).getByRole("button", { name: "Mark as done" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Enter the odometer reading/)).toBeInTheDocument();
    expect(calls.recordInserts).toEqual([]);

    await user.click(within(cardFor("Insurance renewal")).getByRole("button", { name: "Mark as done" }));
    expect(screen.getByLabelText("Odometer (km)")).toHaveValue(""); // optional here
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.recordInserts).toHaveLength(1));
    expect(calls.recordInserts[0]).toMatchObject({ item_id: "item-2", odometer_km: null });
  });
});

describe("MaintenancePage — edit, delete and undo", () => {
  it("Edit sends only the editable columns (never the car or the owner)", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ itemsByCar: { "car-1": [item()] } });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Every (months)"));
    await user.type(screen.getByLabelText("Every (months)"), "12");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(calls.itemUpdates).toHaveLength(1));
    expect(calls.itemUpdates[0].where).toEqual(["id", "item-1"]);
    expect(Object.keys(calls.itemUpdates[0].row).sort()).toEqual(["baseline_date", "baseline_km", "interval_km", "interval_months", "name", "notes"]);
    expect(calls.itemUpdates[0].row.interval_months).toBe(12);
  });

  it("Delete only happens after the confirmation; 'Keep it' does nothing", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ itemsByCar: { "car-1": [item()] } });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Delete Oil change and its history (0 completions)?");
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(calls.itemDeletes).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.itemDeletes).toEqual([["id", "item-1"]]));
  });

  it("Undo removes one completion only after the confirmation", async () => {
    const user = userEvent.setup();
    const records = [
      { id: "r-old", done_on: "2026-05-01", odometer_km: 86000, note: null, created_at: "2026-05-01T09:00:00Z" },
      { id: "r-new", done_on: "2026-09-01", odometer_km: 88000, note: "Wrong date", created_at: "2026-09-01T09:00:00Z" },
    ];
    const calls = mockDatabase({ itemsByCar: { "car-1": [item({ maintenance_records: records })] } });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "History (2)" }));
    const history = screen.getByRole("list", { name: "Oil change history" });
    expect(within(history).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      expect.stringContaining("1 Sep 2026 at 88,000 km (Wrong date)"),
      expect.stringContaining("1 May 2026 at 86,000 km"),
    ]);

    await user.click(screen.getByRole("button", { name: "Undo the completion on 1 Sep 2026" }));
    expect(calls.recordDeletes).toEqual([]); // not yet
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(calls.recordDeletes).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Undo the completion on 1 Sep 2026" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(calls.recordDeletes).toEqual([["id", "r-new"]]));
    expect(await screen.findByRole("status")).toHaveTextContent("Completion of Oil change on 1 Sep 2026 undone.");
  });

  it("each completion has its own Photos control, closed, so no photo is fetched until it is opened", async () => {
    const user = userEvent.setup();
    const records = [{ id: "r-1", done_on: "2026-09-01", odometer_km: 88000, note: null, created_at: "2026-09-01T09:00:00Z" }];
    mockDatabase({ itemsByCar: { "car-1": [item({ maintenance_records: records })] } });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "History (1)" }));
    const toggle = screen.getByRole("button", { name: "Show photos for the Oil change completion on 1 Sep 2026" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(supabase.from).not.toHaveBeenCalledWith("maintenance_record_photos");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("MaintenancePage — several cars", () => {
  const TWO = {
    cars: [CAR_1, CAR_2],
    itemsByCar: {
      "car-1": [item({ id: "c1", name: "Mercedes oil", interval_months: null })], // due at 89,000
      "car-2": [item({ id: "c2", car_id: "car-2", name: "Toyota oil", interval_months: null, baseline_km: 10000 })], // due at 15,000
    },
    readingsByCar: { "car-1": [reading("car-1", 88800)], "car-2": [reading("car-2", 10200)] },
  };

  it("never mixes cars: each car shows only its own items, judged by its own reading", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(TWO);
    renderPage();

    await screen.findByRole("heading", { name: "Mercedes oil" });
    expect(cards()).toEqual([{ name: "Mercedes oil", badge: "Due soon" }]); // 200 km left on car 1

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    await screen.findByRole("heading", { name: "Toyota oil" });
    expect(cards()).toEqual([{ name: "Toyota oil", badge: "OK" }]); // 4,800 km left on car 2
    expect(screen.queryByRole("heading", { name: "Mercedes oil" })).not.toBeInTheDocument();
    expect(screen.getByText(/Latest odometer: 10,200 km/)).toBeInTheDocument();
    expect(calls.itemQueries).toEqual([["car_id", "car-1"], ["car_id", "car-2"]]);
    expect(calls.readingQueries).toEqual([["car_id", "car-1"], ["car_id", "car-2"]]);
  });

  it("adds an item to the SELECTED car", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(TWO);
    renderPage();

    await screen.findByRole("heading", { name: "Mercedes oil" });
    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    await screen.findByRole("heading", { name: "Toyota oil" });
    await user.click(screen.getByRole("button", { name: "Insurance renewal" }));
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(calls.itemInserts).toHaveLength(1));
    expect(calls.itemInserts[0]).toMatchObject({ car_id: "car-2", user_id: "user-123" });
  });

  it("opens on the car named in a ?car= link (as the Dashboard card uses)", async () => {
    mockDatabase(TWO);
    renderPage("/maintenance?car=car-2#maintenance-item-c2");

    expect(await screen.findByRole("heading", { name: "Toyota oil" })).toBeInTheDocument();
    expect(screen.getByLabelText("Car")).toHaveValue("car-2");
  });

  it("ignores a ?car= that isn't one of the user's cars", async () => {
    mockDatabase(TWO);
    renderPage("/maintenance?car=someone-elses-car");

    expect(await screen.findByRole("heading", { name: "Mercedes oil" })).toBeInTheDocument();
    expect(screen.getByLabelText("Car")).toHaveValue("car-1");
  });
});

describe("MaintenancePage — odometer scan", () => {
  const photo = () => new File([new Uint8Array(10)], "odo.jpg", { type: "image/jpeg" });
  const ONE_ITEM = { itemsByCar: { "car-1": [item()] }, readingsByCar: { "car-1": [reading("car-1", 89100, "2026-10-10")] } };

  async function openMarkAsDone(user) {
    await user.click(await screen.findByRole("button", { name: "Mark as done" }));
  }

  it("Mark as done: a scan REPLACES the suggested reading, fills the field for review and saves nothing", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(ONE_ITEM);
    scanPhoto.mockResolvedValue({ readable: true, odometer_km: 89500 });
    renderPage();

    await openMarkAsDone(user);
    expect(screen.getByLabelText("Odometer (km) *")).toHaveValue("89,100"); // the suggestion
    await user.upload(document.getElementById("done-km-scan-item-1"), photo());

    await waitFor(() => expect(screen.getByLabelText("Odometer (km) *")).toHaveValue("89,500"));
    expect(scanPhoto).toHaveBeenCalledWith("/fuel-log/scan-odometer", expect.any(File), undefined);
    expect(calls.recordInserts).toEqual([]); // never saved by a scan
    expect(calls.itemInserts).toEqual([]);
  });

  it("an unreadable photo changes nothing and says so", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    scanPhoto.mockResolvedValue({ readable: false, odometer_km: null });
    renderPage();

    await openMarkAsDone(user);
    await user.upload(document.getElementById("done-km-scan-item-1"), photo());

    expect(await screen.findByText(/Couldn't read that as an odometer display/)).toBeInTheDocument();
    expect(screen.getByLabelText("Odometer (km) *")).toHaveValue("89,100");
  });

  it("a failed scan (e.g. the daily limit) shows the backend's plain message", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    scanPhoto.mockRejectedValue(new Error("You've reached today's limit of 20 for this feature. It resets at midnight Beirut time."));
    renderPage();

    await openMarkAsDone(user);
    await user.upload(document.getElementById("done-km-scan-item-1"), photo());

    expect(await screen.findByText(/reached today's limit of 20/)).toBeInTheDocument();
  });

  it("refuses a non-image without sending it, and shows the Google free-tier notice by the button", async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    expect(screen.getAllByText(/sent to Google's Gemini API/).length).toBeGreaterThan(0);
    await user.upload(document.getElementById("done-km-scan-item-1"), new File(["x"], "a.pdf", { type: "application/pdf" }));

    expect(await screen.findByText(/Please choose a photo/)).toBeInTheDocument();
    expect(scanPhoto).not.toHaveBeenCalled();
  });

  it("Mark as done: warns (without blocking) when the reading is lower than the car's latest and the date is on or after it", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    const odometer = screen.getByLabelText("Odometer (km) *");
    expect(screen.queryByText(/Lower than your latest reading/)).not.toBeInTheDocument(); // the suggestion itself is fine
    await user.clear(odometer);
    await user.type(odometer, "85000");

    expect(await screen.findByText("Lower than your latest reading of 89,100 km (10 Oct 2026). Check the reading.")).toBeInTheDocument();

    // not blocking: it still saves
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.recordInserts).toHaveLength(1));
    expect(calls.recordInserts[0].odometer_km).toBe(85000);
  });

  it("Mark as done: no warning for a BACKDATED completion, or for a reading at or above the latest", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    const odometer = screen.getByLabelText("Odometer (km) *");
    await user.clear(odometer);
    await user.type(odometer, "85000");
    expect(await screen.findByText(/Lower than your latest reading/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Done on *"), { target: { value: "2026-10-05" } }); // before the 10 Oct reading
    await waitFor(() => expect(screen.queryByText(/Lower than your latest reading/)).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Done on *"), { target: { value: TODAY } });
    await user.clear(odometer);
    await user.type(odometer, "89100"); // equal to the latest
    expect(screen.queryByText(/Lower than your latest reading/)).not.toBeInTheDocument();
  });

  it("a scanned reading below the latest also gets the warning (it is just a filled field)", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    scanPhoto.mockResolvedValue({ readable: true, odometer_km: 8910 }); // a dropped digit
    renderPage();

    await openMarkAsDone(user);
    await user.upload(document.getElementById("done-km-scan-item-1"), photo());

    expect(await screen.findByText(/Lower than your latest reading of 89,100 km/)).toBeInTheDocument();
  });

  it("the item form: a scan fills 'Odometer when last done (km)' and there is NO car-reading check there", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(ONE_ITEM);
    scanPhoto.mockResolvedValue({ readable: true, odometer_km: 80000 }); // lower than the latest, normal for a past service
    renderPage();

    await user.click(await screen.findByRole("button", { name: "+ Custom item" }));
    await user.upload(document.querySelector('input[id$="baselineKmScan"]'), photo());

    await waitFor(() => expect(screen.getByLabelText("Odometer when last done (km)")).toHaveValue("80,000"));
    expect(screen.queryByText(/Lower than your latest reading/)).not.toBeInTheDocument();
    expect(calls.itemInserts).toEqual([]); // nothing saved
  });
});

describe("MaintenancePage — photos or a receipt on Mark as done", () => {
  const ONE_ITEM = { itemsByCar: { "car-1": [item()] }, readingsByCar: { "car-1": [reading("car-1", 89100, "2026-10-10")] } };
  const photo = (name = "receipt.jpg") => new File([new Uint8Array(10)], name, { type: "image/jpeg" });
  const addInput = () => screen.getByLabelText("Add a photo for Oil change");

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
    addPhoto.mockResolvedValue({ id: "p", storage_path: "x", slot: 1 });
  });

  async function openMarkAsDone(user) {
    await user.click(await screen.findByRole("button", { name: "Mark as done" }));
  }

  it("shows the optional photo row under Note, with the stored-only line", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    expect(screen.getByText("Photos or receipt (optional, up to 3)")).toBeInTheDocument();
    expect(screen.getByText("Kept in your private storage with this completion. Never sent to Google.")).toBeInTheDocument();
    expect(addPhoto).not.toHaveBeenCalled();
  });

  it("nothing is uploaded when a photo is picked; photos attach only AFTER the completion is saved, to its new id", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), photo("a.jpg"));
    await user.upload(addInput(), photo("b.jpg"));
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(addPhoto).not.toHaveBeenCalled(); // choosing is not saving
    expect(calls.recordInserts).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(addPhoto).toHaveBeenCalledTimes(2));
    expect(addPhoto).toHaveBeenNthCalledWith(1, "maintenance", expect.objectContaining({ userId: "user-123", parentId: "rec-new", slot: 1 }));
    expect(addPhoto).toHaveBeenNthCalledWith(2, "maintenance", expect.objectContaining({ userId: "user-123", parentId: "rec-new", slot: 2 }));
    expect(calls.recordInserts).toHaveLength(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Oil change marked as done.");
  });

  it("a photo is never sent to the backend or Google (stored only)", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), photo());
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(addPhoto).toHaveBeenCalledTimes(1));
    expect(scanPhoto).not.toHaveBeenCalled();
  });

  it("stops offering the add control at 3 photos", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    for (const name of ["1.jpg", "2.jpg", "3.jpg"]) await user.upload(addInput(), photo(name));

    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.queryByLabelText("Add a photo for Oil change")).not.toBeInTheDocument();
  });

  it("a photo can be removed before saving", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), photo("a.jpg"));
    await user.upload(addInput(), photo("b.jpg"));
    await user.click(screen.getByRole("button", { name: "Remove photo 1 for Oil change" }));
    expect(screen.getAllByRole("img")).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(addPhoto).toHaveBeenCalledTimes(1));
    expect(addPhoto.mock.calls[0][1].file.name).toBe("b.jpg");
  });

  it("if one photo fails, the completion stays saved and the notice says so", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(ONE_ITEM);
    addPhoto.mockResolvedValueOnce({ id: "p1", storage_path: "x", slot: 1 }).mockRejectedValueOnce(new Error("upload failed"));
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), photo("a.jpg"));
    await user.upload(addInput(), photo("b.jpg"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved, but 1 photo couldn't be attached. You can add it from History.");
    expect(calls.recordInserts).toHaveLength(1);
    expect(addPhoto).toHaveBeenCalledTimes(2); // the second still tried after the first
  });

  it("several failures are counted in the notice", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    addPhoto.mockRejectedValue(new Error("down"));
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), photo("a.jpg"));
    await user.upload(addInput(), photo("b.jpg"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved, but 2 photos couldn't be attached. You can add them from History.");
  });

  it("if the completion itself fails to save, no photo is attempted and the form keeps its photos", async () => {
    const user = userEvent.setup();
    mockDatabase({ ...ONE_ITEM, writeError: { code: "42501", message: "row-level security" } });
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), photo("a.jpg"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("You don't have permission to do that.")).toBeInTheDocument();
    expect(addPhoto).not.toHaveBeenCalled();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("closing the form drops the chosen photos (nothing was uploaded)", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), photo("a.jpg"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await openMarkAsDone(user);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(addPhoto).not.toHaveBeenCalled();
  });

  it("refuses a non-image without keeping it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockDatabase(ONE_ITEM);
    renderPage();

    await openMarkAsDone(user);
    await user.upload(addInput(), new File(["x"], "a.pdf", { type: "application/pdf" }));

    expect(await screen.findByText(/Please choose a photo/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("the new-item and edit forms have no photo row (Mark as done only)", async () => {
    const user = userEvent.setup();
    mockDatabase(ONE_ITEM);
    renderPage();

    await user.click(await screen.findByRole("button", { name: "+ Custom item" }));
    expect(screen.queryByText(/Photos or receipt/)).not.toBeInTheDocument();
  });
});
