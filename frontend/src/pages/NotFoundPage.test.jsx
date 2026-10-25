// CAR-73: the 404 screen offers one primary way out that fits who is looking: "Go to Dashboard" when signed in, "Back to
// Home" (the Landing page) when signed out, and neither while the session is still being restored (an invisible stand-in
// keeps the place, so the wrong button never flashes). The Supabase client is mocked.

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotFoundPage from "./NotFoundPage.jsx";
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

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/no-such-page"]}>
      <AuthProvider>
        <NotFoundPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NotFoundPage (CAR-73)", () => {
  it("signed in: a primary 'Go to Dashboard' button, and no link back to the Landing page", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    renderPage();

    const button = await screen.findByRole("link", { name: "Go to Dashboard" });
    expect(button).toHaveAttribute("href", "/dashboard");
    expect(button).toHaveClass("btn-primary");
    expect(screen.queryByRole("link", { name: "Back to Home" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page Not Found" })).toBeInTheDocument();
  });

  it("signed out: a primary 'Back to Home' button to the Landing page", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    const button = await screen.findByRole("link", { name: "Back to Home" });
    expect(button).toHaveAttribute("href", "/");
    expect(button).toHaveClass("btn-primary");
    expect(screen.queryByRole("link", { name: "Go to Dashboard" })).not.toBeInTheDocument();
  });

  it("while the session is restored: no button at all, only a hidden stand-in of the same size", () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.queryAllByRole("link")).toHaveLength(0);
    const standIn = document.querySelector("span.btn-primary");
    expect(standIn).toHaveAttribute("aria-hidden", "true");
    expect(standIn).toHaveStyle({ visibility: "hidden" });
  });

  it("the button is the first thing to Tab to on the page", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();
    await screen.findByRole("link", { name: "Back to Home" });

    await waitFor(() => expect(document.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(1));
  });
});
