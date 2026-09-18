// Tests for the AI Advisor chat screen: the no-car empty state, sending
// a message and getting a DIY response (badge + numbered steps), a
// mechanic response (badge + plain guidance, no numbering), an example
// prompt chip sending immediately, the car selector (hidden with one
// car, shown/switchable with multiple), the clear-error case, and the
// CAR-21 history reload (a past conversation's messages hydrate the
// transcript on mount, and a reply's conversation_id is reused on the
// next send). The Supabase client and the backend apiFetch call are
// both mocked so no real network calls happen.

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

/**
 * Wires supabase.from(...) for all three tables AIAdvisorPage reads on
 * mount: "cars" (same shape Trip Planner's CAR-37 uses), and CAR-21's
 * history reload — "advisor_conversations" (most recent conversation,
 * or none) and "advisor_messages" (that conversation's rows, if any).
 */
function mockSupabaseTables({ cars, conversation = null, messages = [] }) {
  const carsOrder = vi.fn().mockResolvedValue({ data: cars, error: null });
  const carsEq = vi.fn(() => ({ order: carsOrder }));
  const carsSelect = vi.fn(() => ({ eq: carsEq }));

  const conversationMaybeSingle = vi
    .fn()
    .mockResolvedValue({ data: conversation, error: null });
  const conversationLimit = vi.fn(() => ({ maybeSingle: conversationMaybeSingle }));
  const conversationOrder = vi.fn(() => ({ limit: conversationLimit }));
  const conversationEq = vi.fn(() => ({ order: conversationOrder }));
  const conversationSelect = vi.fn(() => ({ eq: conversationEq }));

  const messagesOrder = vi.fn().mockResolvedValue({ data: messages, error: null });
  const messagesEq = vi.fn(() => ({ order: messagesOrder }));
  const messagesSelect = vi.fn(() => ({ eq: messagesEq }));

  supabase.from.mockImplementation((table) => {
    if (table === "cars") return { select: carsSelect };
    if (table === "advisor_conversations") return { select: conversationSelect };
    if (table === "advisor_messages") return { select: messagesSelect };
    throw new Error(`mockSupabaseTables: unexpected table "${table}"`);
  });
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
    mockSupabaseTables({ cars: [] });
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
    mockSupabaseTables({ cars: [{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020 }] });
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
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
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
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
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
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
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
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    renderPage();

    expect(await screen.findByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("AIAdvisorPage — car selector", () => {
  it("does not show a selector with only one car (normal case)", async () => {
    mockSupabaseTables({ cars: [{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020 }] });
    renderPage();

    await screen.findByPlaceholderText("Describe your car issue...");
    expect(screen.queryByLabelText("Car")).not.toBeInTheDocument();
  });

  it("shows a selector defaulting to the first car when there are multiple, and switching changes the car sent", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({
      cars: [
        { id: "car-1", make: "Toyota", model: "Corolla", year: 2020 },
        { id: "car-2", make: "Mercedes-Benz", model: "C230", year: 2005 },
      ],
    });
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

describe("AIAdvisorPage — conversation history (CAR-21)", () => {
  it("hydrates the transcript from a past conversation on mount (normal case)", async () => {
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      conversation: { id: "conv-1" },
      messages: [
        { sender: "user", message_text: "Washer fluid light is on", recommendation: null },
        {
          sender: "ai",
          message_text: "Top it up. It's an easy fix.",
          recommendation: "diy",
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("Washer fluid light is on")).toBeInTheDocument();
    expect(screen.getByText("DIY Fixable")).toBeInTheDocument();
    expect(screen.getByText("Top it up.")).toBeInTheDocument();
    expect(screen.getByText("It's an easy fix.")).toBeInTheDocument();
    // A past conversation was found, so the welcome/example-chips state
    // (shown only when there are no messages) must not appear.
    expect(
      screen.queryByRole("button", { name: "Squeaking brakes at low speed" }),
    ).not.toBeInTheDocument();
  });

  it("shows the welcome state when the user has no past conversation (edge case)", async () => {
    mockSupabaseTables({ cars: [{ id: "car-1" }], conversation: null });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Squeaking brakes at low speed" }),
    ).toBeInTheDocument();
  });

  it("reuses the conversation_id from the first reply on the next message sent", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValueOnce({
      conversation_id: "conv-new",
      recommendation: "diy",
      guidance: "It's fine.",
    });
    apiFetch.mockResolvedValueOnce({
      conversation_id: "conv-new",
      recommendation: "mechanic",
      guidance: "See a mechanic.",
    });

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your car issue...");
    await user.type(input, "First issue");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("DIY Fixable");

    await user.type(input, "Second issue");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2));
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/ai-advisor/classify",
      expect.objectContaining({
        body: expect.objectContaining({ conversation_id: "conv-new" }),
      }),
    );
  });
});
