// Tests for the Add Your Car screen: required-field validation (normal
// case + missing-field and invalid-year edge cases), a successful submit
// writing the logged-in user's id onto the new row, the insert-error
// case, and the CAR-34 background spec-autofill lookup (fills empty
// fields on success, leaves the form usable on failure). The Supabase
// client and the backend apiFetch call are both mocked so no real
// network calls happen.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CarOnboardingPage from "./CarOnboardingPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { supabase } from "../lib/supabaseClient.js";

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
    data: { session: { user: LOGGED_IN_USER } },
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

  it("accepts and submits very long text in Make/Model unchanged (edge case)", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    const longMake = "A".repeat(300);
    const longModel = "B".repeat(300);

    renderPage();
    await user.type(screen.getByLabelText("Make *"), longMake);
    await user.type(screen.getByLabelText("Model *"), longModel);
    await user.type(screen.getByLabelText("Year *"), "2020");
    await user.selectOptions(screen.getByLabelText("Fuel Type *"), "Gasoline");
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ make: longMake, model: longModel }),
    );
  });

  it("accepts and submits special characters in VIN unchanged (edge case)", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    const trickyVin = "<script>alert(1)</script>O'Brien\"; DROP TABLE cars;--";

    renderPage();
    await fillRequiredFields(user);
    await user.type(screen.getByLabelText("VIN"), trickyVin);
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ vin: trickyVin }),
    );
  });

  it("shows a clear error and does not navigate when the insert fails", async () => {
    const user = userEvent.setup();
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "new row violates row-level security policy" },
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    supabase.from.mockReturnValue({ insert });

    renderPage();
    await fillRequiredFields(user);
    await user.click(screen.getByRole("button", { name: "Add Car" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "new row violates row-level security policy",
    );
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
      expect(apiFetch).toHaveBeenCalledWith(
        expect.stringContaining("/cars/spec-suggestions?make=Toyota&model=Corolla&year=2020"),
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


describe("CarOnboardingPage — AI-estimated tank capacity (CAR-44)", () => {
  const NOTE = /Estimated by AI for this model/;

  it(
    "fills an estimated tank capacity, flags it as an estimate, and saves it",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        fuel_tank_capacity_liters: 64.3,
        fuel_tank_capacity_estimated: true,
      });
      const single = vi.fn().mockResolvedValue({ data: { id: "car-456" }, error: null });
      const select = vi.fn(() => ({ single }));
      const insert = vi.fn(() => ({ select }));
      supabase.from.mockReturnValue({ insert });

      renderPage();
      await fillRequiredFields(user);

      await waitFor(
        () => expect(screen.getByLabelText("Fuel Tank Capacity (L)")).toHaveValue(64.3),
        { timeout: 3000 },
      );
      expect(screen.getByText(NOTE)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Add Car" }));
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ fuel_tank_capacity_liters: 64.3 }),
      );
    },
    10000,
  );

  it(
    "drops the estimate note as soon as the user edits the value",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        fuel_tank_capacity_liters: 64.3,
        fuel_tank_capacity_estimated: true,
      });

      renderPage();
      await fillRequiredFields(user);
      await waitFor(() => expect(screen.getByText(NOTE)).toBeInTheDocument(), {
        timeout: 3000,
      });

      await user.type(screen.getByLabelText("Fuel Tank Capacity (L)"), "1");

      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    "shows no estimate note for a value that came from a real data source",
    async () => {
      const user = userEvent.setup();
      apiFetch.mockResolvedValue({
        fuel_tank_capacity_liters: 50,
        fuel_tank_capacity_estimated: false,
      });

      renderPage();
      await fillRequiredFields(user);
      await waitFor(
        () => expect(screen.getByLabelText("Fuel Tank Capacity (L)")).toHaveValue(50),
        { timeout: 3000 },
      );

      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    },
    10000,
  );

  it(
    "does not overwrite a tank capacity the user already typed, or flag it",
    async () => {
      const user = userEvent.setup();
      let resolveLookup;
      apiFetch.mockReturnValue(new Promise((resolve) => (resolveLookup = resolve)));

      renderPage();
      await fillRequiredFields(user);
      await user.type(screen.getByLabelText("Fuel Tank Capacity (L)"), "55");
      await waitFor(() => expect(apiFetch).toHaveBeenCalled(), { timeout: 3000 });
      resolveLookup({ fuel_tank_capacity_liters: 64.3, fuel_tank_capacity_estimated: true });

      await waitFor(() => expect(screen.getByLabelText("Fuel Tank Capacity (L)")).toHaveValue(55));
      expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    },
    10000,
  );
});
