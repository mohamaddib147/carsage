// Tests for the placeholder Terms of Service / Privacy Policy pages and the
// Landing footer links to them: the links exist and point at real routes
// (no dead links), each route renders its own page while logged out, and
// each page offers a way back.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

// A minimal, endlessly-chainable stub for supabase.from(...) — every method
// call returns itself, and it resolves to an empty result whenever awaited,
// so a protected page's own data fetch (cars, advisor_messages, ...) never
// throws here; this file only cares whether the footer renders.
function chainableEmptyResult() {
  const target = () => {};
  const handler = {
    get(_t, prop) {
      if (prop === "then") return (resolve) => resolve({ data: [], error: null });
      return () => new Proxy(target, handler);
    },
  };
  return new Proxy(target, handler);
}

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => chainableEmptyResult()),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("footer legal links", () => {
  it("shows Terms of Service and Privacy Policy links in the footer", async () => {
    renderAt("/");

    const footer = (await screen.findByText(/Built for a calmer commute/)).closest("footer");
    const terms = footer.querySelector('a[href="/terms"]');
    const privacy = footer.querySelector('a[href="/privacy"]');

    expect(terms).toHaveTextContent("Terms of Service");
    expect(privacy).toHaveTextContent("Privacy Policy");
  });

  // CAR-52: the footer is rendered once in App.jsx (not per page), so it
  // shows up on every screen, not just the Landing page.
  it.each([["/login"], ["/signup"], ["/terms"], ["/privacy"]])(
    "also shows the footer links at %s",
    async (path) => {
      renderAt(path);

      const footer = (await screen.findByText(/Built for a calmer commute/)).closest("footer");
      expect(footer.querySelector('a[href="/terms"]')).toHaveTextContent("Terms of Service");
      expect(footer.querySelector('a[href="/privacy"]')).toHaveTextContent("Privacy Policy");
    },
  );

  it("shows the footer links on a protected screen too, once signed in", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-123", email: "driver@example.com" } } },
    });
    renderAt("/dashboard");

    const footer = (await screen.findByText(/Built for a calmer commute/)).closest("footer");
    expect(footer.querySelector('a[href="/terms"]')).toHaveTextContent("Terms of Service");
    expect(footer.querySelector('a[href="/privacy"]')).toHaveTextContent("Privacy Policy");
  });

  it("navigates from the footer links to the matching pages", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(await screen.findByRole("link", { name: "Terms of Service" }));
    expect(await screen.findByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to Landing" }));
    await user.click(await screen.findByRole("link", { name: "Privacy Policy" }));
    expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
  });
});

describe("legal pages", () => {
  it.each([
    ["/terms", "Terms of Service", "Estimates, not guarantees"],
    ["/privacy", "Privacy Policy", "Row-level security"],
  ])("%s renders its page for a logged-out visitor, not the 404", async (path, title, sectionHeading) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: sectionHeading })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Not Found" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Back to Landing" }).length).toBeGreaterThan(0);
  });

  it("Terms of Service warns that the AI Advisor isn't professional advice", async () => {
    renderAt("/terms");

    expect(
      await screen.findByText(/not a substitute for a professional mechanical inspection/),
    ).toBeInTheDocument();
  });

  it("Privacy Policy lists the third-party services CarSage calls", async () => {
    renderAt("/privacy");

    expect(await screen.findByText("Supabase")).toBeInTheDocument();
    expect(screen.getByText("Google Maps & Places")).toBeInTheDocument();
    expect(screen.getByText(/NHTSA/)).toBeInTheDocument();
  });
});
