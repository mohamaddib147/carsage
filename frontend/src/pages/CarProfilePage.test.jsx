// Tests for the Car Profile screen: viewing all fields, the empty state
// (no car yet, linking to onboarding), editing and saving a field, edit
// validation, and that a car this user doesn't own (or that doesn't
// exist) renders the same safe "not found" state rather than leaking
// anything about it or crashing.

import { render, screen, waitFor } from "@testing-library/react";
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
 * by-id and "mine" query shapes, and `updateResult` for update(). */
function mockCarsTable({ selectResult, updateResult }) {
  const maybeSingle = vi.fn().mockResolvedValue(selectResult);
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const eqForSelect = vi.fn(() => ({ maybeSingle, order }));
  const select = vi.fn(() => ({ eq: eqForSelect }));

  const single = vi.fn().mockResolvedValue(updateResult ?? { data: null, error: null });
  const selectAfterUpdate = vi.fn(() => ({ single }));
  const eqForUpdate = vi.fn(() => ({ select: selectAfterUpdate }));
  const update = vi.fn(() => ({ eq: eqForUpdate }));

  supabase.from.mockReturnValue({ select, update });
  return { eqForSelect, eqForUpdate, update };
}

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/cars/mine" element={<CarProfilePage />} />
          <Route path="/cars/:carId" element={<CarProfilePage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
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
    expect(screen.getByText("ABC-123")).toBeInTheDocument();
    expect(screen.getByText("1HGCM82633A004352")).toBeInTheDocument();
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
