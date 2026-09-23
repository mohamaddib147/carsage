// Tests that routing renders the correct placeholder screen for each
// public CarSage screen, redirects logged-out users away from protected
// screens, and renders the 404 fallback for unknown routes.

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import appSource from "./App.jsx?raw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
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
      <AuthProvider><CurrencyProvider>
        <App />
      </CurrencyProvider></AuthProvider>
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

  it("logged in: the nav shows the full app menu (brand + 6 screens) and a Log Out button", async () => {
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
      "/fuel-log",
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
    ["/fuel-log"],
  ])("redirects %s to the Log In screen", async (path) => {
    renderAtPath(path);
    expect(
      await screen.findByRole("heading", { name: "Log In" }),
    ).toBeInTheDocument();
  });
});

// --- CAR-24: the route table itself is checked, not a hand-kept list ----------
// The routes are read from App.jsx's own source, so a route added later that is
// neither wrapped in <ProtectedRoute> nor deliberately listed as public makes
// this fail instead of silently shipping an unprotected screen.

const PUBLIC_PATHS = ["*", "/", "/login", "/privacy", "/signup", "/terms"];

const declaredRoutes = appSource
  .split("<Route")
  .slice(1)
  .map((chunk) => ({
    path: /path="([^"]+)"/.exec(chunk)?.[1],
    protectedRoute: chunk.includes("<ProtectedRoute>"),
  }))
  .filter((route) => route.path);

describe("App routing — every route is either protected or deliberately public (CAR-24)", () => {
  it("found the real route table", () => {
    expect(declaredRoutes.length).toBeGreaterThanOrEqual(11);
    expect(declaredRoutes.some((route) => route.path === "/trip-planner")).toBe(true);
  });

  it("the unprotected routes are exactly the public allow-list (Landing, Log In, Sign Up, Terms, Privacy, 404)", () => {
    const unprotected = declaredRoutes.filter((route) => !route.protectedRoute).map((route) => route.path);

    expect([...unprotected].sort()).toEqual(PUBLIC_PATHS);
  });

  const protectedPaths = declaredRoutes.filter((route) => route.protectedRoute).map((route) => route.path);

  it("protects the app screens (incl. the CAR-53 Fuel Log) and the car profile routes", () => {
    expect([...protectedPaths].sort()).toEqual(
      ["/advisor", "/cars/:carId", "/cars/mine", "/cars/new", "/dashboard", "/fuel-log", "/trip-planner"].sort(),
    );
  });

  it.each(protectedPaths)("a logged-out visitor to %s is sent to Log In and never sees the screen", async (path) => {
    renderAtPath(path.replace(":carId", "abc-123"));

    expect(await screen.findByRole("heading", { name: "Log In" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("the Log In screen a visitor lands on offers a way to Sign Up", async () => {
    renderAtPath("/dashboard");

    await screen.findByRole("heading", { name: "Log In" });
    const signUpLinks = screen.getAllByRole("link", { name: "Sign Up" });
    expect(signUpLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of signUpLinks) {
      expect(link).toHaveAttribute("href", "/signup");
    }
  });
});

describe("App — decorative background texture (CAR-51 follow-up)", () => {
  // Rendered once here (not per page) so it shows on every screen without
  // each page having to place it itself.
  it.each([["/"], ["/login"], ["/signup"]])(
    "shows the background texture at %s",
    (path) => {
      renderAtPath(path);

      expect(document.querySelector(".app-background-texture")).toBeInTheDocument();
    },
  );

  it("is purely decorative — invisible to assistive tech, never mistaken for a real image", () => {
    renderAtPath("/");

    const texture = document.querySelector(".app-background-texture");
    expect(texture).toHaveAttribute("aria-hidden", "true");
    expect(texture).toHaveAttribute("alt", "");
    // Doesn't show up as an accessible image alongside the real logo.
    expect(screen.queryAllByRole("img")).not.toContainEqual(texture);
  });

  it("renders exactly once, not duplicated per route change", () => {
    renderAtPath("/dashboard"); // redirects to Log In, but the texture is outside the route table

    expect(document.querySelectorAll(".app-background-texture")).toHaveLength(1);
  });
});
