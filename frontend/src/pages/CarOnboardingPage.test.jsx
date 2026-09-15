// Tests for the Add Your Car screen: required-field validation (normal
// case + missing-field and invalid-year edge cases), a successful submit
// writing the logged-in user's id onto the new row, and the insert-error
// case. The Supabase client is mocked so no real network calls happen.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CarOnboardingPage from "./CarOnboardingPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

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
});
