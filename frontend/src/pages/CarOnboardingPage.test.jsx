// Tests for the Add Your Car screen: required-field validation (normal
// case + missing-field and invalid-year edge cases), a successful submit
// writing the logged-in user's id onto the new row, the insert-error
// case, and the CAR-34 background spec-autofill lookup (fills empty
// fields on success, leaves the form usable on failure). The Supabase
// client and the backend apiFetch call are both mocked so no real
// network calls happen.

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CarOnboardingPage from "./CarOnboardingPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { supabase } from "../lib/supabaseClient.js";
import { readFileSync } from "node:fs";

vi.mock("../lib/apiClient.js", () => ({
  apiFetch: vi.fn(),
}));

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };

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

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/cars/new"]}>
      <AuthProvider>
        <Routes>
          <Route path="/cars/new" element={<CarOnboardingPage />} />
          <Route path="/cars/:carId" element={<p>Car profile placeholder</p>} />
          <Route path="/dashboard" element={<p>Dashboard placeholder</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Fills the required fields with valid values (Make, Model, Year, Fuel Type). */
async function fillRequiredFields(user, { year = "2020" } = {}) {
  await user.type(screen.getByLabelText("Make *"), "Toyota");
  await user.type(screen.getByLabelText("Model *"), "Corolla");
  await user.type(screen.getByLabelText("Year *"), year);
  await user.selectOptions(screen.getByLabelText("Fuel Type *"), "Gasoline");
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: LOGGED_IN_USER, access_token: "test-access-token" } },
  });
  // Default: no autofill data, so tests that don't care about CAR-34's
  // lookup aren't affected by it running in the background.
  apiFetch.mockResolvedValue({});
});

describe("CarOnboardingPage", () => {
  it("inserts a new car with the logged-in user's id and navigates to its profile (normal case)", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({
      data: { id: "car-456" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(supabase.from).toHaveBeenCalledWith("cars");
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        make: "Toyota",
        model: "Corolla",
        year: 2020,
        fuel_type: "Gasoline",
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Car profile placeholder")).toBeInTheDocument(),
    );
  });

  it("shows validation errors and does not call Supabase when required fields are empty (edge case)", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(await screen.findByText("Make is required.")).toBeInTheDocument();
    expect(screen.getByText("Model is required.")).toBeInTheDocument();
    expect(screen.getByText("Year is required.")).toBeInTheDocument();
    expect(screen.getByText("Fuel type is required.")).toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("shows a validation error and does not submit for a too-old year (edge case)", async () => {
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user, { year: "1899" });
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(
      await screen.findByText(/Enter a valid year between/),
    ).toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("shows a validation error and does not submit for a future year beyond next year (edge case)", async () => {
    const user = userEvent.setup();
    renderPage();

    const farFutureYear = String(new Date().getFullYear() + 10);
    await fillRequiredFields(user, { year: farFutureYear });
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(
      await screen.findByText(/Enter a valid year between/),
    ).toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("does not accept non-numeric characters in the Year field (invalid input case)", async () => {
    const user = userEvent.setup();
    renderPage();

    const yearInput = screen.getByLabelText("Year *");
    await user.type(yearInput, "abcd");

    // The browser's number input itself rejects non-numeric keystrokes,
    // so the field stays empty rather than accepting "abcd".
    expect(yearInput).toHaveValue(null);
  });

  it("cannot type more than 60 characters into Make/Model, so oversized text is never submitted (edge case)", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    renderPage();
    await user.type(screen.getByLabelText("Make *"), "A".repeat(300));
    await user.type(screen.getByLabelText("Model *"), "B".repeat(300));
    await user.type(screen.getByLabelText("Year *"), "2020");
    await user.selectOptions(screen.getByLabelText("Fuel Type *"), "Gasoline");
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    // CAR-23: capped at the server/database limit instead of "unchanged".
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ make: "A".repeat(60), model: "B".repeat(60) }),
    );
  });

  it("submits special characters in VIN unchanged, as data and not code (edge case)", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    // Kept within the 32-character VIN limit.
    const trickyVin = "';DROP TABLE cars;--<b>x</b>";

    renderPage();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("VIN"), trickyVin);
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ vin: trickyVin }),
    );
  });

  // CAR-25: the database's own wording (table names, "row-level security policy",
  // driver errors) is never shown — only a plain-language sentence.
  it.each([
    [
      "a row-level security rejection",
      { code: "42501", message: 'new row violates row-level security policy for table "cars"' },
      "You don't have permission to do that.",
    ],
    [
      "an unclassified database error",
      { code: "XX000", message: 'relation "public.cars" does not exist at /var/lib/postgresql/x.c:88' },
      "Could not save. Please try again.",
    ],
  ])("shows a clear plain-language error, never the database text, and does not navigate when the insert fails: %s", async (_label, dbError, expected) => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({ data: null, error: dbError });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expected);
    expect(alert).not.toHaveTextContent(/row-level|relation|public\.|postgresql|violates/i);
    expect(
      screen.queryByText("Car profile placeholder"),
    ).not.toBeInTheDocument();
  });

  it(
    "auto-fills empty spec fields from the backend lookup and includes them in the insert (normal case)",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        vehicle_confirmed: true,
        engine_type: "Passenger Car",
        fuel_efficiency: 14.5,
        cylinders: 4,
        drivetrain: "fwd",
        transmission: "a",
      });
      const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      supabase.from.mockReturnValue({ insert });

      renderPage();
      await fillRequiredFields(user);

      await waitFor(
        () =>
          expect(screen.getByLabelText("Fuel Efficiency (km/L)")).toHaveValue(14.5),
        { timeout: 3000 },
      );
      // CAR-24: the endpoint requires a logged-in caller, so the session token is sent.
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cars/spec-suggestions?make=Toyota&model=Corolla&year=2020"),
        { accessToken: "test-access-token" },
      );

      await user.click(screen.getByRole("button", { name: "Add Car" }));

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          engine_type: "Passenger Car",
          fuel_efficiency: 14.5,
          cylinders: 4,
          drivetrain: "fwd",
          transmission: "a",
        }),
      );
    },
    10000,
  );

  it(
    "leaves spec fields blank and still submits normally when the lookup fails (edge case)",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockRejectedValue(new Error("Could not reach the server."));
      const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      supabase.from.mockReturnValue({ insert });

      renderPage();
      await fillRequiredFields(user);

      await waitFor(() => expect(apiFetch).toHaveBeenCalled(), { timeout: 3000 });

      await user.click(screen.getByRole("button", { name: "Add Car" }));

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          engine_type: null,
          fuel_efficiency: null,
          cylinders: null,
          drivetrain: null,
          transmission: null,
        }),
      );
    },
    10000,
  );
});

describe("CarOnboardingPage — fuel tank capacity (CAR-44)", () => {
  it(
    "auto-fills the tank capacity when the lookup provides one, and saves it",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({ fuel_tank_capacity_liters: 50 });
      const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      supabase.from.mockReturnValue({ insert });

      renderPage();
      await fillRequiredFields(user);

      await waitFor(
        () => expect(screen.getByLabelText("Fuel Tank Capacity (L)")).toHaveValue(50),
        { timeout: 3000 },
      );
      await user.click(screen.getByRole("button", { name: "Add Car" }));

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ fuel_tank_capacity_liters: 50 }),
      );
    },
    10000,
  );

  it("accepts a manually entered tank capacity when the lookup has none", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ fuel_tank_capacity_liters: null });
    const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    renderPage();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("Fuel Tank Capacity (L)"), "45.5");
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ fuel_tank_capacity_liters: 45.5 }),
    );
  });

  it("saves null (and never blocks) when tank capacity is left blank", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ fuel_tank_capacity_liters: null }),
    );
  });

  it.each([["0"], ["-5"], ["430"], ["4"]])(
    "rejects a tank capacity of %s (outside 5-200 L) without saving (invalid input)",
    async (typed) => {
      const user = userEvent.setup();
      renderPage();
      await fillRequiredFields(user);
      await user.type(screen.getByLabelText("Fuel Tank Capacity (L)"), typed);
      await user.click(screen.getByRole("button", { name: "Add Car" }));

      expect(
        await screen.findByText("Tank capacity must be between 5 and 200 liters."),
      ).toBeInTheDocument();
      expect(supabase.from).not.toHaveBeenCalled();
    },
  );
});


describe("CarOnboardingPage — tank capacity source note (CAR-44)", () => {
  const AI_NOTE = /Estimated by AI for this model/;
  const LOOKUP_NOTE = /Looked up on auto-data\.net/;
  const waitForTank = (value) =>
    waitFor(() => expect(screen.getByLabelText("Fuel Tank Capacity (L)")).toHaveValue(value), {
      timeout: 3000,
    });

  it(
    "fills a looked-up tank capacity, says it came from auto-data.net, and saves it",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        fuel_tank_capacity_liters: 64,
        fuel_tank_capacity_source: "auto_data",
      });
      const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      supabase.from.mockReturnValue({ insert });

      renderPage();
      await fillRequiredFields(user);
      await waitForTank(64);

      expect(screen.getByText(LOOKUP_NOTE)).toBeInTheDocument();
      expect(screen.queryByText(AI_NOTE)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Add Car" }));
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ fuel_tank_capacity_liters: 64 }),
      );
    },
    10000,
  );

  it(
    "flags an AI-estimated tank capacity as an estimate and saves it",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        fuel_tank_capacity_liters: 62.1,
        fuel_tank_capacity_source: "ai_estimate",
      });
      const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      supabase.from.mockReturnValue({ insert });

      renderPage();
      await fillRequiredFields(user);
      await waitForTank(62.1);

      expect(screen.getByText(AI_NOTE)).toBeInTheDocument();
      expect(screen.queryByText(LOOKUP_NOTE)).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Add Car" }));
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ fuel_tank_capacity_liters: 62.1 }),
      );
    },
    10000,
  );

  it(
    "drops the note as soon as the user edits the value",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        fuel_tank_capacity_liters: 64,
        fuel_tank_capacity_source: "auto_data",
      });

      renderPage();
      await fillRequiredFields(user);
      await waitFor(() => expect(screen.getByText(LOOKUP_NOTE)).toBeInTheDocument(), {
        timeout: 3000,
      });

      await user.type(screen.getByLabelText("Fuel Tank Capacity (L)"), "1");

      expect(screen.queryByText(LOOKUP_NOTE)).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    "shows no note for a value from API Ninjas or when there is no source",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        fuel_tank_capacity_liters: 50,
        fuel_tank_capacity_source: "api_ninjas",
      });

      renderPage();
      await fillRequiredFields(user);
      await waitForTank(50);

      expect(screen.queryByText(LOOKUP_NOTE)).not.toBeInTheDocument();
      expect(screen.queryByText(AI_NOTE)).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    "does not overwrite a tank capacity the user already typed, or label it",
    async () => {
      const user = userEvent.setup();
      let resolveLookup;
      apiFetch.mockReturnValue(new Promise((resolve) => (resolveLookup = resolve)));

      renderPage();
      await fillRequiredFields(user);
      await user.type(screen.getByLabelText("Fuel Tank Capacity (L)"), "55");
      await waitFor(() => expect(apiFetch).toHaveBeenCalled(), { timeout: 3000 });
      resolveLookup({ fuel_tank_capacity_liters: 64, fuel_tank_capacity_source: "auto_data" });

      await waitForTank(55);
      expect(screen.queryByText(LOOKUP_NOTE)).not.toBeInTheDocument();
    },
    10000,
  );
});

describe("CarOnboardingPage — input limits (CAR-23)", () => {
  const TEXT_LIMITS = [
    ["Make *", 60],
    ["Model *", 60],
    ["Engine Type", 60],
    ["License Plate", 20],
    ["Drivetrain", 60],
    ["Transmission", 60],
    ["VIN", 32],
  ];

  it.each(TEXT_LIMITS)("caps the %s field at %i characters", (label, max) => {
    renderPage();

    expect(screen.getByLabelText(label)).toHaveAttribute("maxlength", String(max));
  });

  it.each([
    ["Make *", 61, "Make must be 60 characters or fewer."],
    ["Model *", 61, "Model must be 60 characters or fewer."],
    ["VIN", 33, "VIN must be 32 characters or fewer."],
    ["License Plate", 21, "License plate must be 20 characters or fewer."],
  ])(
    "still refuses an oversized %s if the input cap is bypassed, without saving",
    async (label, length, message) => {
      const user = userEvent.setup();
      const insert = vi.fn();
      supabase.from.mockReturnValue({ insert });
      renderPage();
      await fillRequiredFields(user);

      // fireEvent.change ignores maxLength, like a script or pasted-in devtools value would.
      fireEvent.change(screen.getByLabelText(label), { target: { value: "x".repeat(length) } });
      await user.click(screen.getByRole("button", { name: "Add Car" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["Fuel Efficiency (km/L)", "500", "Fuel efficiency must be between 0 and 100 km/L."],
    ["Fuel Efficiency (km/L)", "-5", "Fuel efficiency must be between 0 and 100 km/L."],
    ["Cylinders", "99", "Cylinders must be a whole number between 1 and 16."],
    ["Cylinders", "-3", "Cylinders must be a whole number between 1 and 16."],
    ["Cylinders", "4.5", "Cylinders must be a whole number between 1 and 16."],
  ])("rejects %s = %s with a visible message and does not save", async (label, value, message) => {
    const user = userEvent.setup();
    const insert = vi.fn();
    supabase.from.mockReturnValue({ insert });
    renderPage();
    await fillRequiredFields(user);

    await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts the boundary values (efficiency 100, cylinders 16, 60-char make)", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
    const insert = vi.fn(() => ({ select: vi.fn(() => ({ single })) }));
    supabase.from.mockReturnValue({ insert });
    renderPage();
    await fillRequiredFields(user);

    await user.clear(screen.getByLabelText("Make *"));
    await user.type(screen.getByLabelText("Make *"), "M".repeat(60));
    await user.type(screen.getByLabelText("Fuel Efficiency (km/L)"), "100");
    await user.type(screen.getByLabelText("Cylinders"), "16");
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ make: "M".repeat(60), fuel_efficiency: 100, cylinders: 16 }),
    );
  });

  it("describes a database rule violation in plain words, never the constraint name", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: 'new row for relation "cars" violates check constraint "cars_year_range_check"',
      },
    });
    supabase.from.mockReturnValue({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) });
    renderPage();
    await fillRequiredFields(user);

    await user.click(screen.getByRole("button", { name: "Add Car" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("outside the allowed range or length");
    expect(alert).not.toHaveTextContent(/cars_year_range_check|relation/);
  });
});

// --- Add Your Car polish pass -------------------------------------------------------------

// The real stylesheet, read from disk: jsdom does not apply it, and Vitest turns an imported .css
// into an empty string, so this is how the tests can check that a "looks disabled" / "looks invalid"
// rule actually exists.
const stylesheet = readFileSync("src/index.css", "utf-8").split("\r\n").join("\n");

/** The CSS rule block for a selector, from the real stylesheet. */
function cssRule(selector) {
  const start = stylesheet.indexOf(`${selector} {`);
  if (start === -1) return "";
  return stylesheet.slice(start, stylesheet.indexOf("}", start));
}

/** A promise whose resolve() we hold, to keep the spec lookup "in flight" for a moment. */
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}

const FULL_SPECS = {
  engine_type: "1.8L Inline-4",
  fuel_efficiency: 9.5,
  cylinders: 4,
  drivetrain: "rwd",
  transmission: "Automatic",
  fuel_tank_capacity_liters: 62,
  fuel_tank_capacity_source: "api_ninjas",
};

/** Types Make/Model/Year (enough to trigger the lookup) without choosing a fuel type. */
async function typeCar(user) {
  await user.type(screen.getByLabelText("Make *"), "Mercedes-Benz");
  await user.type(screen.getByLabelText("Model *"), "C230");
  await user.type(screen.getByLabelText("Year *"), "2005");
}

describe("CarOnboardingPage polish — Scan Document looks disabled", () => {
  it("is a disabled button, and a disabled accent button is styled greyed-out with a not-allowed cursor", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "Scan Document" })).toBeDisabled();
    const rule = cssRule(".btn-accent:disabled");
    expect(rule).toContain("cursor: not-allowed");
    expect(rule).toMatch(/background-color: var\(--color-border\)/); // not the active gold
    expect(rule).toMatch(/opacity: 0\.\d/);
  });
});

describe("CarOnboardingPage polish — auto-fill cue", () => {
  it("shows a 'Looking up specs' status while the lookup runs, then removes it", async () => {
    const user = userEvent.setup();
    const lookup = deferred();
    apiFetch.mockReturnValue(lookup.promise);
    renderPage();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await typeCar(user);

    expect(await screen.findByRole("status")).toHaveTextContent("Looking up specs for your car");
    lookup.resolve(FULL_SPECS);
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("tags every field the lookup filled with 'Auto-filled', beside its label", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(FULL_SPECS);
    renderPage();

    await typeCar(user);

    await waitFor(() => expect(screen.getByLabelText("Cylinders")).toHaveValue(4));
    for (const label of ["Engine Type", "Fuel Efficiency (km/L)", "Cylinders", "Drivetrain", "Transmission", "Fuel Tank Capacity (L)"]) {
      const row = screen.getByText(label, { selector: "label" }).closest(".form-field__label-row");
      expect(within(row).getByText(/Auto-filled/), label).toBeInTheDocument();
    }
    expect(screen.getAllByText(/Auto-filled/)).toHaveLength(6);
  });

  it("keeps each field's accessible name unchanged (the tag is beside the label, not inside it)", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(FULL_SPECS);
    renderPage();
    await typeCar(user);
    await waitFor(() => expect(screen.getByLabelText("Cylinders")).toHaveValue(4));

    expect(screen.getByLabelText("Fuel Efficiency (km/L)")).toHaveValue(9.5);
    expect(screen.getByLabelText("Drivetrain")).toHaveValue("rwd");
  });

  it("removes a field's tag the moment the user edits it, and leaves the others", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(FULL_SPECS);
    renderPage();
    await typeCar(user);
    await waitFor(() => expect(screen.getAllByText(/Auto-filled/)).toHaveLength(6));

    await user.type(screen.getByLabelText("Drivetrain"), "x");

    expect(screen.getAllByText(/Auto-filled/)).toHaveLength(5);
    const row = screen.getByText("Drivetrain", { selector: "label" }).closest(".form-field__label-row");
    expect(within(row).queryByText(/Auto-filled/)).not.toBeInTheDocument();
  });

  it("does not tag a field the user had already filled in themselves", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(FULL_SPECS);
    renderPage();
    await user.type(screen.getByLabelText("Cylinders"), "6"); // typed BEFORE the lookup
    await typeCar(user);

    await waitFor(() => expect(screen.getByLabelText("Drivetrain")).toHaveValue("rwd"));
    expect(screen.getByLabelText("Cylinders")).toHaveValue(6); // never overwritten
    const row = screen.getByText("Cylinders", { selector: "label" }).closest(".form-field__label-row");
    expect(within(row).queryByText(/Auto-filled/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Auto-filled/)).toHaveLength(5);
  });

  it("only tags the fields the lookup actually had a value for", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ cylinders: 4, fuel_efficiency: null, drivetrain: null });
    renderPage();
    await typeCar(user);

    await waitFor(() => expect(screen.getByLabelText("Cylinders")).toHaveValue(4));
    expect(screen.getAllByText(/Auto-filled/)).toHaveLength(1);
  });

  it("shows no tag, and no lingering status, when the lookup finds nothing", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({});
    renderPage();
    await typeCar(user);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByText(/Auto-filled/)).not.toBeInTheDocument();
  });

  it("ends the loading status quietly when the lookup fails", async () => {
    const user = userEvent.setup();
    apiFetch.mockRejectedValue(new Error("offline"));
    renderPage();
    await typeCar(user);

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByText(/Auto-filled/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Make *")).toBeEnabled(); // the form is still usable
  });
});

describe("CarOnboardingPage polish — '* Required' legend and sub-sections", () => {
  it("shows a '* Required' legend above 'Core Specifications'", () => {
    renderPage();

    const legend = screen.getByText("* Required");
    const heading = screen.getByText("Core Specifications");
    expect(legend.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("splits the fields into Basic Info, Performance and Identification, in that order", () => {
    renderPage();

    const titles = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual(["Basic Info", "Performance", "Identification"]);
  });

  it.each([
    ["Basic Info", ["Make *", "Model *", "Year *", "Fuel Type *"]],
    ["Performance", ["Engine Type", "Fuel Efficiency (km/L)", "Cylinders", "Drivetrain", "Transmission", "Fuel Tank Capacity (L)"]],
    ["Identification", ["License Plate", "VIN"]],
  ])("puts the right fields under %s", (title, labels) => {
    renderPage();

    const section = screen.getByRole("region", { name: title });
    for (const label of labels) {
      expect(within(section).getByLabelText(label), label).toBeInTheDocument();
    }
    expect(within(section).getAllByRole("textbox").length + within(section).queryAllByRole("combobox").length + within(section).queryAllByRole("spinbutton").length).toBe(labels.length);
  });

  it("still shows every one of the twelve fields exactly once", () => {
    renderPage();

    expect(screen.getAllByRole("textbox").length + screen.getAllByRole("spinbutton").length + screen.getAllByRole("combobox").length).toBe(12);
  });
});

describe("CarOnboardingPage polish — red styling on invalid fields", () => {
  it("outlines every required field left empty when Add Car is submitted — Fuel Type included", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Add Car" }));

    for (const label of ["Make *", "Model *", "Year *", "Fuel Type *"]) {
      expect(screen.getByLabelText(label), label).toHaveAttribute("aria-invalid", "true");
    }
    expect(screen.getByLabelText("Fuel Type *").tagName).toBe("SELECT");
    // a field that was fine is not flagged
    expect(screen.getByLabelText("VIN")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Cylinders")).not.toHaveAttribute("aria-invalid");
  });

  it("has a real red style for the invalid state, on inputs and on the dropdown", () => {
    const rule = cssRule('input[aria-invalid="true"],\nselect[aria-invalid="true"]');
    expect(rule).toContain("var(--color-danger)");
    expect(rule).toContain("outline");
  });

  it("flags only the field that is actually missing", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText("Make *"), "Toyota");
    await user.type(screen.getByLabelText("Model *"), "Corolla");
    await user.type(screen.getByLabelText("Year *"), "2020");

    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(screen.getByLabelText("Fuel Type *")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Make *")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Model *")).not.toHaveAttribute("aria-invalid");
    expect(screen.getByLabelText("Year *")).not.toHaveAttribute("aria-invalid");
  });

  it("clears a field's red outline (and its message) as soon as the user fixes it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Add Car" }));
    expect(screen.getByLabelText("Fuel Type *")).toHaveAttribute("aria-invalid", "true");

    await user.selectOptions(screen.getByLabelText("Fuel Type *"), "Diesel");

    expect(screen.getByLabelText("Fuel Type *")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Fuel type is required.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Make *")).toHaveAttribute("aria-invalid", "true"); // the others stay flagged
  });

  it("outlines an invalid value too, not only an empty required field", async () => {
    const user = userEvent.setup();
    renderPage();
    await fillRequiredFields(user);
    fireEvent.change(screen.getByLabelText("Cylinders"), { target: { value: "99" } });

    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(screen.getByLabelText("Cylinders")).toHaveAttribute("aria-invalid", "true");
  });

  it("nothing is flagged before the first submit", () => {
    renderPage();

    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0);
  });
});

describe("CarOnboardingPage polish — helper captions", () => {
  it("explains what Fuel Tank Capacity is used for", () => {
    renderPage();

    expect(screen.getByText("Used to estimate Full Tank Cost in Trip Planner")).toBeInTheDocument();
    expect(screen.getByLabelText("Fuel Tank Capacity (L)")).toHaveAccessibleDescription(
      "Used to estimate Full Tank Cost in Trip Planner",
    );
  });

  it("gives VIN a short caption that is true (the lookup does not use the VIN, so it makes no auto-fill claim)", () => {
    renderPage();

    const caption = screen.getByText(/identification number on your registration card/);
    expect(screen.getByLabelText("VIN")).toHaveAccessibleDescription(caption.textContent);
    expect(caption).not.toHaveTextContent(/accuracy|auto-fill/i);
  });

  it("keeps the tank capacity source note as well as the caption when the lookup fills it in", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ fuel_tank_capacity_liters: 62, fuel_tank_capacity_source: "auto_data" });
    renderPage();
    await typeCar(user);

    expect(await screen.findByText(/Looked up on auto-data.net/)).toBeInTheDocument();
    expect(screen.getByText("Used to estimate Full Tank Cost in Trip Planner")).toBeInTheDocument();
  });
});

describe("CarOnboardingPage polish — Cancel", () => {
  it("has a Cancel link next to Add Car that goes back to the Dashboard", async () => {
    const user = userEvent.setup();
    renderPage();

    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/dashboard");
    expect(cancel.closest(".form-actions")).toContainElement(screen.getByRole("button", { name: "Add Car" }));

    await user.click(cancel);
    expect(await screen.findByText("Dashboard placeholder")).toBeInTheDocument();
  });

  it("saves nothing when the user cancels", async () => {
    const user = userEvent.setup();
    renderPage();
    await fillRequiredFields(user);

    await user.click(screen.getByRole("link", { name: "Cancel" }));

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
