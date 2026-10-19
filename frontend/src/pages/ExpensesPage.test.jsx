// Tests for the Expenses screen (CAR-64): no car; the empty states (no expenses, no
// fill-ups, neither: a sentence, never NaN or a fake zero); adding (the categories incl.
// Fines, the exact row saved, a future date in Beirut and other invalid input refused,
// a failed save in plain words); this month's total with mixed USD/LBP entries and the
// real header USD | LBP switch flipping it; month boundaries around Beirut midnight on
// the last day of a month; no amount drawn outside <Price>; delete only after a
// confirmation; and two cars never mixing. Supabase is mocked; that another USER can't
// reach these rows is proven against the live project by backend/scripts/verify_rls.py.

import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ExpensesPage from "./ExpensesPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import CurrencyToggle from "../components/CurrencyToggle.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { priceText, unconvertedMoney } from "../test/priceText.js";

const USER = { id: "user-123", email: "driver@example.com" };
const CAR_1 = { id: "car-1", make: "Mercedes-Benz", model: "C230", year: 2005 };
const CAR_2 = { id: "car-2", make: "Toyota", model: "Corolla", year: 2020 };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}));

const expense = (id, date, category, amount, currency = "USD", note = null) => ({
  id, spent_on: date, category, amount: String(amount), currency, note, created_at: `${date}T09:00:00Z`,
});
const fill = (id, date, amount, currency = "USD") => ({ id, filled_at: date, cost_amount: String(amount), cost_currency: currency });

/** Wires supabase.from() for cars, car_expenses (list/insert/delete) and fuel_logs (costs). */
function mockDatabase({ cars = [CAR_1], expensesByCar = {}, fuelByCar = {}, expensesError = null, writeError = null } = {}) {
  const calls = { expenseQueries: [], fuelQueries: [], inserts: [], deletes: [] };
  supabase.from.mockImplementation((table) => {
    if (table === "cars") {
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: cars, error: null }) })) })) };
    }
    if (table === "car_expenses") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column, carId) => {
            calls.expenseQueries.push([column, carId]);
            const value = expensesByCar[carId];
            const data = typeof value === "function" ? value(calls.expenseQueries.length) : (value ?? []);
            return { order: vi.fn().mockResolvedValue(expensesError ? { data: null, error: expensesError } : { data, error: null }) };
          }),
        })),
        insert: vi.fn((row) => {
          calls.inserts.push(row);
          return Promise.resolve({ error: writeError });
        }),
        delete: vi.fn(() => ({
          eq: vi.fn((column, id) => {
            calls.deletes.push([column, id]);
            return Promise.resolve({ error: writeError });
          }),
        })),
      };
    }
    if (table === "fuel_logs") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn((column, carId) => {
            calls.fuelQueries.push([column, carId]);
            return Promise.resolve({ data: fuelByCar[carId] ?? [], error: null });
          }),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return calls;
}

function renderPage() {
  window.localStorage.clear();
  return render(
    <MemoryRouter initialEntries={["/expenses"]}>
      <AuthProvider>
        <CurrencyProvider>
          <CurrencyToggle />
          <Routes>
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
          </Routes>
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Pins "now" (only Date is faked; timers stay real for userEvent). */
function pinNow(iso) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(iso));
}

const monthSection = () => screen.getByRole("region", { name: /^Cost of ownership/ });

beforeEach(() => {
  vi.clearAllMocks();
  pinNow("2026-10-20T09:00:00Z"); // 20 Oct 2026, noon in Beirut
  supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ExpensesPage — empty states", () => {
  it("asks for a car first when the user has none", async () => {
    mockDatabase({ cars: [] });
    renderPage();

    expect(await screen.findByRole("link", { name: "Add Your Car" })).toHaveAttribute("href", "/cars/new");
  });

  it("with neither expenses nor fill-ups: a sentence for the month and the history, never a $0.00 or NaN", async () => {
    mockDatabase();
    renderPage();

    expect(await screen.findByText(/Nothing logged for October 2026 yet/)).toBeInTheDocument();
    expect(screen.getByText("No expenses logged yet")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00|NaN/)).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Monthly costs chart" })).not.toBeInTheDocument();
  });

  it("with fill-ups but no expenses: fuel counts toward the month, other costs say none", async () => {
    mockDatabase({ fuelByCar: { "car-1": [fill("f1", "2026-10-03", 30)] } });
    renderPage();

    await screen.findByText("Total this month");
    expect(within(monthSection()).getByText(priceText("$30.00 (2,691,000 LBP)"), { selector: ".costs-summary__value *" })).toBeInTheDocument();
    expect(within(monthSection()).getByText("No other costs this month")).toBeInTheDocument();
    expect(screen.getByText("No expenses logged yet")).toBeInTheDocument();
  });

  it("with expenses but no fill-ups: says no fill-ups were logged, without a fake fuel zero", async () => {
    mockDatabase({ expensesByCar: { "car-1": [expense("e1", "2026-10-05", "parking", 5)] } });
    renderPage();

    await screen.findByText("Total this month");
    expect(within(monthSection()).getByText("No fill-ups logged this month")).toBeInTheDocument();
  });

  it("shows a plain message, never the database's wording, if expenses can't be loaded", async () => {
    mockDatabase({ expensesError: { code: "XX000", message: 'relation "public.car_expenses" does not exist' } });
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load your expenses. Please try again.");
    expect(alert).not.toHaveTextContent(/relation|public\./);
  });
});

describe("ExpensesPage — adding an expense", () => {
  it("offers the fixed categories, including Fines and Other", async () => {
    mockDatabase();
    renderPage();

    const select = await screen.findByLabelText("Category *");
    expect(within(select).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Choose a category", "Repair", "Maintenance", "Insurance", "Registration / Mécanique", "Parking", "Car wash", "Tolls", "Fines", "Other",
    ]);
  });

  it("saves one row with the caller's ids, the category KEY, the amount as typed and its currency", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({
      expensesByCar: { "car-1": (queryNumber) => (queryNumber === 1 ? [] : [expense("new", "2026-10-20", "fines", 50, "USD", "Speeding")]) },
    });
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Category *"), "fines");
    await user.type(screen.getByLabelText("Amount *"), "50");
    await user.type(screen.getByLabelText("Note"), "Speeding");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toEqual({
      user_id: "user-123", car_id: "car-1", spent_on: "2026-10-20", category: "fines", amount: 50, currency: "USD", note: "Speeding",
    });
    // The message appears once the history already shows the new expense.
    expect(await screen.findByRole("status")).toHaveTextContent("Fines expense added.");
    expect(within(screen.getByRole("table")).getByText("Fines")).toBeInTheDocument();
  });

  it("records the currency chosen in the form (LBP), not a converted amount", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Category *"), "parking");
    await user.type(screen.getByLabelText("Amount *"), "150000");
    await user.selectOptions(screen.getByLabelText("Currency of the amount"), "LBP");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ amount: 150000, currency: "LBP", note: null });
  });

  it.each([
    ["a date in the future (tomorrow in Beirut)", { date: "2026-10-21", category: "parking", amount: "5" }, "The date can't be in the future."],
    ["no category", { date: "2026-10-20", category: "", amount: "5" }, "Choose a category."],
    ["amount 0", { date: "2026-10-20", category: "parking", amount: "0" }, "Amount must be a number greater than 0."],
    ["no amount", { date: "2026-10-20", category: "parking", amount: "" }, "Amount is required."],
  ])("refuses %s, without saving", async (_label, values, message) => {
    const user = userEvent.setup();
    const calls = mockDatabase();
    renderPage();

    await screen.findByLabelText("Category *");
    fireEvent.change(screen.getByLabelText("Date *"), { target: { value: values.date } });
    if (values.category) await user.selectOptions(screen.getByLabelText("Category *"), values.category);
    if (values.amount) await user.type(screen.getByLabelText("Amount *"), values.amount);
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(calls.inserts).toEqual([]);
  });

  it("describes a failed save in plain words", async () => {
    const user = userEvent.setup();
    mockDatabase({ writeError: { code: "23514", message: 'violates check constraint "car_expenses_category_check"' } });
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Category *"), "parking");
    await user.type(screen.getByLabelText("Amount *"), "5");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent(/check constraint|car_expenses/);
  });
});

describe("ExpensesPage — this month's total, mixed currencies and the USD | LBP switch", () => {
  const MIXED = {
    // October: fuel $30 + 2,691,000 LBP ($30); other $5 + 448,500 LBP ($5) => $70.00 = 6,279,000 LBP.
    fuelByCar: { "car-1": [fill("f1", "2026-10-01", 30), fill("f2", "2026-10-15", 2_691_000, "LBP"), fill("f-sep", "2026-09-30", 99)] },
    expensesByCar: {
      "car-1": [
        expense("e1", "2026-10-05", "parking", 5),
        expense("e2", "2026-10-12", "insurance", 448_500, "LBP"),
        expense("e-nov", "2026-11-01", "repair", 777), // not this month (and not possible before Nov in real life)
      ],
    },
  };

  it("adds every amount converted from its own currency, and flips with the header switch", async () => {
    const user = userEvent.setup();
    mockDatabase(MIXED);
    renderPage();

    await screen.findByText("Total this month");
    const total = () => monthSection().querySelector(".costs-summary__value").textContent;
    expect(total()).toBe("$70.00 (6,279,000 LBP)");

    await user.click(screen.getByRole("button", { name: "LBP" }));
    expect(total()).toBe("6,279,000 LBP ($70.00)");

    await user.click(screen.getByRole("button", { name: "USD" }));
    expect(total()).toBe("$70.00 (6,279,000 LBP)");
  });

  it("splits fuel and other costs, and breaks other costs down by category", async () => {
    mockDatabase(MIXED);
    renderPage();

    await screen.findByText("Total this month");
    const split = monthSection().querySelector(".costs-summary__split").textContent;
    expect(split).toContain("Fuel$60.00 (5,382,000 LBP)");
    expect(split).toContain("Other costs$10.00 (897,000 LBP)");
    const breakdown = within(screen.getByRole("list", { name: "Other costs by category" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(breakdown).toEqual(["Insurance$5.00 (448,500 LBP)", "Parking$5.00 (448,500 LBP)"]);
  });

  it("never draws an amount outside <Price> (so the switch changes them all)", async () => {
    mockDatabase(MIXED);
    renderPage();

    await screen.findByText("Total this month");
    expect(unconvertedMoney(document.body)).toEqual([]);
  });
});

describe("ExpensesPage — month boundaries (Beirut calendar month)", () => {
  const EDGE = {
    expensesByCar: { "car-1": [expense("oct31", "2026-10-31", "tolls", 3), expense("nov1", "2026-11-01", "tolls", 4)] },
  };

  // Beirut is UTC+2 on 31 Oct 2026: its clocks went back on Sunday 25 Oct.
  it("at 23:30 on 31 Oct in Beirut (21:30 UTC), the 31 Oct expense is this month's and 1 Nov isn't", async () => {
    pinNow("2026-10-31T21:30:00Z");
    mockDatabase(EDGE);
    renderPage();

    await screen.findByText("Total this month");
    expect(screen.getByRole("heading", { name: /^October 2026/ })).toBeInTheDocument();
    expect(monthSection().querySelector(".costs-summary__value").textContent).toBe("$3.00 (269,100 LBP)");
  });

  it("at 00:30 on 1 Nov in Beirut (still 31 Oct, 22:30 in UTC), it is already November", async () => {
    pinNow("2026-10-31T22:30:00Z");
    mockDatabase(EDGE);
    renderPage();

    await screen.findByText("Total this month");
    expect(screen.getByRole("heading", { name: /^November 2026/ })).toBeInTheDocument();
    expect(monthSection().querySelector(".costs-summary__value").textContent).toBe("$4.00 (358,800 LBP)");
  });
});

describe("ExpensesPage — delete", () => {
  it("only deletes after the confirmation; 'Keep it' does nothing", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ expensesByCar: { "car-1": [expense("e1", "2026-10-05", "parking", 5)] } });
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Delete the Parking expense of 5 Oct 2026" }));
    expect(calls.deletes).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(calls.deletes).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Delete the Parking expense of 5 Oct 2026" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.deletes).toEqual([["id", "e1"]]));
    expect(await screen.findByRole("status")).toHaveTextContent("Parking expense of 5 Oct 2026 deleted.");
  });
});

describe("ExpensesPage — several cars", () => {
  it("never mixes cars: each car's totals, history and queries are its own", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({
      cars: [CAR_1, CAR_2],
      expensesByCar: { "car-1": [expense("e1", "2026-10-05", "parking", 5)], "car-2": [expense("e2", "2026-10-06", "repair", 200)] },
      fuelByCar: { "car-1": [fill("f1", "2026-10-02", 40)], "car-2": [] },
    });
    renderPage();

    await screen.findByText("Total this month");
    expect(monthSection().querySelector(".costs-summary__value").textContent).toBe("$45.00 (4,036,500 LBP)");

    await user.selectOptions(screen.getByLabelText("Car"), "car-2");
    await waitFor(() => expect(monthSection().querySelector(".costs-summary__value")?.textContent).toBe("$200.00 (17,940,000 LBP)"));
    expect(within(monthSection()).getByText("No fill-ups logged this month")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("Parking")).not.toBeInTheDocument();
    expect(calls.expenseQueries).toEqual([["car_id", "car-1"], ["car_id", "car-2"]]);
    expect(calls.fuelQueries).toEqual([["car_id", "car-1"], ["car_id", "car-2"]]);
  });

  it("adds an expense to the SELECTED car", async () => {
    const user = userEvent.setup();
    const calls = mockDatabase({ cars: [CAR_1, CAR_2] });
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Car"), "car-2");
    await user.selectOptions(screen.getByLabelText("Category *"), "tolls");
    await user.type(screen.getByLabelText("Amount *"), "2");
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    await waitFor(() => expect(calls.inserts).toHaveLength(1));
    expect(calls.inserts[0]).toMatchObject({ car_id: "car-2", user_id: "user-123" });
  });
});
