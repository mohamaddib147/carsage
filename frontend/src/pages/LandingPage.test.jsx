// Tests for the Landing screen: the accessible page heading, the three
// feature cards, and that the primary CTAs read "Get Started Free" (-> Sign
// Up) when logged out, "Go to Dashboard" (-> Dashboard) when logged in, and
// are absent while the session is still loading. The Supabase client is
// mocked so no real network calls happen.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LandingPage", () => {
  it("renders an accessible 'CarSage' page heading and the hero headline (normal case)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    expect(
      screen.getByRole("heading", { name: "CarSage" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Everything about your car, in one place"),
    ).toBeInTheDocument();
  });

  it("shows all three feature cards", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    expect(await screen.findByText("Car Profile")).toBeInTheDocument();
    expect(screen.getByText("Trip Planner")).toBeInTheDocument();
    expect(screen.getByText("AI Advisor")).toBeInTheDocument();
  });

  it("logged out: every primary CTA says 'Get Started Free' and links to Sign Up (normal case)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    const ctas = await screen.findAllByRole("link", { name: /Get Started Free/ });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/signup");
    }
    expect(screen.queryByRole("link", { name: /Go to Dashboard/ })).not.toBeInTheDocument();
  });

  it("logged in: every primary CTA says 'Go to Dashboard' and links to the Dashboard (edge case)", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    renderPage();

    const ctas = await screen.findAllByRole("link", { name: /Go to Dashboard/ });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/dashboard");
    }
    expect(screen.queryByRole("link", { name: /Get Started/ })).not.toBeInTheDocument();
  });

  it("shows no CTA while the session is loading (no wrong-state flash)", () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.queryByRole("link", { name: /Get Started/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Go to Dashboard/ })).not.toBeInTheDocument();
  });
});
