// Tests for the AI Advisor chat screen: the no-car empty state, sending
// a message and getting a DIY response (badge + numbered steps), a
// mechanic response (badge + plain guidance, no numbering), an example
// prompt chip sending immediately, the car selector (hidden with one
// car, shown/switchable with multiple), and the clear-error case. The
// Supabase client and the backend apiFetch call are both mocked so no
// real network calls happen.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AIAdvisorPage from "./AIAdvisorPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { supabase } from "../lib/supabaseClient.js";

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };
const SESSION = { user: LOGGED_IN_USER, access_token: "test-access-token" };

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

vi.mock("../lib/apiClient.js", () => ({
  apiFetch: vi.fn(),
}));

/** Wires supabase.from("cars").select().eq().order() to resolve to the
 * given list of the user's cars (same shape Trip Planner's CAR-37 uses). */
function mockCarsLookup(carsArray) {
  const order = vi.fn().mockResolvedValue({ data: carsArray, error: null });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  supabase.from.mockReturnValue({ select });
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/advisor"]}>
      <AuthProvider>
        <Routes>
          <Route path="/advisor" element={<AIAdvisorPage />} />
          <Route path="/cars/new" element={<p>Car onboarding placeholder</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
});

describe("AIAdvisorPage — no car yet", () => {
  it("shows an empty state linking to Car Onboarding (edge case)", async () => {
    mockCarsLookup([]);
    renderPage();

    expect(
      await screen.findByText(/Add a car before describing an issue/),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Add Your Car" });
    expect(link).toHaveAttribute("href", "/cars/new");
  });
});

describe("AIAdvisorPage — chatting", () => {
  it("sends a message and shows a DIY response with numbered steps (normal case)", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020 }]);
    apiFetch.mockResolvedValue({
      recommendation: "diy",
      guidance: "Check the washer fluid. Top it up if low. Close the cap firmly.",
    });

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your car issue...");
    await user.type(input, "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Washer fluid light is on")).toBeInTheDocument();
    expect(await screen.findByText("DIY Fixable")).toBeInTheDocument();
    expect(screen.getByText("Check the washer fluid.")).toBeInTheDocument();
    expect(screen.getByText("Top it up if low.")).toBeInTheDocument();
    expect(screen.getByText("Close the cap firmly.")).toBeInTheDocument();

    expect(apiFetch).toHaveBeenCalledWith(
      "/ai-advisor/classify",
      expect.objectContaining({
        method: "POST",
        accessToken: "test-access-token",
        body: { car_id: "car-1", description: "Washer fluid light is on" },
      }),
    );
  });

  it("shows a mechanic response as plain guidance text, not a numbered list", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    apiFetch.mockResolvedValue({
      recommendation: "mechanic",
      guidance: "This needs a professional inspection right away.",
    });

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your car issue...");
    await user.type(input, "Brakes are grinding");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("See a Mechanic")).toBeInTheDocument();
    expect(
      screen.getByText("This needs a professional inspection right away."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("sends an example prompt chip immediately on click", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    apiFetch.mockResolvedValue({ recommendation: "diy", guidance: "It's fine." });

    renderPage();
    const chip = await screen.findByRole("button", {
      name: "Squeaking brakes at low speed",
    });
    await user.click(chip);

    expect(await screen.findByText("Squeaking brakes at low speed")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/ai-advisor/classify",
      expect.objectContaining({
        body: { car_id: "car-1", description: "Squeaking brakes at low speed" },
      }),
    );
  });

  it("shows a clear error and does not add an assistant reply when the request fails", async () => {
    const user = userEvent.setup();
    mockCarsLookup([{ id: "car-1" }]);
    apiFetch.mockRejectedValue(
      new Error("Could not get advice right now. Please try again."),
    );

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your car issue...");
    await user.type(input, "Engine noise");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not get advice right now. Please try again.",
    );
    expect(screen.queryByText("DIY Fixable")).not.toBeInTheDocument();
    expect(screen.queryByText("See a Mechanic")).not.toBeInTheDocument();
  });

  it("disables Send when the input is empty", async () => {
    mockCarsLookup([{ id: "car-1" }]);
    renderPage();

    expect(await screen.findByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("AIAdvisorPage — car selector", () => {
  it("does not show a selector with only one car (normal case)", async () => {
    mockCarsLookup([{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020 }]);
    renderPage();

    await screen.findByPlaceholderText("Describe your car issue...");
    expect(screen.queryByLabelText("Car")).not.toBeInTheDocument();
  });

  it("shows a selector defaulting to the first car when there are multiple, and switching changes the car sent", async () => {
    const user = userEvent.setup();
    mockCarsLookup([
      { id: "car-1", make: "Toyota", model: "Corolla", year: 2020 },
      { id: "car-2", make: "Mercedes-Benz", model: "C230", year: 2005 },
    ]);
    apiFetch.mockResolvedValue({ recommendation: "diy", guidance: "It's fine." });

    renderPage();
    const carSelect = await screen.findByLabelText("Car");
    expect(carSelect).toHaveValue("car-1");

    await user.selectOptions(carSelect, "car-2");
    const input = screen.getByPlaceholderText("Describe your car issue...");
    await user.type(input, "Engine noise");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledWith(
      "/ai-advisor/classify",
      expect.objectContaining({
        body: expect.objectContaining({ car_id: "car-2" }),
      }),
    );
  });
});
