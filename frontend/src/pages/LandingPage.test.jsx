// Tests for the Landing screen: the accessible page heading, the three
// feature cards, and that the primary CTA points to Sign Up when logged
// out (normal case) and to the Dashboard when already logged in (edge
// case). The Supabase client is mocked so no real network calls happen.

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

  it("points every primary CTA (hero + closing) to Sign Up when logged out (normal case)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    const ctas = await screen.findAllByRole("link", { name: /Get Started/ });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/signup");
    }
  });

  it("points every primary CTA to the Dashboard when already logged in (edge case)", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    renderPage();

    const ctas = await screen.findAllByRole("link", { name: /Go to Dashboard/ });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/dashboard");
    }
  });
});
