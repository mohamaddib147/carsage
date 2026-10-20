// Tests for the Fuel Log screen (CAR-53): adding and viewing fill-ups, every
// invalid input (zero / negative / missing values, future date), the empty and
// error states, and — for a user with several cars — that the log is switchable
// per car and never mixes one car's fill-ups into another's, even when a slow
// response arrives late. Supabase is mocked. (That another USER can't see these
// rows is a database rule; it is proven against the live project by
// backend/scripts/verify_rls.py — here we check the page only ever asks for the
// caller's own cars and writes the caller's own id.)

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FuelLogPage from "./FuelLogPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import CurrencyToggle from "../components/CurrencyToggle.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { CURRENCY_STORAGE_KEY } from "../lib/currency.js";
import { supabase } from "../lib/supabaseClient.js";
import { todayLocal } from "../lib/fuelLog.js";
import { unconvertedMoney } from "../test/priceText.js";

const USER = { id: "user-123", email: "driver@example.com" };
const CAR_1 = { id: "car-1", make: "Mercedes-Benz", model: "C230 Kompressor", year: 2005 };
const CAR_2 = { id: "car-2", make: "Toyota", model: "Corolla", year: 2020 };

const ROW_A = { id: "log-a", filled_at: "2026-09-01", liters: "30", cost_amount: "45", cost_currency: "USD", created_at: "2026-09-01T09:00:00Z" };
const ROW_B = { id: "log-b", filled_at: "2026-09-21", liters: "19.6", cost_amount: "30", cost_currency: "USD", created_at: "2026-09-21T09:00:00Z" };
const ROW_LBP = { id: "log-c", filled_at: "2026-09-15", liters: "25", cost_amount: "2500000", cost_currency: "LBP", created_at: "2026-09-15T09:00:00Z" };
const ROW_OTHER_CAR = { id: "log-x", filled_at: "2026-08-08", liters: "40", cost_amount: "60", cost_currency: "USD", created_at: "2026-08-08T09:00:00Z" };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

/**
 * Wires supabase.from() for the cars list and the fuel_logs table.
 * `logsByCar[carId]` is the reply to that car's list query — a {data, error}
 * object, or a Promise for a reply that arrives late. `insertReply(row)` builds
 * the reply to an insert (default: echoes the row back with an id).
 */
function mockDatabase({ cars = [CAR_1], logsByCar = {}, insertReply } = {}) {
  const calls = { carsEq: [], logQueries: [], inserts: [] };
  let nextId = 1;

  supabase.from.mockImplementation((table) => {
    if (table === "cars") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column, value) => {
            calls.carsEq.push([column, value]);
            return { order: vi.fn().mockResolvedValue({ data: cars, error: null }) };
          }),
        })),
      };
    }
    if (table === "fuel_logs") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column, carId) => {
            calls.logQueries.push([column, carId]);
            return { order: vi.fn(() => Promise.resolve(logsByCar[carId] ?? { data: [], error: null })) };
          }),
        })),
        insert: vi.fn((row) => {
          calls.inserts.push(row);
          const reply =
            insertReply?.(row) ??
            { data: { id: `new-${nextId++}`, ...row, created_at: "2026-09-21T12:00:00Z" }, error: null };
          return { select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve(reply)) })) };
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return calls;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/fuel-log"]}>
      <AuthProvider><CurrencyProvider>
        <Routes>
          <Route path="/fuel-log" element={<FuelLogPage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
        </Routes>
      </CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
}

/**
 * Makes inserts into fuel_logs stay pending until `finish()` is called, to test
 * what the page does while a save is in flight. Call after mockDatabase().
 */
function holdInserts(calls) {
  const original = supabase.from.getMockImplementation();
  let finishSave = () => {};
  supabase.from.mockImplementation((table) => {
    const builder = original(table);
    if (table !== "fuel_logs") return builder;
    return {
      ...builder,
      insert: (row) => {
        calls.inserts.push(row);
        const reply = { data: { id: "held", ...row, created_at: "2026-09-21T12:00:00Z" }, error: null };
        return { select: () => ({ single: () => new Promise((resolve) => (finishSave = () => resolve(reply))) }) };
      },
    };
  });
  return { finish: () => finishSave() };
}

/** Every body row of the fill-ups table, each as ALL its cell texts. */
function allCells() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
}

/**
 * The body rows' date, liters and price cells (the first five columns, the
 * CAR-53/54 part of the table these older tests are about). CAR-61's Odometer
 * and km/L columns come after them and are checked by `odometerCells()`; the
 * full column order is pinned by the CAR-61 header test.
 */
function tableRows() {
  return allCells().map((cells) => cells.slice(0, 5));
}

/** The body rows' CAR-61 cells: [Odometer, km/L]. */
function odometerCells() {
  return allCells().map((cells) => cells.slice(5));
}

async function fillForm(user, { liters, cost }) {
  if (liters !== undefined) await user.type(screen.getByLabelText("Liters *"), liters);
  if (cost !== undefined) await user.type(screen.getByLabelText("Cost *"), cost);
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
});

describe("FuelLogPage — viewing", () => {
  it("lists the car's fill-ups newest first with date, liters, cost and price per liter (normal case)", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_A, ROW_B, ROW_LBP], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(screen.getByRole("columnheader", { name: "Date" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Liters" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Cost" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price per liter" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Price per 20 L" })).toBeInTheDocument();
    expect(tableRows()).toEqual([
      ["21 Sep 2026", "19.6 L", "$30.00 (2,691,000 LBP)", "$1.53/L (137,296 LBP/L)", "$30.61/20 L (2,745,918 LBP/20 L)"],
      ["15 Sep 2026", "25 L", "$27.87 (2,500,000 LBP)", "$1.11/L (100,000 LBP/L)", "$22.30/20 L (2,000,000 LBP/20 L)"],
      ["1 Sep 2026", "30 L", "$45.00 (4,036,500 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"],
    ]);
  });

  it("asks only for the signed-in user's cars, and each car's log by that car's id", async () => {
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [ROW_B], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(calls.carsEq).toEqual([["user_id", "user-123"]]);
    expect(calls.logQueries).toEqual([["car_id", "car-1"]]);
  });

  it("with one car shows its name instead of a selector", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_B], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(screen.queryByLabelText("Car")).not.toBeInTheDocument();
    expect(screen.getAllByText("2005 Mercedes-Benz C230 Kompressor").length).toBeGreaterThan(0);
  });

  it("shows a friendly empty state with an 'Add your first fill-up' prompt for a car with no fill-ups", async () => {
    const user = userEvent.setup();
    mockDatabase();

    renderPage();

    expect(await screen.findByText("No fill-ups logged yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add your first fill-up" }));
    expect(screen.getByLabelText("Liters *")).toHaveFocus();
  });

  it("shows the empty state and no form when the user has no car yet", async () => {
    mockDatabase({ cars: [] });

    renderPage();

    expect(await screen.findByRole("link", { name: "Add Your Car" })).toHaveAttribute("href", "/cars/new");
    expect(screen.queryByLabelText("Liters *")).not.toBeInTheDocument();
  });

  it("shows a friendly message, never the database's wording, if the fill-ups can't be loaded", async () => {
    mockDatabase({
      logsByCar: { "car-1": { data: null, error: { code: "XX000", message: 'relation "public.fuel_logs" does not exist' } } },
    });

    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load your fill-ups. Please try again.");
    expect(alert).not.toHaveTextContent(/relation|public\./);
    expect(screen.queryByText("No fill-ups logged yet")).not.toBeInTheDocument();
  });
});

describe("FuelLogPage — adding a fill-up", () => {
  it("defaults the date to today", async () => {
    mockDatabase();

    renderPage();

    expect(await screen.findByLabelText("Date *")).toHaveValue(todayLocal());
  });

  it("saves the entry with the caller's own ids and shows it in the list (normal case)", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [ROW_A], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "19.6", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(calls.inserts).toEqual([
      {
        user_id: "user-123",
        car_id: "car-1",
        filled_at: todayLocal(),
        liters: 19.6,
        cost_amount: 30,
        cost_currency: "USD",
      },
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("Fill-up added.");
    expect(tableRows()).toEqual([
      [expect.stringMatching(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/), "19.6 L", "$30.00 (2,691,000 LBP)", "$1.53/L (137,296 LBP/L)", "$30.61/20 L (2,745,918 LBP/20 L)"],
      ["1 Sep 2026", "30 L", "$45.00 (4,036,500 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"],
    ]);
    // the form is ready for the next one
    expect(screen.getByLabelText("Liters *")).toHaveValue(null);
    expect(screen.getByLabelText("Cost *")).toHaveValue(null);
  });

  it("removes the empty state once the first fill-up is added", async () => {
    const user = userEvent.setup();
    mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await fillForm(user, { liters: "20", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByText("No fill-ups logged yet")).not.toBeInTheDocument();
  });

  it("saves a cost typed in LBP as LBP", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await user.selectOptions(screen.getByLabelText("Currency of the cost"), "LBP");
    await fillForm(user, { liters: "25", cost: "2700000" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(calls.inserts[0]).toMatchObject({ cost_amount: 2700000, cost_currency: "LBP", liters: 25 });
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(tableRows()[0].slice(1)).toEqual(["25 L", "$30.10 (2,700,000 LBP)", "$1.20/L (108,000 LBP/L)", "$24.08/20 L (2,160,000 LBP/20 L)"]);
  });

  it("puts a fill-up dated earlier below the newer ones", async () => {
    const user = userEvent.setup();
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_B, ROW_A], error: null } } });

    renderPage();
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Date *"), { target: { value: "2026-09-10" } });
    await fillForm(user, { liters: "10", cost: "15" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    await screen.findByRole("status");
    expect(tableRows().map((row) => row[0])).toEqual(["21 Sep 2026", "10 Sep 2026", "1 Sep 2026"]);
  });

  it("shows the plain-language message, never the database's, when saving is refused", async () => {
    const user = userEvent.setup();
    mockDatabase({
      logsByCar: { "car-1": { data: [ROW_A], error: null } },
      insertReply: () => ({
        data: null,
        error: { code: "42501", message: 'new row violates row-level security policy for table "fuel_logs"' },
      }),
    });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "19.6", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You don't have permission to do that.");
    expect(alert).not.toHaveTextContent(/row-level|fuel_logs|violates/i);
    expect(tableRows()).toHaveLength(1); // nothing was added
    expect(screen.getByLabelText("Liters *")).toHaveValue(19.6); // what was typed is kept
  });

  it("describes a database rule violation in plain words", async () => {
    const user = userEvent.setup();
    mockDatabase({
      insertReply: () => ({ data: null, error: { code: "23514", message: 'violates check constraint "fuel_logs_liters_range_check"' } }),
    });

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await fillForm(user, { liters: "19.6", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/outside the allowed range/i);
    expect(alert).not.toHaveTextContent(/fuel_logs_liters_range_check/);
  });

  it("disables the button while saving so a double click can't add the entry twice", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();
    const save = holdInserts(calls);

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await fillForm(user, { liters: "19.6", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByRole("button", { name: "Saving..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Saving..." }));
    expect(calls.inserts).toHaveLength(1);

    await act(async () => save.finish());
    expect(await screen.findByRole("button", { name: "Add Fill-Up" })).toBeEnabled();
  });
});

describe("FuelLogPage — invalid input is refused before anything is saved", () => {
  it.each([
    ["zero liters", { liters: "0", cost: "30" }, "Liters must be a number greater than 0."],
    ["negative liters", { liters: "-5", cost: "30" }, "Liters must be a number greater than 0."],
    ["missing liters", { cost: "30" }, "Liters are required."],
    ["zero cost", { liters: "20", cost: "0" }, "Cost must be a number greater than 0."],
    ["negative cost", { liters: "20", cost: "-1" }, "Cost must be a number greater than 0."],
    ["missing cost", { liters: "20" }, "Cost is required."],
    ["more liters than any tank", { liters: "201", cost: "30" }, "Liters must be 200 or less."],
    ["an absurd cost", { liters: "20", cost: "10000000000000" }, "That cost is too large."],
  ])("%s", async (_label, values, message) => {
    const user = userEvent.setup();
    const calls = mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await fillForm(user, values);
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(calls.inserts).toEqual([]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("refuses a missing date", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    fireEvent.change(screen.getByLabelText("Date *"), { target: { value: "" } });
    await fillForm(user, { liters: "20", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByText("Choose the date of the fill-up.")).toBeInTheDocument();
    expect(calls.inserts).toEqual([]);
  });

  it("refuses a date in the future", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    fireEvent.change(screen.getByLabelText("Date *"), { target: { value: "2999-01-01" } });
    await fillForm(user, { liters: "20", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByText("The date can't be in the future.")).toBeInTheDocument();
    expect(calls.inserts).toEqual([]);
  });

  it("flags every empty field at once when the form is submitted blank", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByText("Liters are required.")).toBeInTheDocument();
    expect(screen.getByText("Cost is required.")).toBeInTheDocument();
    expect(calls.inserts).toEqual([]);
  });

  it("clears the messages once a valid entry is saved", async () => {
    const user = userEvent.setup();
    mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));
    await screen.findByText("Liters are required.");
    await fillForm(user, { liters: "20", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    await screen.findByRole("status");
    expect(screen.queryByText("Liters are required.")).not.toBeInTheDocument();
  });
});

describe("FuelLogPage — several cars", () => {
  const TWO_CARS = {
    cars: [CAR_1, CAR_2],
    logsByCar: {
      "car-1": { data: [ROW_B, ROW_A], error: null },
      "car-2": { data: [ROW_OTHER_CAR], error: null },
    },
  };

  it("offers a car selector, starting on the first car", async () => {
    mockDatabase(TWO_CARS);

    renderPage();

    const select = await screen.findByLabelText("Car");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "2005 Mercedes-Benz C230 Kompressor",
      "2020 Toyota Corolla",
    ]);
    expect(select).toHaveValue("car-1");
    await screen.findByRole("table");
    expect(tableRows()).toHaveLength(2);
  });

  it("switches to the other car's fill-ups and never shows the first car's alongside them", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(TWO_CARS);

    renderPage();
    await screen.findByRole("table");
    await user.selectOptions(screen.getByLabelText("Car"), "car-2");

    await waitFor(() => expect(tableRows()).toEqual([["8 Aug 2026", "40 L", "$60.00 (5,382,000 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"]]));
    expect(screen.queryByText("21 Sep 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("1 Sep 2026")).not.toBeInTheDocument();
    expect(calls.logQueries).toEqual([["car_id", "car-1"], ["car_id", "car-2"]]);

    await user.selectOptions(screen.getByLabelText("Car"), "car-1");
    await waitFor(() => expect(tableRows()).toHaveLength(2));
    expect(screen.queryByText("8 Aug 2026")).not.toBeInTheDocument();
  });

  it("shows the empty state for a car with no fill-ups even though the other car has some", async () => {
    const user = userEvent.setup();
    mockDatabase({ ...TWO_CARS, logsByCar: { "car-1": { data: [ROW_B], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await user.selectOptions(screen.getByLabelText("Car"), "car-2");

    expect(await screen.findByText("No fill-ups logged yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("saves a new fill-up against the car that is selected", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(TWO_CARS);

    renderPage();
    await screen.findByRole("table");
    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    await waitFor(() => expect(tableRows()).toHaveLength(1));
    await fillForm(user, { liters: "15", cost: "22" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    await screen.findByRole("status");
    expect(calls.inserts[0]).toMatchObject({ car_id: "car-2", user_id: "user-123" });
    expect(tableRows()).toHaveLength(2); // car 2's own entry + the new one
    await user.selectOptions(screen.getByLabelText("Car"), "car-1");
    await waitFor(() => expect(tableRows().map((row) => row[0])).toEqual(["21 Sep 2026", "1 Sep 2026"]));
  });

  it("hides the first car's fill-ups the moment the user switches, while the other car's are still loading", async () => {
    const user = userEvent.setup();
    let answerCar2;
    mockDatabase({
      cars: [CAR_1, CAR_2],
      logsByCar: {
        "car-1": { data: [ROW_B, ROW_A], error: null },
        "car-2": new Promise((resolve) => (answerCar2 = resolve)), // still on its way
      },
    });

    renderPage();
    await screen.findByRole("table");
    await user.selectOptions(screen.getByLabelText("Car"), "car-2");

    expect(screen.getByText("Loading fill-ups...")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("21 Sep 2026")).not.toBeInTheDocument();
    expect(screen.queryByText("No fill-ups logged yet")).not.toBeInTheDocument(); // not a false "empty" either

    await act(async () => answerCar2({ data: [ROW_OTHER_CAR], error: null }));
    expect(tableRows()).toEqual([["8 Aug 2026", "40 L", "$60.00 (5,382,000 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"]]);
  });

  it("ignores a slow answer for a car the user has already switched away from", async () => {
    const user = userEvent.setup();
    let answerCar1;
    mockDatabase({
      cars: [CAR_1, CAR_2],
      logsByCar: {
        "car-1": new Promise((resolve) => (answerCar1 = resolve)), // arrives late
        "car-2": { data: [ROW_OTHER_CAR], error: null },
      },
    });

    renderPage();
    await user.selectOptions(await screen.findByLabelText("Car"), "car-2");
    await waitFor(() => expect(tableRows()).toEqual([["8 Aug 2026", "40 L", "$60.00 (5,382,000 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"]]));

    await act(async () => answerCar1({ data: [ROW_A, ROW_B], error: null })); // car 1's reply lands now

    expect(tableRows()).toEqual([["8 Aug 2026", "40 L", "$60.00 (5,382,000 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"]]);
    expect(screen.queryByText("21 Sep 2026")).not.toBeInTheDocument();
  });

  it("does not drop a save that finishes after a car switch into the other car's list", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase(TWO_CARS);
    const save = holdInserts(calls);

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "12", cost: "18" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" })); // saving for car 1 ...
    await user.selectOptions(screen.getByLabelText("Car"), "car-2"); // ... then switch to car 2
    await waitFor(() => expect(tableRows()).toEqual([["8 Aug 2026", "40 L", "$60.00 (5,382,000 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"]]));

    await act(async () => save.finish());

    expect(calls.inserts[0].car_id).toBe("car-1");
    expect(tableRows()).toEqual([["8 Aug 2026", "40 L", "$60.00 (5,382,000 LBP)", "$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"]]); // car 2's list is untouched
  });
});

describe("FuelLogPage — currency toggle (CAR-54)", () => {
  /** Renders the page with the currency provider and the header switch. */
  function renderWithCurrency({ stored } = {}) {
    window.localStorage.clear();
    if (stored) window.localStorage.setItem(CURRENCY_STORAGE_KEY, stored);
    return render(
      <MemoryRouter initialEntries={["/fuel-log"]}>
        <AuthProvider>
          <CurrencyProvider>
            <CurrencyToggle />
            <Routes>
              <Route path="/fuel-log" element={<FuelLogPage />} />
            </Routes>
          </CurrencyProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  const LOGS = { logsByCar: { "car-1": { data: [ROW_B, ROW_LBP], error: null } } };
  const moneyCells = () => tableRows().map((row) => row.slice(2));

  it("shows each fill-up's cost and price per liter dollars-first by default", async () => {
    mockDatabase(LOGS);
    renderWithCurrency();
    await screen.findByRole("table");

    expect(moneyCells()).toEqual([
      ["$30.00 (2,691,000 LBP)", "$1.53/L (137,296 LBP/L)", "$30.61/20 L (2,745,918 LBP/20 L)"],
      ["$27.87 (2,500,000 LBP)", "$1.11/L (100,000 LBP/L)", "$22.30/20 L (2,000,000 LBP/20 L)"],
    ]);
  });

  it("shows them pounds-first when LBP is primary — the same amounts, an entry typed in either currency", async () => {
    mockDatabase(LOGS);
    renderWithCurrency({ stored: "LBP" });
    await screen.findByRole("table");

    expect(moneyCells()).toEqual([
      ["2,691,000 LBP ($30.00)", "137,296 LBP/L ($1.53/L)", "2,745,918 LBP/20 L ($30.61/20 L)"],
      ["2,500,000 LBP ($27.87)", "100,000 LBP/L ($1.11/L)", "2,000,000 LBP/20 L ($22.30/20 L)"],
    ]);
  });

  it("flips the table when the header switch is used", async () => {
    const user = userEvent.setup();
    mockDatabase(LOGS);
    renderWithCurrency();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "LBP" }));
    expect(moneyCells()[0]).toEqual(["2,691,000 LBP ($30.00)", "137,296 LBP/L ($1.53/L)", "2,745,918 LBP/20 L ($30.61/20 L)"]);

    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(moneyCells()[0]).toEqual(["$30.00 (2,691,000 LBP)", "$1.53/L (137,296 LBP/L)", "$30.61/20 L (2,745,918 LBP/20 L)"]);
  });

  it("starts the form's cost currency on the primary currency and follows the switch", async () => {
    const user = userEvent.setup();
    mockDatabase();
    renderWithCurrency({ stored: "LBP" });
    const currencyBox = await screen.findByLabelText("Currency of the cost");

    expect(currencyBox).toHaveValue("LBP");
    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(currencyBox).toHaveValue("USD");
  });

  it("stops following the switch once the user picks a currency for the cost themselves", async () => {
    const user = userEvent.setup();
    mockDatabase();
    renderWithCurrency();
    const currencyBox = await screen.findByLabelText("Currency of the cost");

    await user.selectOptions(currencyBox, "LBP");
    await user.click(screen.getByRole("button", { name: "USD" })); // header stays USD ...
    await user.click(screen.getByRole("button", { name: "LBP" }));
    await user.click(screen.getByRole("button", { name: "USD" }));

    expect(currencyBox).toHaveValue("LBP"); // ... the entry keeps the user's own pick
  });

  it("saves what was typed in the currency shown in the form, whatever the primary currency", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();
    renderWithCurrency({ stored: "LBP" });
    await screen.findByText("No fill-ups logged yet");

    await user.type(screen.getByLabelText("Liters *"), "20");
    await user.type(screen.getByLabelText("Cost *"), "1800000");
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    await screen.findByRole("status");
    expect(calls.inserts[0]).toMatchObject({ cost_amount: 1800000, cost_currency: "LBP" });
    expect(moneyCells()[0]).toEqual(["1,800,000 LBP ($20.07)", "90,000 LBP/L ($1.00/L)", "1,800,000 LBP/20 L ($20.07/20 L)"]);
  });
});

describe("FuelLogPage — price per 20 liters (CAR-53 addition)", () => {
  // Lebanese fuel prices are posted per 20-liter canister, so each entry shows that beside the per-liter figure.
  function renderWithCurrency({ stored } = {}) {
    window.localStorage.clear();
    if (stored) window.localStorage.setItem(CURRENCY_STORAGE_KEY, stored);
    return render(
      <MemoryRouter initialEntries={["/fuel-log"]}>
        <AuthProvider>
          <CurrencyProvider>
            <CurrencyToggle />
            <Routes>
              <Route path="/fuel-log" element={<FuelLogPage />} />
            </Routes>
          </CurrencyProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("has a 'Price per 20 L' column right after 'Price per liter'", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_B], error: null } } });
    renderWithCurrency();
    await screen.findByRole("table");

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
    // CAR-61 appended Odometer and km/L after these; this test is about the first five.
    expect(headers.slice(0, 5)).toEqual(["Date", "Liters", "Cost", "Price per liter", "Price per 20 L"]);
  });

  it("shows each entry's price per 20 liters next to its price per liter, in its own currency and converted", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_A, ROW_B, ROW_LBP], error: null } } });
    renderWithCurrency();
    await screen.findByRole("table");

    expect(tableRows().map((row) => row.slice(3))).toEqual([
      ["$1.53/L (137,296 LBP/L)", "$30.61/20 L (2,745,918 LBP/20 L)"], // 19.6 L for $30
      ["$1.11/L (100,000 LBP/L)", "$22.30/20 L (2,000,000 LBP/20 L)"], // 25 L for 2,500,000 LBP
      ["$1.50/L (134,550 LBP/L)", "$30.00/20 L (2,691,000 LBP/20 L)"], // 30 L for $45
    ]);
  });

  it("is exactly the price per liter times 20, computed from the entry (not from the rounded per-liter text)", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_B], error: null } } });
    renderWithCurrency();
    await screen.findByRole("table");

    // 19.6 L for $30: $1.53/L shown, but 20 L is $30.61 (30 / 19.6 x 20), not 1.53 x 20 = $30.60
    const per20 = tableRows()[0][4];
    expect(per20).toContain("$30.61/20 L");
    expect(per20).not.toContain("$30.60");
  });

  it("follows the currency switch like every other price", async () => {
    const user = userEvent.setup();
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_B], error: null } } });
    renderWithCurrency();
    await screen.findByRole("table");

    await user.click(screen.getByRole("button", { name: "LBP" }));
    expect(tableRows()[0][4]).toBe("2,745,918 LBP/20 L ($30.61/20 L)");

    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(tableRows()[0][4]).toBe("$30.61/20 L (2,745,918 LBP/20 L)");
  });

  it("shows the per-20-liters price of a fill-up the moment it is added", async () => {
    const user = userEvent.setup();
    mockDatabase();
    renderWithCurrency();
    await screen.findByText("No fill-ups logged yet");

    await user.type(screen.getByLabelText("Liters *"), "19.6");
    await user.type(screen.getByLabelText("Cost *"), "30");
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    await screen.findByRole("status");
    expect(tableRows()[0].slice(3)).toEqual(["$1.53/L (137,296 LBP/L)", "$30.61/20 L (2,745,918 LBP/20 L)"]);
  });

  it("a fill-up of exactly 20 liters shows the same figure for the fill and per 20 liters", async () => {
    mockDatabase({
      logsByCar: { "car-1": { data: [{ ...ROW_A, id: "twenty", liters: "20", cost_amount: "30" }], error: null } },
    });
    renderWithCurrency();
    await screen.findByRole("table");

    expect(tableRows()[0].slice(2)).toEqual([
      "$30.00 (2,691,000 LBP)",
      "$1.50/L (134,550 LBP/L)",
      "$30.00/20 L (2,691,000 LBP/20 L)",
    ]);
  });

  it("shows a dash instead of a broken figure when the price can't be worked out", async () => {
    mockDatabase({
      logsByCar: { "car-1": { data: [{ ...ROW_A, id: "zero", liters: "0", cost_amount: "30" }], error: null } },
    });
    renderWithCurrency();
    await screen.findByRole("table");

    expect(tableRows()[0].slice(3)).toEqual(["-", "-"]);
    expect(screen.getByRole("table")).not.toHaveTextContent(/NaN|Infinity/);
  });

  it("draws no money on the Fuel Log except through <Price> (so the switch reaches every figure)", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_A, ROW_B, ROW_LBP], error: null } } });
    renderWithCurrency();
    await screen.findByRole("table");

    expect(unconvertedMoney(document.body)).toEqual([]);
  });
});

describe("FuelLogPage — fill-up history bar chart (mentor feedback: replaces the price-per-liter line chart)", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows the chart, scoped to the selected car, with a single fill-up — one bar is a history too", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_A], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(
      screen.getByRole("heading", { name: "Fill-Up History for 2005 Mercedes-Benz C230 Kompressor" }),
    ).toBeInTheDocument();
  });

  it("still shows the chart with several fill-ups", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_A, ROW_B], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(screen.getByText(/Fill-Up History/)).toBeInTheDocument();
  });

  it("does not show a chart, or crash, for a car with no fill-ups yet", async () => {
    mockDatabase();

    renderPage();

    expect(await screen.findByText("No fill-ups logged yet")).toBeInTheDocument();
    expect(screen.queryByText(/Fill-Up History/)).not.toBeInTheDocument();
  });

  it("still plots a fill-up with an unusable price (e.g. zero liters) — liters is the value shown, not price", async () => {
    mockDatabase({
      logsByCar: { "car-1": { data: [{ ...ROW_A, id: "zero", liters: "0" }], error: null } },
    });

    renderPage();
    await screen.findByRole("table");

    expect(screen.getByText(/Fill-Up History/)).toBeInTheDocument();
  });

  it("only charts the selected car's fill-ups, and switches when the car does", async () => {
    const user = userEvent.setup();
    mockDatabase({
      cars: [CAR_1, CAR_2],
      logsByCar: {
        "car-1": { data: [ROW_A, ROW_B], error: null },
        "car-2": { data: [], error: null }, // no fill-ups — no chart for car 2
      },
    });

    renderPage();
    await screen.findByRole("table");
    expect(screen.getByText(/Fill-Up History/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    await screen.findByText("No fill-ups logged yet");
    expect(screen.queryByText(/Fill-Up History/)).not.toBeInTheDocument();
  });

  it("names what it's showing, in the primary currency", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [ROW_A, ROW_B], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(
      screen.getByText("Liters filled at each fill-up. Hover or tap a bar for the date, liters and cost, in USD."),
    ).toBeInTheDocument();
  });
});

describe("FuelLogPage — odometer readings and real km/L (CAR-61)", () => {
  const RATED_CAR = { ...CAR_1, fuel_efficiency: 12 };
  // The ticket's example: 84,250 -> 84,610 km = 360 km on 40 L = 9.0 km/L.
  const ODO_1 = { id: "odo-1", filled_at: "2026-10-01", liters: "35", cost_amount: "50", cost_currency: "USD", created_at: "2026-10-01T09:00:00Z", odometer_km: 84250 };
  const ODO_2 = { id: "odo-2", filled_at: "2026-10-09", liters: "40", cost_amount: "57", cost_currency: "USD", created_at: "2026-10-09T09:00:00Z", odometer_km: 84610 };
  const LEGACY = { ...ROW_A, odometer_km: null };

  async function typeOdometer(user, text) {
    await user.type(screen.getByLabelText("Odometer (km)"), text);
  }

  function setDate(value) {
    fireEvent.change(screen.getByLabelText("Date *"), { target: { value } });
  }

  function averageBlock() {
    return screen.getByText(/Your real average/).closest(".fuel-log-real-average");
  }

  it("adds Odometer and km/L columns after the existing ones, in this order", async () => {
    mockDatabase({ logsByCar: { "car-1": { data: [LEGACY], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
      "Date", "Liters", "Cost", "Price per liter", "Price per 20 L", "Odometer", "km/L",
    ]);
  });

  it("shows dashes and no average for older fill-ups without a reading (legacy rows)", async () => {
    mockDatabase({ cars: [RATED_CAR], logsByCar: { "car-1": { data: [ROW_B, LEGACY], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(odometerCells()).toEqual([["-", "-"], ["-", "-"]]);
    expect(screen.queryByText(/Your real average/)).not.toBeInTheDocument();
    expect(screen.getByText(/you do not have to fill the tank to full/)).toBeInTheDocument();
  });

  it("shows km/L on the later of two readings and the real vs rated average (normal case)", async () => {
    mockDatabase({ cars: [RATED_CAR], logsByCar: { "car-1": { data: [ODO_2, ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");

    // Newest first: the 9 Oct fill-up closes the 360 km / 40 L interval.
    expect(odometerCells()).toEqual([["84,610 km", "9.0"], ["84,250 km", "-"]]);
    expect(averageBlock()).toHaveTextContent("Your real average: 9.0 km/L (rated: 12.0 km/L)");
    expect(averageBlock()).toHaveTextContent("Based on 1 measured fill-up over 360 km. Trip Planner starts using it after 3 fill-ups and 500 km.");
  });

  it("says so plainly when the car has no rated figure, never NaN or 0", async () => {
    mockDatabase({ cars: [{ ...CAR_1, fuel_efficiency: null }], logsByCar: { "car-1": { data: [ODO_2, ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(averageBlock()).toHaveTextContent("9.0 km/L (no rated figure set for this car)");
    expect(averageBlock()).not.toHaveTextContent(/NaN|rated: 0/);
  });

  it("flags an implausible interval in its row and leaves it out of the average", async () => {
    // 84,610 -> 846,100 is an extra digit: 761,490 km on 30 L.
    const typo = { id: "odo-3", filled_at: "2026-10-15", liters: "30", cost_amount: "40", cost_currency: "USD", created_at: "2026-10-15T09:00:00Z", odometer_km: 846100 };
    mockDatabase({ cars: [RATED_CAR], logsByCar: { "car-1": { data: [typo, ODO_2, ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");

    expect(odometerCells()[0]).toEqual(["846,100 km", "- (check reading)"]);
    expect(averageBlock()).toHaveTextContent("Your real average: 9.0 km/L");
  });

  it("shows a partial-fill step (kept by the average) as a plain dash with a tooltip, not 'check reading'", async () => {
    // Small top-up (500 km / 8 L = 62.5, out of band) merges with the big fill
    // (500 km / 58 L = 8.6); the average keeps it, so its row is not an error.
    const anchor = { id: "pf1", filled_at: "2026-10-01", liters: "30", cost_amount: "20", cost_currency: "USD", created_at: "2026-10-01T09:00:00Z", odometer_km: 10000 };
    const topUp = { id: "pf2", filled_at: "2026-10-10", liters: "8", cost_amount: "6", cost_currency: "USD", created_at: "2026-10-10T09:00:00Z", odometer_km: 10500 };
    const bigFill = { id: "pf3", filled_at: "2026-10-20", liters: "58", cost_amount: "45", cost_currency: "USD", created_at: "2026-10-20T09:00:00Z", odometer_km: 11000 };
    mockDatabase({ cars: [RATED_CAR], logsByCar: { "car-1": { data: [bigFill, topUp, anchor], error: null } } });

    renderPage();
    await screen.findByRole("table");

    // Newest first: big fill (8.6), top-up (merged dash), anchor (no step).
    expect(odometerCells()).toEqual([["11,000 km", "8.6"], ["10,500 km", "-"], ["10,000 km", "-"]]);
    expect(screen.getByTitle("Counted as part of a partial fill in your average.")).toBeInTheDocument();
    expect(screen.queryByText("- (check reading)")).not.toBeInTheDocument();
    expect(averageBlock()).toHaveTextContent("Your real average: 15.2 km/L");
  });

  it("saves the reading as a number with the fill-up", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ cars: [RATED_CAR], logsByCar: { "car-1": { data: [ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "40", cost: "57" });
    await typeOdometer(user, "84610");
    expect(screen.getByLabelText("Odometer (km)")).toHaveValue("84,610"); // thousand separators
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]).toMatchObject({ car_id: "car-1", liters: 40, odometer_km: 84610 });
    await screen.findByRole("status");
    expect(screen.getByLabelText("Odometer (km)")).toHaveValue(""); // ready for the next one
  });

  it("leaves odometer_km out entirely when no reading is given (stored exactly as before)", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();

    renderPage();
    await screen.findByText("No fill-ups logged yet");
    await fillForm(user, { liters: "20", cost: "30" });
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    await screen.findByRole("status");
    expect(calls.inserts[0]).not.toHaveProperty("odometer_km");
  });

  it.each([
    ["above the 2,000,000 km limit", "2000001", /too large/],
    ["zero", "0", /must be greater than 0/],
  ])("refuses a reading %s outright, without saving (the database would reject it)", async (_label, reading, message) => {
    const user = userEvent.setup();
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "40", cost: "57" });
    await typeOdometer(user, reading);
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Odometer (km)")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("button", { name: "Save anyway" })).not.toBeInTheDocument();
    expect(calls.inserts).toEqual([]);
  });

  it.each([
    ["lower than the previous reading", "84000", /^This isn't higher than your previous reading of 84,250 km \(1 Oct 2026\)/],
    ["equal to the previous reading", "84250", /^This isn't higher than your previous reading of 84,250 km/],
  ])("warns about a reading %s, and only saves it after 'Save anyway'", async (_label, reading, message) => {
    const user = userEvent.setup();
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "40", cost: "57" });
    await typeOdometer(user, reading);
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("Odometer (km)")).not.toHaveAttribute("aria-invalid");
    expect(calls.inserts).toEqual([]); // nothing saved until the user confirms

    await user.click(screen.getByRole("button", { name: "Save anyway" }));

    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ odometer_km: Number(reading) });
    expect(await screen.findByRole("status")).toHaveTextContent("Fill-up added.");
  });

  it("drops the warning (and its Save anyway) as soon as the reading is changed", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "40", cost: "57" });
    await typeOdometer(user, "8400"); // missing a digit
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));
    await screen.findByRole("button", { name: "Save anyway" });

    await typeOdometer(user, "0"); // now 84,000... still lower, but a NEW reading: confirm again
    expect(screen.queryByRole("button", { name: "Save anyway" })).not.toBeInTheDocument();
    expect(calls.inserts).toEqual([]);
  });

  it("warns about a backdated reading that isn't below a later one, and saves it after 'Save anyway'", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [ODO_2, ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    setDate("2026-10-05"); // between the two existing readings
    await fillForm(user, { liters: "20", cost: "30" });
    await typeOdometer(user, "84700");
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This isn't lower than your later reading of 84,610 km (9 Oct 2026). Check the reading and the date.",
    );
    expect(calls.inserts).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ filled_at: "2026-10-05", odometer_km: 84700 });
  });

  it("covers a typo in the very FIRST reading: the correct one after it can still be saved", async () => {
    const user = userEvent.setup();
    // The car's only reading is a typo (an extra digit); it has no earlier
    // reading, so nothing can flag it. The real mileage must still be savable.
    const firstTypo = { ...ODO_1, odometer_km: 842500 };
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [firstTypo], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "40", cost: "57" });
    await typeOdometer(user, "84610");
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/previous reading of 842,500 km/);
    await user.click(screen.getByRole("button", { name: "Save anyway" }));
    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ odometer_km: 84610 });
  });

  it("lets the user carry on with correct readings after a saved typo (fill-ups can't be edited)", async () => {
    const user = userEvent.setup();
    const typo = { id: "odo-3", filled_at: "2026-10-15", liters: "30", cost_amount: "40", cost_currency: "USD", created_at: "2026-10-15T09:00:00Z", odometer_km: 846100 };
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [typo, ODO_2, ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "30", cost: "40" });
    await typeOdometer(user, "84900"); // the real mileage, far below the typo

    expect(screen.getByText("+290 km since your last reading (84,610 km).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));
    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ odometer_km: 84900 });
  });

  it("shows the distance since the last reading as you type, so a typo stands out", async () => {
    const user = userEvent.setup();
    mockDatabase({ logsByCar: { "car-1": { data: [ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "40" });
    await typeOdometer(user, "84610");

    expect(screen.getByText("+360 km since your last reading (84,250 km).")).toBeInTheDocument();
  });

  it("warns (without blocking) when the distance is unrealistic for the liters typed", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ logsByCar: { "car-1": { data: [ODO_1], error: null } } });

    renderPage();
    await screen.findByRole("table");
    await fillForm(user, { liters: "40", cost: "57" });
    await typeOdometer(user, "846100"); // an extra digit

    expect(screen.getByText(/doesn't look like a realistic distance/)).toBeInTheDocument();
    // A real but unlogged trip in between can look like this too, so it can still be saved.
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));
    await waitFor(() => expect(calls.inserts).toHaveLength(1));
  });

  it("won't save a reading while the car's fill-ups are still loading (nothing to check it against)", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ logsByCar: { "car-1": new Promise(() => {}) } });

    renderPage();
    await screen.findByText("Loading fill-ups...");
    await fillForm(user, { liters: "40", cost: "57" });
    await typeOdometer(user, "84610");
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Still loading this car's fill-ups.");
    expect(calls.inserts).toEqual([]);
  });

  it("never mixes two cars' readings: validation, km/L and the average are per car", async () => {
    const user = userEvent.setup();
    const CAR_2_ODO_1 = { id: "c2-1", filled_at: "2026-10-01", liters: "30", cost_amount: "40", cost_currency: "USD", created_at: "2026-10-01T09:00:00Z", odometer_km: 10000 };
    const CAR_2_ODO_2 = { id: "c2-2", filled_at: "2026-10-09", liters: "30", cost_amount: "40", cost_currency: "USD", created_at: "2026-10-09T09:00:00Z", odometer_km: 10450 };
    const calls = mockDatabase({
      cars: [RATED_CAR, { ...CAR_2, fuel_efficiency: 15 }],
      logsByCar: {
        "car-1": { data: [ODO_2, ODO_1], error: null },
        "car-2": { data: [CAR_2_ODO_2, CAR_2_ODO_1], error: null },
      },
    });

    renderPage();
    await screen.findByRole("table");
    expect(averageBlock()).toHaveTextContent("9.0 km/L (rated: 12.0 km/L)");

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    await waitFor(() => expect(odometerCells()).toEqual([["10,450 km", "15.0"], ["10,000 km", "-"]]));
    // 450 km / 30 L = 15.0, and the rated figure is car 2's own.
    expect(averageBlock()).toHaveTextContent("15.0 km/L (rated: 15.0 km/L)");

    // 10,900 km is fine for car 2 even though it is far below car 1's 84,610 km.
    await fillForm(user, { liters: "30", cost: "40" });
    await typeOdometer(user, "10900");
    expect(screen.getByText("+450 km since your last reading (10,450 km).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Fill-Up" }));
    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ car_id: "car-2", odometer_km: 10900 });
  });
});
