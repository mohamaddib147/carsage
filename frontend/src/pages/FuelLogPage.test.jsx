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

/** The body rows of the fill-ups table, each as its cell texts. */
function tableRows() {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell").map((cell) => cell.textContent));
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
    expect(headers).toEqual(["Date", "Liters", "Cost", "Price per liter", "Price per 20 L"]);
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

    expect(tableRows()[0].slice(3)).toEqual(["—", "—"]);
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
      screen.getByRole("heading", { name: "Fill-Up History — 2005 Mercedes-Benz C230 Kompressor" }),
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
