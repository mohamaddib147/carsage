// Tests for PlaceAutocompleteInput (CAR-47): suggestions appear and are
// selectable (mouse and keyboard), a selection fills the full text and
// doesn't trigger a redundant lookup, free-text entry is always
// preserved, and no key / too-short input / no results / a failing
// lookup all degrade to a plain text field. fetch is stubbed.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaceAutocompleteInput from "./PlaceAutocompleteInput.jsx";

function Harness() {
  const [value, setValue] = useState("");
  return (
    <div>
      <label htmlFor="place">Place</label>
      <PlaceAutocompleteInput id="place" value={value} onChange={setValue} />
    </div>
  );
}

function stubSuggestions(texts) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      suggestions: texts.map((text) => ({ placePrediction: { text: { text } } })),
    }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PlaceAutocompleteInput", () => {
  it("shows suggestions as the user types and fills the full text on click (normal case)", async () => {
    const user = userEvent.setup();
    const fetchMock = stubSuggestions(["Tripoli, Lebanon", "Tripoli Souks, Lebanon"]);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "Trip");
    const option = await screen.findByRole("option", { name: "Tripoli, Lebanon" });
    expect(screen.getAllByRole("option")).toHaveLength(2);

    await user.click(option);

    expect(screen.getByLabelText("Place")).toHaveValue("Tripoli, Lebanon");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // Picking a suggestion must not fire another lookup for that same text.
    await new Promise((resolve) => setTimeout(resolve, 450));
    const lookedUp = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body).input);
    expect(lookedUp).not.toContain("Tripoli, Lebanon");
  });

  it("selects the highlighted suggestion with the keyboard", async () => {
    const user = userEvent.setup();
    stubSuggestions(["Byblos, Lebanon", "Byblos Castle, Lebanon"]);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "Byb");
    await screen.findByRole("listbox");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(screen.getByLabelText("Place")).toHaveValue("Byblos Castle, Lebanon");
  });

  it("keeps a hand-typed address when no suggestion is picked (free text still works)", async () => {
    const user = userEvent.setup();
    stubSuggestions(["Tripoli, Lebanon"]);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "My own street 12");
    await screen.findByRole("listbox");
    // Enter with nothing highlighted must not swap in a suggestion.
    await user.keyboard("{Enter}");

    expect(screen.getByLabelText("Place")).toHaveValue("My own street 12");
  });

  it("closes the list on Escape without changing the text", async () => {
    const user = userEvent.setup();
    stubSuggestions(["Tripoli, Lebanon"]);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "Trip");
    await screen.findByRole("listbox");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Place")).toHaveValue("Trip");
  });

  it("shows no list when there are no matches (no-results case)", async () => {
    const user = userEvent.setup();
    const fetchMock = stubSuggestions([]);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "zzzqqq");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Place")).toHaveValue("zzzqqq");
  });

  it("stays a plain text field when the lookup fails", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "Tripoli");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Place")).toHaveValue("Tripoli");
  });

  it("does not look anything up without a configured key", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_API_KEY", "");
    const user = userEvent.setup();
    const fetchMock = stubSuggestions(["Tripoli, Lebanon"]);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "Tripoli");
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not look anything up for input shorter than 3 characters", async () => {
    const user = userEvent.setup();
    const fetchMock = stubSuggestions(["Tripoli, Lebanon"]);
    render(<Harness />);

    await user.type(screen.getByLabelText("Place"), "Tr");
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
