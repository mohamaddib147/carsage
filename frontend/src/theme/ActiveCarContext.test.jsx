// Tests for the active-car / brand-theming provider (CAR-55): it loads
// the logged-in user's cars, defaults the active car to the first one,
// applies that car's brand theme as CSS custom properties on the
// document root, switches (and reapplies) the theme when the active car
// changes, remembers the choice per user across a reload, falls back to
// the default theme for an unmapped make or no cars, and useActiveCar()
// works safely without a surrounding provider.

import { useLayoutEffect } from "react";
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
  // CAR-70: /reset-password (a recovery link signs the visitor in) and /cars/new (a new car has no brand yet) join the list.
  it.each(["/", "/login", "/signup", "/reset-password", "/cars/new", "/terms", "/privacy"])(
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

// ---- CAR-70 ---------------------------------------------------------------------------------------------------
// The theme follows the car on screen: no green flash on a reload, a failed lookup is not swallowed, and the
// lookup is keyed on the user's id.

const BMW_PRIMARY = "#0066b2";
const FERRARI_PRIMARY = "#d40000";
const rootPrimary = () => document.documentElement.style.getPropertyValue("--color-primary");

/** What a previous visit left behind: this user's active car with its brand, and "this was the last user". */
function storeActive(userId, carId, make) {
  window.localStorage.setItem(`carsage.activeCar.${userId}`, JSON.stringify({ carId, make }));
  window.localStorage.setItem("carsage.activeCarUser", userId);
}

/** Calls the callback AuthProvider registered with supabase.auth.onAuthStateChange, like Supabase does on sign-in or token refresh. */
function fireAuthEvent(event, session) {
  const callback = supabase.auth.onAuthStateChange.mock.calls[0][0];
  act(() => callback(event, session));
}

describe("ActiveCarProvider: no flash on load (CAR-70)", () => {
  it("applies the stored brand before the first paint, without waiting for the login state or the cars lookup", () => {
    storeActive(USER.id, "car-2", "BMW");
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));   // login state never resolves
    supabase.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: () => new Promise(() => {}) }) }) }));

    const { result } = renderHook(() => useActiveCar(), { wrapper });

    // Checked right after the first render, with nothing awaited: this is what the first paint would show.
    expect(rootPrimary()).toBe(BMW_PRIMARY);
    expect(result.current.activeCarId).toBe("car-2");
    expect(result.current.theme["--color-primary"]).toBe(BMW_PRIMARY);
  });

  it("still keeps the stored brand once the login state arrives and the lookup confirms the car (no switch in between)", async () => {
    storeActive(USER.id, "car-2", "BMW");
    mockCars([{ id: "car-1", make: "Ferrari" }, { id: "car-2", make: "BMW" }]);
    const seen = [];
    const { result } = renderHook(
      () => {
        const value = useActiveCar();
        seen.push(rootPrimary());
        return value;
      },
      { wrapper },
    );

    await waitFor(() => expect(result.current.cars).toHaveLength(2));
    expect(result.current.activeCarId).toBe("car-2");
    expect(rootPrimary()).toBe(BMW_PRIMARY);
    expect(new Set(seen.filter(Boolean))).toEqual(new Set([BMW_PRIMARY]));   // never green, never Ferrari
  });

  it("does not show another user's brand: a different signed-in user starts from their own stored car, not the last user's", async () => {
    storeActive("someone-else", "car-9", "BMW");
    mockCars([{ id: "car-1", make: "Ferrari" }]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));
    expect(rootPrimary()).toBe(FERRARI_PRIMARY);
    // The other user's remembered car is untouched.
    expect(JSON.parse(window.localStorage.getItem("carsage.activeCar.someone-else"))).toEqual({ carId: "car-9", make: "BMW" });
  });

  it("signed out: the stored hint is dropped and the next visitor's first paint is not branded", async () => {
    storeActive(USER.id, "car-2", "BMW");
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    mockCars([]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.activeCarId).toBeNull());
    expect(rootPrimary()).toBe(DEFAULT_THEME["--color-primary"]);
    expect(window.localStorage.getItem("carsage.activeCarUser")).toBeNull();
    // This user's own entry stays for their next sign-in.
    expect(window.localStorage.getItem(`carsage.activeCar.${USER.id}`)).not.toBeNull();
  });
});

describe("ActiveCarProvider: applied in the layout phase, i.e. before paint (CAR-70)", () => {
  it("the stored brand is on the document by the time the layout effects have run (an ordinary effect would come after the paint)", () => {
    storeActive(USER.id, "car-2", "BMW");
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    supabase.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: () => new Promise(() => {}) }) }) }));
    let seenInLayoutPhase = null;
    // An ANCESTOR of the provider: its layout effect runs after the provider's layout effect but before every ordinary effect.
    function Probe({ children }) {
      useLayoutEffect(() => {
        seenInLayoutPhase = rootPrimary();
      }, []);
      return children;
    }

    renderHook(() => useActiveCar(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Probe>
            <AuthProvider>
              <ActiveCarProvider>{children}</ActiveCarProvider>
            </AuthProvider>
          </Probe>
        </MemoryRouter>
      ),
    });

    expect(seenInLayoutPhase).toBe(BMW_PRIMARY);
  });
});

describe("ActiveCarProvider: remembering the car (CAR-70)", () => {
  it("stores the car with its brand per user, as JSON, and who the last user was", async () => {
    mockCars([{ id: "car-1", make: "Ferrari" }, { id: "car-2", make: "BMW" }]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));

    act(() => result.current.setActiveCarId("car-2"));

    await waitFor(() => expect(JSON.parse(window.localStorage.getItem(`carsage.activeCar.${USER.id}`))).toEqual({ carId: "car-2", make: "BMW" }));
    expect(window.localStorage.getItem("carsage.activeCarUser")).toBe(USER.id);
  });

  it("still honours a car id stored by the version before CAR-70 (edge case: nobody loses their choice)", async () => {
    window.localStorage.setItem(`carsage.activeCarId.${USER.id}`, "car-2");
    mockCars([{ id: "car-1", make: "Ferrari" }, { id: "car-2", make: "BMW" }]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.cars).toHaveLength(2));
    expect(result.current.activeCarId).toBe("car-2");
    expect(rootPrimary()).toBe(BMW_PRIMARY);
  });

  it("falls back to the first car when the stored one no longer exists (it was deleted)", async () => {
    storeActive(USER.id, "car-gone", "Toyota");
    mockCars([{ id: "car-1", make: "Ferrari" }]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));
    expect(rootPrimary()).toBe(FERRARI_PRIMARY);
  });

  it("a car reported with its make themes at once, before the cars lookup has answered", () => {
    supabase.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order: () => new Promise(() => {}) }) }) }));
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    act(() => result.current.setActiveCarId("car-2", "BMW"));

    expect(rootPrimary()).toBe(BMW_PRIMARY);
    expect(result.current.activeCarId).toBe("car-2");
  });
});

describe("ActiveCarProvider: selectInitialCar (CAR-70)", () => {
  const LIST = [{ id: "car-1", make: "Ferrari" }, { id: "car-2", make: "BMW" }];

  it("returns the active car when the screen's list has it, and the theme stays on it", async () => {
    storeActive(USER.id, "car-2", "BMW");
    mockCars(LIST);
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.cars).toHaveLength(2));

    let picked;
    act(() => { picked = result.current.selectInitialCar(LIST); });

    expect(picked).toBe("car-2");
    expect(rootPrimary()).toBe(BMW_PRIMARY);
  });

  it("returns the first car when the active one isn't in the list, and reports it so the theme matches what the screen shows", async () => {
    storeActive(USER.id, "car-2", "BMW");
    mockCars(LIST);
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.cars).toHaveLength(2));

    let picked;
    act(() => { picked = result.current.selectInitialCar([LIST[0]]); });

    expect(picked).toBe("car-1");
    expect(result.current.activeCarId).toBe("car-1");
    expect(rootPrimary()).toBe(FERRARI_PRIMARY);
  });

  it("returns an empty id for an empty list, and changes nothing (edge case)", async () => {
    storeActive(USER.id, "car-2", "BMW");
    mockCars(LIST);
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.cars).toHaveLength(2));

    let picked;
    act(() => { picked = result.current.selectInitialCar([]); });

    expect(picked).toBe("");
    expect(result.current.activeCarId).toBe("car-2");
  });

  it("without a provider it just picks the first car", () => {
    const { result } = renderHook(() => useActiveCar());
    expect(result.current.selectInitialCar(LIST)).toBe("car-1");
    expect(result.current.selectInitialCar([])).toBe("");
  });
});

describe("ActiveCarProvider: a failing cars lookup, e.g. a 401 (CAR-70)", () => {
  const UNAUTHORIZED = { data: null, error: { status: 401, message: "JWT expired" } };
  const SESSION_1 = { user: USER, access_token: "token-1" };

  /** A lookup that answers with the first answer, then the second, and so on (the last one repeats). */
  function mockLookupSequence(...answers) {
    let call = 0;
    const order = vi.fn(() => Promise.resolve(answers[Math.min(call++, answers.length - 1)]));
    supabase.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ order }) }) }));
    return order;
  }

  it("is not swallowed: it is reported as failed, and a stored but unconfirmed brand is not trusted (default theme)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION_1 } });
    storeActive(USER.id, "car-2", "BMW");
    mockLookupSequence(UNAUTHORIZED);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.lookupFailed).toBe(true));
    expect(rootPrimary()).toBe(DEFAULT_THEME["--color-primary"]);
    expect(result.current.activeCarId).toBe("car-2");   // still remembered, just not applied
  });

  it("retries on the next auth event and then shows the right theme", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION_1 } });
    storeActive(USER.id, "car-2", "BMW");
    const order = mockLookupSequence(UNAUTHORIZED, { data: [{ id: "car-1", make: "Ferrari" }, { id: "car-2", make: "BMW" }], error: null });
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.lookupFailed).toBe(true));
    expect(order).toHaveBeenCalledTimes(1);

    fireAuthEvent("TOKEN_REFRESHED", { user: USER, access_token: "token-2" });

    await waitFor(() => expect(result.current.lookupFailed).toBe(false));
    expect(order).toHaveBeenCalledTimes(2);
    expect(rootPrimary()).toBe(BMW_PRIMARY);
    expect(result.current.cars).toHaveLength(2);
  });

  it("a screen's own report still counts while the lookup is failing (it came from a successful query)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION_1 } });
    mockLookupSequence(UNAUTHORIZED);
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.lookupFailed).toBe(true));

    act(() => result.current.setActiveCarId("car-2", "BMW"));

    expect(rootPrimary()).toBe(BMW_PRIMARY);
  });

  it("stays on the default theme, without crashing, when it keeps failing (edge case: no cars and no stored car)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: SESSION_1 } });
    mockLookupSequence(UNAUTHORIZED);
    const { result } = renderHook(() => useActiveCar(), { wrapper });

    await waitFor(() => expect(result.current.lookupFailed).toBe(true));
    expect(result.current.activeCarId).toBeNull();
    expect(result.current.theme).toEqual(DEFAULT_THEME);
  });
});

describe("ActiveCarProvider: the lookup is keyed on the user's id, not the user object (CAR-70)", () => {
  it("a token refresh (a new user object with the same id) does not look the cars up again", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: USER, access_token: "token-1" } } });
    mockCars([{ id: "car-1", make: "Ferrari" }]);
    const { result } = renderHook(() => useActiveCar(), { wrapper });
    await waitFor(() => expect(result.current.activeCarId).toBe("car-1"));
    expect(supabase.from).toHaveBeenCalledTimes(1);

    fireAuthEvent("TOKEN_REFRESHED", { user: { ...USER }, access_token: "token-2" });
    fireAuthEvent("TOKEN_REFRESHED", { user: { ...USER }, access_token: "token-3" });
    await act(async () => {});

    expect(supabase.from).toHaveBeenCalledTimes(1);
    expect(result.current.activeCarId).toBe("car-1");
  });
});
