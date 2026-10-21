// Tests for the AI Advisor chat screen: the no-car empty state, sending
// a message and getting a DIY response (badge + numbered steps), a
// mechanic response (badge + plain guidance, no numbering), an example
// prompt chip sending immediately, the car selector (hidden with one
// car, shown/switchable with multiple), the clear-error case, and the
// CAR-21 history reload (a past conversation's messages hydrate the
// transcript on mount, and a reply's conversation_id is reused on the
// next send). Also covers the fix for switching cars always showing the
// same conversation: history is now loaded per selected car_id (not
// just the most recent conversation overall), so switching the car
// selector reloads that car's own thread. The Supabase client and the
// backend apiFetch call are both mocked so no real network calls happen.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AIAdvisorPage from "./AIAdvisorPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { apiFetch } from "../lib/apiClient.js";
import { scanPhoto } from "../lib/scanPhoto.js";
import { supabase } from "../lib/supabaseClient.js";

// The warning-light scan sends a photo to the backend: mocked, so no network call happens.
vi.mock("../lib/scanPhoto.js", () => ({ scanPhoto: vi.fn() }));

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
 * mount/car-switch: "cars" (same shape Trip Planner's CAR-37 uses), and
 * CAR-21's history reload — "advisor_conversations" (the *selected car's*
 * most recent conversation, or none) and "advisor_messages" (that
 * conversation's rows, if any) — plus the DIY fix-feedback update ("Did
 * this fix it?", mentor feedback, no Jira task). Returns `updateCalls`,
 * one {id, marked_fixed} per update.
 *
 * `conversation`/`messages` cover the single-car-history case. For
 * multi-car history (verifying switching cars loads that car's own
 * thread, not always the same one), pass `conversationsByCar`: a map of
 * car id -> { conversation, messages }.
 */
function mockSupabaseTables({
  cars,
  conversation = null,
  messages = [],
  conversationsByCar = null,
  updateError = null,
}) {
  const carsOrder = vi.fn().mockResolvedValue({ data: cars, error: null });
  const carsEq = vi.fn(() => ({ order: carsOrder }));
  const carsSelect = vi.fn(() => ({ eq: carsEq }));

  const conversationEq2 = vi.fn((_column, carId) => {
    const conv = conversationsByCar ? (conversationsByCar[carId]?.conversation ?? null) : conversation;
    const maybeSingle = vi.fn().mockResolvedValue({ data: conv, error: null });
    return { order: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) })) };
  });
  const conversationEq1 = vi.fn(() => ({ eq: conversationEq2 }));
  const conversationSelect = vi.fn(() => ({ eq: conversationEq1 }));

  const messagesEq = vi.fn((_column, conversationId) => {
    let rows = messages;
    if (conversationsByCar) {
      const entry = Object.values(conversationsByCar).find(
        (candidate) => candidate.conversation?.id === conversationId,
      );
      rows = entry?.messages ?? [];
    }
    return { order: vi.fn().mockResolvedValue({ data: rows, error: null }) };
  });
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

  it("shows a hint under the input not to include personal details, tied to the input", async () => {
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    renderPage();

    const input = await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
    expect(input).toHaveAccessibleDescription(
      "Don't include personal details such as names, license plates or phone numbers.",
    );
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

  it("loads each car's own conversation history when switching, instead of always showing the same one", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({
      cars: [
        { id: "car-1", make: "Toyota", model: "Corolla", year: 2020 },
        { id: "car-2", make: "Honda", model: "CR-V", year: 2018 },
      ],
      conversationsByCar: {
        "car-1": {
          conversation: { id: "conv-corolla" },
          messages: [
            { sender: "user", message_text: "Corolla tire pressure light", recommendation: null },
            { sender: "ai", message_text: "Check the tires.", recommendation: "diy" },
          ],
        },
        "car-2": {
          conversation: { id: "conv-crv" },
          messages: [
            { sender: "user", message_text: "CR-V AC blowing warm air", recommendation: null },
            { sender: "ai", message_text: "See a mechanic.", recommendation: "mechanic" },
          ],
        },
      },
    });

    renderPage();
    expect(await screen.findByText("Corolla tire pressure light")).toBeInTheDocument();
    expect(screen.queryByText("CR-V AC blowing warm air")).not.toBeInTheDocument();

    await user.selectOptions(await screen.findByLabelText("Car"), "car-2");

    expect(await screen.findByText("CR-V AC blowing warm air")).toBeInTheDocument();
    expect(screen.queryByText("Corolla tire pressure light")).not.toBeInTheDocument();
  });

  it("shows the welcome state for a car with no conversation yet, after switching from one that has history", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({
      cars: [
        { id: "car-1", make: "Toyota", model: "Corolla", year: 2020 },
        { id: "car-2", make: "Honda", model: "CR-V", year: 2018 },
      ],
      conversationsByCar: {
        "car-1": {
          conversation: { id: "conv-corolla" },
          messages: [
            { sender: "user", message_text: "Corolla tire pressure light", recommendation: null },
            { sender: "ai", message_text: "Check the tires.", recommendation: "diy" },
          ],
        },
        // car-2 has no conversationsByCar entry -> no past conversation.
      },
    });

    renderPage();
    await screen.findByText("Corolla tire pressure light");

    await user.selectOptions(await screen.findByLabelText("Car"), "car-2");

    expect(
      await screen.findByRole("button", { name: "Squeaking brakes at low speed" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Corolla tire pressure light")).not.toBeInTheDocument();
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

describe("AIAdvisorPage — New Conversation (professional-polish pass, no Jira task)", () => {
  it("is not shown while there is no transcript yet (edge case)", async () => {
    mockSupabaseTables({ cars: [{ id: "car-1" }], conversation: null });
    renderPage();

    await screen.findByRole("button", { name: "Squeaking brakes at low speed" });
    expect(screen.queryByRole("button", { name: "+ New Conversation" })).not.toBeInTheDocument();
  });

  it("clears the transcript and forgets the conversation id, so the next message starts a fresh conversation", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      conversation: { id: "conv-old" },
      messages: [
        { sender: "user", message_text: "Old issue", recommendation: null },
        { sender: "ai", message_text: "Old guidance.", recommendation: "mechanic" },
      ],
    });
    apiFetch.mockResolvedValue({
      conversation_id: "conv-brand-new",
      recommendation: "diy",
      guidance: "New guidance.",
    });

    renderPage();
    expect(await screen.findByText("Old issue")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ New Conversation" }));
    expect(screen.queryByText("Old issue")).not.toBeInTheDocument();
    // Clearing the transcript re-shows the welcome/example-chips state.
    expect(
      await screen.findByRole("button", { name: "Squeaking brakes at low speed" }),
    ).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Describe your issue, e.g. grinding noise when braking");
    await user.type(input, "New issue");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [, options] = apiFetch.mock.calls[0];
    expect(options.body.car_id).toBe("car-1");
    expect(options.body.description).toBe("New issue");
    // No conversation_id carried over from the cleared conversation — the
    // backend treats this as "start a new one" (ai_advisor.py).
    expect(options.body.conversation_id).toBeUndefined();
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

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that, try again.");
    expect(screen.getByText("Did this fix it?")).toBeInTheDocument(); // still unanswered, can retry
  });
});

describe("AIAdvisorPage — Find a mechanic near me (CAR-65)", () => {
  const MECHANIC_LINK = "Find a mechanic near me";
  const EXPECTED_URL =
    "https://www.google.com/maps/search/?api=1&query=car%20mechanic%20near%20me";

  it("shows the link under a live mechanic reply, opening Google Maps safely in a new tab (normal case)", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      recommendation: "mechanic",
      guidance: "This needs a professional inspection right away.",
    });

    renderPage();
    await user.type(
      await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"),
      "Brakes are grinding",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const link = await screen.findByRole("link", { name: MECHANIC_LINK });
    expect(link).toHaveAttribute("href", EXPECTED_URL);
    expect(link).toHaveAttribute("target", "_blank");
    const rel = link.getAttribute("rel").split(/\s+/);
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  it("does not show the link on a DIY reply (edge case)", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      recommendation: "diy",
      guidance: "Top up the washer fluid. Close the cap firmly.",
    });

    renderPage();
    await user.type(
      await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"),
      "Washer fluid light is on",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("DIY Fixable")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: MECHANIC_LINK })).not.toBeInTheDocument();
  });

  it("is present on a mechanic reply reloaded from history, and absent on a reloaded DIY reply", async () => {
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      conversation: { id: "conv-1" },
      messages: [
        { sender: "user", message_text: "Washer fluid light is on", recommendation: null },
        { sender: "ai", message_text: "Top it up.", recommendation: "diy" },
        { sender: "user", message_text: "Now the brakes grind", recommendation: null },
        { sender: "ai", message_text: "Get this checked soon.", recommendation: "mechanic" },
      ],
    });

    renderPage();

    expect(await screen.findByText("Get this checked soon.")).toBeInTheDocument();
    // Exactly one: the DIY reply above it has none.
    const links = screen.getAllByRole("link", { name: MECHANIC_LINK });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", EXPECTED_URL);
  });

  it("shows the link on every mechanic reply, not just the latest one", async () => {
    mockSupabaseTables({
      cars: [{ id: "car-1" }],
      conversation: { id: "conv-1" },
      messages: [
        { sender: "user", message_text: "Grinding brakes", recommendation: null },
        { sender: "ai", message_text: "See a mechanic about the brakes.", recommendation: "mechanic" },
        { sender: "user", message_text: "Engine knocking", recommendation: null },
        { sender: "ai", message_text: "See a mechanic about the engine.", recommendation: "mechanic" },
      ],
    });

    renderPage();

    await screen.findByText("See a mechanic about the engine.");
    expect(screen.getAllByRole("link", { name: MECHANIC_LINK })).toHaveLength(2);
  });

  it("builds the URL from a fixed query only: nothing the user or the AI wrote ends up in it (security)", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [{ id: "car-1" }] });
    apiFetch.mockResolvedValue({
      recommendation: "mechanic",
      guidance: "Try https://evil.example/steal?x=1 and javascript:alert(1) instead.",
    });

    renderPage();
    await user.type(
      await screen.findByPlaceholderText("Describe your issue, e.g. grinding noise when braking"),
      "my Toyota Corolla at 12 Hamra Street leaks oil",
    );
    await user.click(screen.getByRole("button", { name: "Send" }));

    const link = await screen.findByRole("link", { name: MECHANIC_LINK });
    const href = link.getAttribute("href");
    expect(href).toBe(EXPECTED_URL);
    for (const leaked of ["Toyota", "Corolla", "Hamra", "oil", "evil", "javascript"]) {
      expect(href).not.toContain(leaked);
    }
  });
});

describe("AIAdvisorPage — warning-light camera", () => {
  const INPUT = "Describe your issue, e.g. grinding noise when braking";
  const CAR = { id: "car-1", make: "Toyota", model: "Corolla", year: 2020 };
  const photo = () => new File([new Uint8Array(10)], "light.jpg", { type: "image/jpeg" });

  it("shows the three notices under the button before any scan: only the light, Google's free tier, a guess to edit", async () => {
    mockSupabaseTables({ cars: [CAR] });
    renderPage();

    await screen.findByPlaceholderText(INPUT);
    expect(screen.getByText("Scan a warning light")).toBeInTheDocument();
    expect(screen.getByText("Photograph only the warning light: no people, license plates, VINs or documents.")).toBeInTheDocument();
    expect(screen.getByText(/sent to Google's Gemini API to read it, then discarded; it's never saved by CarSage\. On Google's free tier/)).toBeInTheDocument();
    expect(screen.getByText("The result is a guess. Edit it before you send.")).toBeInTheDocument();
  });

  it("a scan FILLS the input with the fixed sentence and sends nothing", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [CAR] });
    scanPhoto.mockResolvedValue({ light: "brake_system", sentence: "The brake warning light is on." });
    renderPage();

    const input = await screen.findByPlaceholderText(INPUT);
    await user.upload(document.getElementById("scanWarningLightFile"), photo());

    await waitFor(() => expect(input).toHaveValue("The brake warning light is on."));
    expect(scanPhoto).toHaveBeenCalledWith("/ai-advisor/scan-warning-light", expect.any(File), "test-access-token");
    expect(apiFetch).not.toHaveBeenCalledWith("/ai-advisor/classify", expect.anything()); // never auto-sent
    expect(screen.queryByText("DIY Fixable")).not.toBeInTheDocument();
  });

  it("appends to what the user already typed, and the user can edit it before Send", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [CAR] });
    scanPhoto.mockResolvedValue({ light: "check_engine", sentence: "The check engine light is on." });
    apiFetch.mockResolvedValue({ recommendation: "mechanic", guidance: "See a mechanic." });
    renderPage();

    const input = await screen.findByPlaceholderText(INPUT);
    await user.type(input, "It started after fuel-up.");
    await user.upload(document.getElementById("scanWarningLightFile"), photo());
    await waitFor(() => expect(input).toHaveValue("It started after fuel-up. The check engine light is on."));

    await user.type(input, " It is flashing.");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("See a mechanic.")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith(
      "/ai-advisor/classify",
      expect.objectContaining({
        body: { car_id: "car-1", description: "It started after fuel-up. The check engine light is on. It is flashing." },
      }),
    );
  });

  it("an unknown light says so and leaves the input untouched", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [CAR] });
    scanPhoto.mockResolvedValue({ light: "unknown", sentence: null });
    renderPage();

    const input = await screen.findByPlaceholderText(INPUT);
    await user.type(input, "Something is on");
    await user.upload(document.getElementById("scanWarningLightFile"), photo());

    expect(await screen.findByText("Couldn't tell which light that is. Describe it in words instead.")).toBeInTheDocument();
    expect(input).toHaveValue("Something is on");
  });

  it("shows the backend's plain message when the scan is refused (e.g. the daily limit)", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [CAR] });
    scanPhoto.mockRejectedValue(new Error("You've reached today's limit of 20 for this feature. It resets at midnight Beirut time."));
    renderPage();

    await screen.findByPlaceholderText(INPUT);
    await user.upload(document.getElementById("scanWarningLightFile"), photo());

    expect(await screen.findByText(/reached today's limit of 20/)).toBeInTheDocument();
  });

  it("refuses a non-image without sending it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    mockSupabaseTables({ cars: [CAR] });
    renderPage();

    await screen.findByPlaceholderText(INPUT);
    await user.upload(document.getElementById("scanWarningLightFile"), new File(["x"], "a.pdf", { type: "application/pdf" }));

    expect(await screen.findByText(/Please choose a photo/)).toBeInTheDocument();
    expect(scanPhoto).not.toHaveBeenCalled();
  });

  it("the scan cannot be used while a message is being sent", async () => {
    const user = userEvent.setup();
    mockSupabaseTables({ cars: [CAR] });
    apiFetch.mockReturnValue(new Promise(() => {})); // never answers
    renderPage();

    const input = await screen.findByPlaceholderText(INPUT);
    await user.type(input, "Squeaky brakes");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(document.getElementById("scanWarningLightFile")).toBeDisabled());
  });
});
