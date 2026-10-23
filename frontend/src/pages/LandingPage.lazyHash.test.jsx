// CAR-76: the Landing sections below the hero are a lazy chunk, so when a visit starts on a #hash (the header's "Features" and
// "How it works" links) the target section does not exist yet. This file has its own module cache (every test file does), so the chunk
// really arrives after the first render here, which the other Landing tests cannot show because React keeps a loaded chunk: it checks that
// the page first holds the place with the placeholder, then scrolls to the section once it has mounted, and exactly once.

import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

afterEach(() => {
  delete Element.prototype.scrollIntoView;
});

describe("Landing opened on a #hash before its lazy sections have loaded", () => {
  it("shows the placeholder first, then scrolls to the section once it has mounted (once)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    let emitAuthEvent = () => {};
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      emitAuthEvent = (event, session) => callback(event, session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(
      <MemoryRouter initialEntries={["/#how-it-works"]}>
        <AuthProvider>
          <LandingPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    // First render: the hero is there, the sections are not, and a placeholder holds their place.
    expect(screen.getByText(/Know what your car costs/)).toBeInTheDocument();
    expect(document.getElementById("how-it-works")).toBeNull();
    expect(document.querySelector(".landing-sections-placeholder")).toBeInTheDocument();
    expect(scrollIntoView).not.toHaveBeenCalled();

    // The chunk arrives: the placeholder goes, and the page scrolls to the section the hash named.
    await screen.findByRole("heading", { name: "How it works" });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById("how-it-works"));
    expect(document.querySelector(".landing-sections-placeholder")).not.toBeInTheDocument();

    // A later re-render (here: the visitor signs in, which changes the call to action) must not drag them back to the section.
    act(() => emitAuthEvent("SIGNED_IN", { user: { id: "user-1" }, access_token: "token-1" }));
    await screen.findAllByRole("link", { name: /Go to Dashboard/ });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
