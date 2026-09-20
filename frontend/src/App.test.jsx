// Tests that routing renders the correct placeholder screen for each
// public CarSage screen, redirects logged-out users away from protected
// screens, and renders the 404 fallback for unknown routes.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { supabase } from "./lib/supabaseClient.js";

vi.mock("./lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

/**
 * Renders <App /> (wrapped with AuthProvider, logged-out by default) with
 * the router's initial history set to the given path.
 * @param {string} path
 */
function renderAtPath(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("App routing — public screens", () => {
  it("renders the Landing screen at /", () => {
    renderAtPath("/");
    expect(
      screen.getByRole("heading", { name: "CarSage" }),
    ).toBeInTheDocument();
  });

  it("renders the Log In screen at /login", () => {
    renderAtPath("/login");
    expect(screen.getByRole("heading", { name: "Log In" })).toBeInTheDocument();
  });

  it("renders the Sign Up screen at /signup", () => {
    renderAtPath("/signup");
    expect(
      screen.getByRole("heading", { name: "Sign Up" }),
    ).toBeInTheDocument();
  });

  it("renders the Not Found screen for an unknown route (invalid input case)", () => {
    renderAtPath("/this-route-does-not-exist");
    expect(
      screen.getByRole("heading", { name: "Page Not Found" }),
    ).toBeInTheDocument();
  });

  it("logged out: the nav is only the brand, the two marketing anchors and Sign Up / Log In", async () => {
    renderAtPath("/");
    // Wait for the session to resolve so the auth control has rendered.
    await screen.findByRole("link", { name: "Sign Up / Log In" });
    const nav = screen.getByRole("navigation");

    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/",
      "/#features",
      "/#how-it-works",
      "/login",
    ]);
  });

  it("logged in: the nav shows the full app menu (brand + 5 screens) and a Log Out button", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-123", email: "driver@example.com" } } },
    });
    renderAtPath("/");
    await screen.findByRole("button", { name: "Log Out" });
    const nav = screen.getByRole("navigation");

    expect([...nav.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "/",
      "/dashboard",
      "/cars/new",
      "/cars/mine",
      "/trip-planner",
      "/advisor",
    ]);
  });
});

describe("App routing — protected screens redirect logged-out users", () => {
  it.each([
    ["/dashboard"],
    ["/cars/new"],
    ["/cars/mine"],
    ["/cars/abc-123"],
    ["/trip-planner"],
    ["/advisor"],
  ])("redirects %s to the Log In screen", async (path) => {
    renderAtPath(path);
    expect(
      await screen.findByRole("heading", { name: "Log In" }),
    ).toBeInTheDocument();
  });
});
