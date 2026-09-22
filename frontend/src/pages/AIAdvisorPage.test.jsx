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
 * or none) and "advisor_messages" (that conversation's rows, if any) —
 * plus the DIY fix-feedback update ("Did this fix it?", mentor feedback,
 * no Jira task). Returns `updateCalls`, one {id, marked_fixed} per update.
 */
function mockSupabaseTables({ cars, conversation = null, messages = [], updateError = null }) {
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

  const updateCalls = [];
  const messagesUpdate = vi.fn((row) => ({
    eq: vi.fn((_column, id) => {
      updateCalls.push({ id, ...row });
      return Promise.resolve({ data: updateError ? null : [{ id, ...row }], error: updateError });
    }),
  }));

  supabase.from.mockImplementation((table) => {
    if (table === "cars") return { select: carsSelect };
    if (table === "advisor_conversations") return { select: conversationSelect };
    if (table === "advisor_messages") return { select: messagesSelect, update: messagesUpdate };
    throw new Error(`mockSupabaseTables: unexpected table "${table}"`);
  });

  return { updateCalls };
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
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
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
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
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
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
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

  it("disables Send for whitespace-only input", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    renderPage();

    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "     ");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("caps the description at 1000 characters, matching the backend", async () => {
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    renderPage();

    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");

    expect(input).toHaveAttribute("maxlength", "1000");
  });

  it("shows the server's clear message when the description is rejected (symbols only)", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockRejectedValue(new Error("Please describe the problem in a few words."));

    renderPage();
    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "!!!???");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please describe the problem in a few words.",
    );
    expect(screen.queryByText("See a Mechanic")).not.toBeInTheDocument();
  });
});

describe("AIAdvisorPage — car selector", () => {
  it("does not show a selector with only one car (normal case)", async () => {
    mockSupabaseTables({ cars: [{ id: "car-1", make: "Toyota", model: "Corolla", year: 2020 }] });
    renderPage();

    await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
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
    const input = screen.getByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
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
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
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

describe("AIAdvisorPage — DIY video suggestion (CAR-40)", () => {
  it("shows a video card linking out to YouTube when the response includes one (normal case)", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      recommendation: "diy",
      guidance: "Top it up.",
      video_title: "How to Top Up Washer Fluid",
      video_url: "https://www.youtube.com/watch?v=abc123",
    });

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
    await user.type(input, "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const videoLink = await screen.findByRole("link", {
      name: /How to Top Up Washer Fluid/,
    });
    expect(videoLink).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=abc123",
    );
    expect(videoLink).toHaveAttribute("target", "_blank");
    expect(videoLink.querySelector("img")).toHaveAttribute(
      "src",
      "https://img.youtube.com/vi/abc123/hqdefault.jpg",
    );
  });

  it.each([
    ["javascript: URL", "javascript:alert(document.cookie)"],
    ["data: URL", "data:text/html,<script>alert(1)</script>"],
    ["plain http", "http://www.youtube.com/watch?v=abc123XYZ"],
    ["another host", "https://evil.example.com/watch?v=abc123XYZ"],
    ["lookalike host", "https://www.youtube.com.evil.example/watch?v=abc123XYZ"],
    ["not a watch page", "https://www.youtube.com/redirect?v=abc123XYZ"],
    ["path-tricking video id", "https://www.youtube.com/watch?v=../../evil"],
    ["not a URL at all", "not a url"],
  ])("never turns an unsafe saved video URL into a link (%s)", async (_label, badUrl) => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      recommendation: "diy",
      guidance: "Top it up.",
      video_title: "Sneaky video",
      video_url: badUrl,
    });

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
    await user.type(input, "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // The answer itself still shows; only the video card is dropped.
    expect(await screen.findByText("Top it up.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Sneaky video/ })).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("rebuilds the link from the video id instead of using the stored URL verbatim", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      recommendation: "diy",
      guidance: "Top it up.",
      video_title: "A video",
      video_url: "https://youtube.com/watch?v=abc123XYZ&list=evil&t=99#frag",
    });

    renderPage();
    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "Washer fluid");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("link", { name: /A video/ })).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=abc123XYZ",
    );
  });

  it("shows no video card when the response has no video (edge case)", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({ recommendation: "diy", guidance: "Top it up." });

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
    await user.type(input, "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("DIY Fixable");
    expect(screen.queryByRole("link", { name: /Top it up/ })).not.toBeInTheDocument();
  });

  it("shows a saved video from a reloaded conversation", async () => {
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      conversation: { id: "conv-1" },
      messages: [
        { sender: "user", message_text: "Washer fluid light is on", recommendation: null },
        {
          sender: "ai",
          message_text: "Top it up.",
          recommendation: "diy",
          video_title: "How to Top Up Washer Fluid",
          video_url: "https://www.youtube.com/watch?v=abc123",
        },
      ],
    });

    renderPage();

    const videoLink = await screen.findByRole("link", {
      name: /How to Top Up Washer Fluid/,
    });
    expect(videoLink).toHaveAttribute(
      "href",
      "https://www.youtube.com/watch?v=abc123",
    );
  });
});

describe("AIAdvisorPage — DIY fix feedback (mentor feedback, no Jira task)", () => {
  it("shows 'Did this fix it?' on a fresh DIY reply, and saves marked_fixed = true on Yes", async () => {
    const user = userEvent.setup();
    const { updateCalls } = mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      conversation_id: "conv-1",
      message_id: "msg-99",
      recommendation: "diy",
      guidance: "Top it up.",
    });

    renderPage();
    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Did this fix it?");

    await user.click(screen.getByRole("button", { name: "Yes" }));

    expect(await screen.findByText("✓ You said this fixed it")).toBeInTheDocument();
    expect(screen.queryByText("Did this fix it?")).not.toBeInTheDocument();
    expect(updateCalls).toEqual([{ id: "msg-99", marked_fixed: true }]);
  });

  it("saves marked_fixed = false on No, worded differently from Yes", async () => {
    const user = userEvent.setup();
    const { updateCalls } = mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      conversation_id: "conv-1",
      message_id: "msg-99",
      recommendation: "diy",
      guidance: "Top it up.",
    });

    renderPage();
    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "No" }));

    expect(await screen.findByText("You said this didn't fix it")).toBeInTheDocument();
    expect(updateCalls).toEqual([{ id: "msg-99", marked_fixed: false }]);
  });

  it("lets the user change their answer after picking one", async () => {
    const user = userEvent.setup();
    const { updateCalls } = mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      conversation_id: "conv-1",
      message_id: "msg-99",
      recommendation: "diy",
      guidance: "Top it up.",
    });

    renderPage();
    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "No" }));
    await screen.findByText("You said this didn't fix it");

    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByText("Did this fix it?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Yes" }));

    expect(await screen.findByText("✓ You said this fixed it")).toBeInTheDocument();
    expect(updateCalls).toEqual([
      { id: "msg-99", marked_fixed: false },
      { id: "msg-99", marked_fixed: true },
    ]);
  });

  it("does not show the control on a mechanic reply", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      conversation_id: "conv-1",
      message_id: "msg-99",
      recommendation: "mechanic",
      guidance: "See a mechanic.",
    });

    renderPage();
    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "Brakes are grinding");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByText("See a Mechanic");
    expect(screen.queryByText("Did this fix it?")).not.toBeInTheDocument();
  });

  it("is optional — sending another message works without answering it first", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValueOnce({
      conversation_id: "conv-1",
      message_id: "msg-99",
      recommendation: "diy",
      guidance: "Top it up.",
    });
    apiFetch.mockResolvedValueOnce({
      conversation_id: "conv-1",
      message_id: "msg-100",
      recommendation: "mechanic",
      guidance: "See a mechanic.",
    });

    renderPage();
    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
    await user.type(input, "First issue");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Did this fix it?"); // left unanswered on purpose

    await user.type(input, "Second issue");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("See a Mechanic")).toBeInTheDocument();
  });

  it("restores the saved answer instead of asking again, on a reply reloaded from history", async () => {
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      conversation: { id: "conv-1" },
      messages: [
        { id: "msg-1", sender: "user", message_text: "Washer fluid light is on", recommendation: null },
        {
          id: "msg-2",
          sender: "ai",
          message_text: "Top it up.",
          recommendation: "diy",
          marked_fixed: true,
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("✓ You said this fixed it")).toBeInTheDocument();
    expect(screen.queryByText("Did this fix it?")).not.toBeInTheDocument();
  });

  it("still asks for feedback on a reloaded reply that has none yet", async () => {
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      conversation: { id: "conv-1" },
      messages: [
        { id: "msg-1", sender: "user", message_text: "Washer fluid light is on", recommendation: null },
        {
          id: "msg-2",
          sender: "ai",
          message_text: "Top it up.",
          recommendation: "diy",
          marked_fixed: null,
        },
      ],
    });

    renderPage();

    expect(await screen.findByText("Did this fix it?")).toBeInTheDocument();
  });

  it("shows a plain error and keeps the buttons if saving the answer fails", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      updateError: { code: "42501", message: "new row violates row-level security policy" },
    });
    apiFetch.mockResolvedValue({
      conversation_id: "conv-1",
      message_id: "msg-99",
      recommendation: "diy",
      guidance: "Top it up.",
    });

    renderPage();
    await user.type(await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"), "Washer fluid light is on");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.click(await screen.findByRole("button", { name: "Yes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that — try again.");
    expect(screen.getByText("Did this fix it?")).toBeInTheDocument(); // still unanswered, can retry
  });
});
