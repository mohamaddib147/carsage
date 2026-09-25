// Tests for the active-car / brand-theming provider (CAR-55): it loads
// the logged-in user's cars, defaults the active car to the first one,
// applies that car's brand theme as CSS custom properties on the
// document root, switches (and reapplies) the theme when the active car
// changes, remembers the choice per user across a reload, falls back to
// the default theme for an unmapped make or no cars, and useActiveCar()
// works safely without a surrounding provider.

import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { ActiveCarProvider, useActiveCar } from "./ActiveCarContext.jsx";
import { DEFAULT_THEME } from "./carBrandThemes.js";

const USER = { id: "user-123", email: "driver@example.com" };
const SESSION = { user: USER };

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

/** Wires supabase.from("cars").select().eq().order() to resolve `cars`. */
function mockCars(cars) {
  const order = vi.fn().mockResolvedValue({ data: cars, error: null });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  supabase.from.mockImplementation((table) => {
    if (table === "cars") return { select };
    throw new Error(`mockCars: unexpected table "${table}"`);
  });
}

// Rendered at /dashboard (a themed page, not one of UNTHEMED_PATHS) so
// existing tests can observe the theme actually being applied; the
// untheming behavior itself has its own dedicated tests below.
function wrapper({ children }) {
  return (
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <ActiveCarProvider>{children}</ActiveCarProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

function wrapperAt(path) {
  return function AtPathWrapper({ children }) {
    return (
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <ActiveCarProvider>{children}</ActiveCarProvider>
        </AuthProvider>
      </MemoryRouter>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  document.documentElement.removeAttribute("style");
  supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION } });
});

describe("ActiveCarProvider", () => {
  it("defaults the active car to the user's first car and applies its brand theme (normal case)", async () => {
    mockCars([
      { id: "car-1", make: "Ferrari" },
      { id: "car-2", make: "BMW" },
    ]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));
    expect(result.current.activeCar).toEqual({ id: "car-1", make: "Ferrari" });
    expect(result.current.theme["--color-primary"]).toBe("#d40000");
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#d40000");
  });

  it("swaps the theme when the active car changes to a different mapped brand", async () => {
    mockCars([
      { id: "car-1", make: "Ferrari" },
      { id: "car-2", make: "BMW" },
    ]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));

    act(() => result.current.setActiveCarId("car-2"));

    await waitFor(() => expect(result.current.theme["--color-primary"]).toBe("#0066b2"));
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#0066b2");
  });

  it("falls back to the default theme for a car with an unmapped make (edge case)", async () => {
    mockCars([{ id: "car-1", make: "Yugo" }]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));
    expect(result.current.theme).toEqual(DEFAULT_THEME);
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe(
      DEFAULT_THEME["--color-primary"],
    );
  });

  it("falls back to the default theme when the user has no cars (edge case)", async () => {
    mockCars([]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.cars).toEqual([]));
    expect(result.current.activeCarId).toBeNull();
    expect(result.current.theme).toEqual(DEFAULT_THEME);
  });

  it("remembers the active car per user across a fresh provider (reload)", async () => {
    mockCars([
      { id: "car-1", make: "Ferrari" },
      { id: "car-2", make: "BMW" },
    ]);
    const first = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(first.result.current.activeCarId).toBe("car-1"));
    act(() => first.result.current.setActiveCarId("car-2"));
    await waitFor(() => expect(first.result.current.activeCarId).toBe("car-2"));
    first.unmount();

    const second = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(second.result.current.activeCarId).toBe("car-2"));
  });
});

describe("ActiveCarProvider — public/marketing pages keep the default look", () => {
  it.each(["/", "/login", "/signup", "/terms", "/privacy"])(
    "does not apply the active car's brand theme on %s, even with a mapped active car",
    async (path) => {
      mockCars([{ id: "car-1", make: "Ferrari" }]);
      const { result } = renderHook(() => useActiveCar(), { wrapper: wrapperAt(path) });

      await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));
      // The hook's own `theme` still reflects the active car (Trip Planner,
      // Car Profile etc. read it too) — only the document root is spared.
      expect(result.current.theme["--color-primary"]).toBe("#d40000");
      expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe(
        DEFAULT_THEME["--color-primary"],
      );
    },
  );

  it("still applies the brand theme on a themed page like /dashboard", async () => {
    mockCars([{ id: "car-1", make: "Ferrari" }]);
    const { result } = renderHook(() => useActiveCar(), { wrapper: wrapperAt("/dashboard") });

    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));
    expect(document.documentElement.style.getPropertyValue("--color-primary")).toBe("#d40000");
  });
});

describe("useActiveCar without a provider", () => {
  // Unlike useCurrency, this does NOT throw (see ActiveCarContext.jsx's file
  // header) — it's safe for a page under test on its own to call
  // setActiveCarId without wrapping the whole app's theming provider.
  it("returns inert defaults instead of throwing", () => {
    const { result } = renderHook(() => useActiveCar());

    expect(result.current.activeCarId).toBeNull();
    expect(result.current.activeCar).toBeNull();
    expect(result.current.theme).toEqual(DEFAULT_THEME);
    expect(() => result.current.setActiveCarId("car-1")).not.toThrow();
  });
});
