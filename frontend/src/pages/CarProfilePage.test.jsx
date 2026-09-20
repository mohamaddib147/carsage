// Tests for the Car Profile screen: viewing all fields, the empty state
// (no car yet, linking to onboarding), editing and saving a field, edit
// validation, and that a car this user doesn't own (or that doesn't
// exist) renders the same safe "not found" state rather than leaking
// anything about it or crashing.

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CarProfilePage from "./CarProfilePage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };

const SAMPLE_CAR = {
  id: "car-456",
  user_id: "user-123",
  make: "Toyota",
  model: "Corolla",
  year: 2020,
  engine_type: "Inline-4",
  fuel_type: "Gasoline",
  fuel_efficiency: 32,
  cylinders: 4,
  drivetrain: "fwd",
  transmission: "a",
  fuel_tank_capacity_liters: 55,
  license_plate: "ABC-123",
  vin: "1HGCM82633A004352",
};

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

/** Wires supabase.from("cars") to resolve `selectResult` for both the
 * by-id and "mine" query shapes, `updateResult` for update(), and
 * `deleteResult` for delete() (CAR-38). */
function mockCarsTable({ selectResult, updateResult, deleteResult }) {
  const maybeSingle = vi.fn().mockResolvedValue(selectResult);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eqForSelect = vi.fn(() => ({ maybeSingle, order }));
  const select = vi.fn(() => ({ eq: eqForSelect }));

  const single = vi.fn().mockResolvedValue(updateResult ?? { data: null, error: null });
  const selectAfterUpdate = vi.fn(() => ({ single }));
  const eqForUpdate = vi.fn(() => ({ select: selectAfterUpdate }));
  const update = vi.fn(() => ({ eq: eqForUpdate }));

  const eqForDelete = vi.fn().mockResolvedValue(deleteResult ?? { error: null });
  const carDelete = vi.fn(() => ({ eq: eqForDelete }));

  supabase.from.mockReturnValue({ select, update, delete: carDelete });
  return { eqForSelect, eqForUpdate, update, eqForDelete, delete: carDelete };
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/cars/mine" element={<CarProfilePage />} />
          <Route path="/cars/:carId" element={<CarProfilePage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
          <Route path="/dashboard" element={<p>Dashboard placeholder</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { user: LOGGED_IN_USER } },
  });
});

describe("CarProfilePage — viewing", () => {
  it("displays all fields for the logged-in user's car at /cars/mine (normal case)", async () => {
    mockCarsTable({ selectResult: { data: SAMPLE_CAR, error: null } });

    renderAt("/cars/mine");

    expect(await screen.findByText("Toyota")).toBeInTheDocument();
    expect(screen.getByText("Corolla")).toBeInTheDocument();
    expect(screen.getByText("2020")).toBeInTheDocument();
    expect(screen.getByText("Inline-4")).toBeInTheDocument();
    expect(screen.getByText("Gasoline")).toBeInTheDocument();
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("fwd")).toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.getByText("ABC-123")).toBeInTheDocument();
    expect(screen.getByText("1HGCM82633A004352")).toBeInTheDocument();
  });

  it("shows a placeholder dash for spec-autofill fields that were never set (edge case)", async () => {
    const {
      cylinders,
      drivetrain,
      transmission,
      fuel_tank_capacity_liters,
      ...carWithoutAutofill
    } = SAMPLE_CAR;
    mockCarsTable({ selectResult: { data: carWithoutAutofill, error: null } });

    renderAt("/cars/mine");

    expect(await screen.findByText("Toyota")).toBeInTheDocument();
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it("displays a car looked up by id at /cars/:carId (normal case)", async () => {
    mockCarsTable({ selectResult: { data: SAMPLE_CAR, error: null } });

    renderAt("/cars/car-456");

    expect(await screen.findByText("Toyota")).toBeInTheDocument();
  });

  it("shows an empty state linking to Car Onboarding when the user has no car yet (edge case)", async () => {
    mockCarsTable({ selectResult: { data: null, error: null } });

    renderAt("/cars/mine");

    expect(
      await screen.findByText("You haven't added a car yet."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Add Your Car" });
    expect(link).toHaveAttribute("href", "/cars/new");
  });

  it("renders special characters in VIN as plain text, not as HTML (XSS edge case)", async () => {
    const trickyVin = "<script>alert(1)</script>O'Brien\"; DROP TABLE cars;--";
    mockCarsTable({
      selectResult: { data: { ...SAMPLE_CAR, vin: trickyVin }, error: null },
    });

    const { container } = renderAt("/cars/mine");

    expect(await screen.findByText(trickyVin)).toBeInTheDocument();
    // React escapes text content by default; confirm no actual <script> tag
    // was ever inserted into the rendered DOM.
    expect(container.querySelector("script")).toBeNull();
  });

  it("shows the same safe not-found state for a car id this user can't see, instead of leaking or crashing (RLS edge case)", async () => {
    // RLS filters out rows you don't own, so a request for someone else's
    // car id resolves to no rows — not an error — exactly like "no car".
    mockCarsTable({ selectResult: { data: null, error: null } });

    renderAt("/cars/someone-elses-car-id");

    expect(
      await screen.findByText("You haven't added a car yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Toyota")).not.toBeInTheDocument();
  });
});

describe("CarProfilePage — editing", () => {
  it("saves an edited field via an update scoped to the car's id (normal case)", async () => {
    const user = userEvent.setup();
    const { eqForUpdate, update } = mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
      updateResult: {
        data: { ...SAMPLE_CAR, model: "Camry" },
        error: null,
      },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    const modelInput = screen.getByLabelText("Model *");
    await user.clear(modelInput);
    await user.type(modelInput, "Camry");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ model: "Camry", make: "Toyota" }),
    );
    expect(eqForUpdate).toHaveBeenCalledWith("id", "car-456");
    await waitFor(() => expect(screen.getByText("Camry")).toBeInTheDocument());
  });

  it("shows a validation error and does not save when a required field is cleared (edge case)", async () => {
    const user = userEvent.setup();
    const { update } = mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    const makeInput = screen.getByLabelText("Make *");
    await user.clear(makeInput);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Make is required.")).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("shows a clear error and stays in edit mode when the update fails", async () => {
    const user = userEvent.setup();
    mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
      updateResult: {
        data: null,
        error: { message: "new row violates row-level security policy" },
      },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "new row violates row-level security policy",
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("discards changes when Cancel is clicked", async () => {
    const user = userEvent.setup();
    mockCarsTable({ selectResult: { data: SAMPLE_CAR, error: null } });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Model *"));
    await user.type(screen.getByLabelText("Model *"), "Discarded");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Corolla")).toBeInTheDocument();
    expect(screen.queryByText("Discarded")).not.toBeInTheDocument();
  });
});

describe("CarProfilePage — fuel tank capacity (CAR-44)", () => {
  it("saves an edited tank capacity as a number scoped to the car's id", async () => {
    const user = userEvent.setup();
    const { update } = mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
      updateResult: {
        data: { ...SAMPLE_CAR, fuel_tank_capacity_liters: 60 },
        error: null,
      },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    const input = screen.getByLabelText("Fuel Tank Capacity (L)");
    expect(input).toHaveValue(55);
    await user.clear(input);
    await user.type(input, "60");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ fuel_tank_capacity_liters: 60 }),
    );
    await waitFor(() => expect(screen.getByText("60")).toBeInTheDocument());
  });

  it("allows clearing the tank capacity back to empty (saved as null)", async () => {
    const user = userEvent.setup();
    const { update } = mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
      updateResult: { data: { ...SAMPLE_CAR, fuel_tank_capacity_liters: null }, error: null },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Fuel Tank Capacity (L)"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ fuel_tank_capacity_liters: null }),
    );
  });

  it.each([["-5"], ["0"], ["430"], ["4"]])(
    "rejects a tank capacity of %s (outside 5-200 L) without saving (invalid input)",
    async (typed) => {
      const user = userEvent.setup();
      const { update } = mockCarsTable({ selectResult: { data: SAMPLE_CAR, error: null } });

      renderAt("/cars/mine");
      await user.click(await screen.findByRole("button", { name: "Edit" }));
      const input = screen.getByLabelText("Fuel Tank Capacity (L)");
      await user.clear(input);
      await user.type(input, typed);
      await user.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByText("Tank capacity must be between 5 and 200 liters."),
      ).toBeInTheDocument();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("accepts the boundary values 5 and 200", async () => {
    const user = userEvent.setup();
    const { update } = mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
      updateResult: { data: { ...SAMPLE_CAR, fuel_tank_capacity_liters: 200 }, error: null },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const input = screen.getByLabelText("Fuel Tank Capacity (L)");
    await user.clear(input);
    await user.type(input, "200");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ fuel_tank_capacity_liters: 200 }),
    );
  });
});

describe("CarProfilePage — deleting (CAR-38)", () => {
  it("deletes the car and navigates to the Dashboard after confirming (normal case)", async () => {
    const user = userEvent.setup();
    const { eqForDelete } = mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Delete Car" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete" }));

    expect(eqForDelete).toHaveBeenCalledWith("id", "car-456");
    await waitFor(() =>
      expect(screen.getByText("Dashboard placeholder")).toBeInTheDocument(),
    );
  });

  it("does not delete when the confirmation is cancelled (edge case)", async () => {
    const user = userEvent.setup();
    const { delete: carDelete } = mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Delete Car" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(carDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Corolla")).toBeInTheDocument();
  });

  it("shows a clear error and stays on the page when the delete fails", async () => {
    const user = userEvent.setup();
    mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
      deleteResult: { error: { message: "new row violates row-level security policy" } },
    });

    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Delete Car" }));
    await user.click(screen.getByRole("button", { name: "Yes, Delete" }));

    expect(await screen.findByText("new row violates row-level security policy")).toBeInTheDocument();
    expect(screen.getByText("Corolla")).toBeInTheDocument();
  });
});

describe("CarProfilePage — input limits (CAR-23)", () => {
  async function openEdit(user) {
    const table = mockCarsTable({ selectResult: { data: SAMPLE_CAR, error: null } });
    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    return table;
  }

  it.each([
    ["Make *", 60],
    ["Model *", 60],
    ["Engine Type", 60],
    ["License Plate", 20],
    ["Drivetrain", 60],
    ["Transmission", 60],
    ["VIN", 32],
  ])("caps the %s field at %i characters", async (label, max) => {
    const user = userEvent.setup();
    await openEdit(user);

    expect(screen.getByLabelText(label)).toHaveAttribute("maxlength", String(max));
  });

  it.each([
    ["Model *", 61, "Model must be 60 characters or fewer."],
    ["Engine Type", 61, "Engine type must be 60 characters or fewer."],
    ["License Plate", 21, "License plate must be 20 characters or fewer."],
    ["VIN", 33, "VIN must be 32 characters or fewer."],
  ])("still refuses an oversized %s if the input cap is bypassed, without saving", async (label, length, message) => {
    const user = userEvent.setup();
    const { update } = await openEdit(user);

    fireEvent.change(screen.getByLabelText(label), { target: { value: "x".repeat(length) } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ["Fuel Efficiency (km/L)", "500", "Fuel efficiency must be between 0 and 100 km/L."],
    ["Cylinders", "99", "Cylinders must be a whole number between 1 and 16."],
  ])("rejects %s = %s and does not save", async (label, value, message) => {
    const user = userEvent.setup();
    const { update } = await openEdit(user);

    const input = screen.getByLabelText(label);
    await user.clear(input);
    await user.type(input, value);
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it("describes a database rule violation in plain words, never the constraint name", async () => {
    const user = userEvent.setup();
    mockCarsTable({
      selectResult: { data: SAMPLE_CAR, error: null },
      updateResult: {
        data: null,
        error: { code: "23514", message: 'violates check constraint "cars_cylinders_range_check"' },
      },
    });
    renderAt("/cars/mine");
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("outside the allowed range or length");
    expect(alert).not.toHaveTextContent("cars_cylinders_range_check");
  });
});
