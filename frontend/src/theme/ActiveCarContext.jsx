// Tracks which of the logged-in user's cars is "active" and applies that
// car's brand theme (CAR-55) site-wide via CSS custom property overrides
// on the document root — swappable, not hardcoded per component, same
// approach index.css already uses for its own tokens. The active car
// follows whichever car was most recently selected on any screen with a
// car selector (Trip Planner, AI Advisor, Fuel Log) or viewed on Car
// Profile — those screens call setActiveCarId when the user picks a car;
// this provider does not decide that on its own beyond defaulting to the
// user's first car. The choice is remembered per user in localStorage so
// it survives navigation and a full reload, same pattern as the currency
// preference (currency/CurrencyContext.jsx).
//
// Unlike useCurrency, useActiveCar does NOT throw when used without a
// provider: the pages that report a selection (setActiveCarId) are unit
// tested on their own, without the whole app tree, and forcing every one
// of those test files to wrap this provider just to make a no-op call
// would be a lot of churn for no behavioral gain — outside a real
// <ActiveCarProvider> there's no document to theme anyway, so a no-op
// setter and DEFAULT_THEME are a safe, inert fallback, not a silent-wrong
// value like an un-provided currency would be.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { DEFAULT_THEME, getBrandTheme } from "./carBrandThemes.js";

const ActiveCarContext = createContext(undefined);

const STORAGE_PREFIX = "carsage.activeCarId.";

/** The browser's localStorage, or null where it's blocked. Never throws. */
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredActiveCarId(userId) {
  try {
    return getStorage()?.getItem(STORAGE_PREFIX + userId) ?? null;
  } catch {
    return null;
  }
}

function storeActiveCarId(userId, carId) {
  try {
    getStorage()?.setItem(STORAGE_PREFIX + userId, carId);
  } catch {
    // Not remembered; the app still works, just without persistence.
  }
}

/**
 * Provides the active car (for brand theming) and a way to change it.
 * Loads the user's cars (id + make only — this is all theming needs) and
 * applies the resulting theme's CSS custom properties to the document
 * root whenever the active car or its make changes.
 * @param {{ children: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
export function ActiveCarProvider({ children }) {
  const { user } = useAuth();
  const [cars, setCars] = useState([]);
  const [activeCarId, setActiveCarIdState] = useState(null);

  useEffect(() => {
    if (!user) {
      setCars([]);
      setActiveCarIdState(null);
      return;
    }

    let cancelled = false;

    async function loadCars() {
      const { data } = await supabase
        .from("cars")
        .select("id, make")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (cancelled) return;
      const loadedCars = data ?? [];
      setCars(loadedCars);

      const stored = readStoredActiveCarId(user.id);
      const restored = loadedCars.find((car) => car.id === stored);
      setActiveCarIdState(restored?.id ?? loadedCars[0]?.id ?? null);
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setActiveCarId = useCallback(
    (carId) => {
      setActiveCarIdState(carId);
      if (user) storeActiveCarId(user.id, carId);
    },
    [user],
  );

  const activeCar = useMemo(
    () => cars.find((car) => car.id === activeCarId) ?? null,
    [cars, activeCarId],
  );

  const theme = useMemo(() => getBrandTheme(activeCar?.make), [activeCar]);

  // Applies the active theme to the document root. Resets to the default
  // theme on unmount so a page that renders without this provider (a
  // logged-out screen, or a test) never inherits a stale brand theme.
  useEffect(() => {
    const root = document.documentElement;
    for (const [property, value] of Object.entries(theme)) {
      root.style.setProperty(property, value);
    }
    return () => {
      for (const property of Object.keys(DEFAULT_THEME)) {
        root.style.removeProperty(property);
      }
    };
  }, [theme]);

  const value = useMemo(
    () => ({ cars, activeCarId, setActiveCarId, activeCar, theme }),
    [cars, activeCarId, setActiveCarId, activeCar, theme],
  );

  return <ActiveCarContext.Provider value={value}>{children}</ActiveCarContext.Provider>;
}

/**
 * The active car, its brand theme, and a way to change it. Safe to call
 * without a surrounding <ActiveCarProvider> (see file header) — returns
 * inert defaults (no active car, DEFAULT_THEME, a no-op setter) instead
 * of throwing.
 * @returns {{ cars: object[], activeCarId: string|null, setActiveCarId: (carId: string) => void, activeCar: object|null, theme: typeof DEFAULT_THEME }}
 */
export function useActiveCar() {
  const context = useContext(ActiveCarContext);
  if (context === undefined) {
    return {
      cars: [],
      activeCarId: null,
      setActiveCarId: () => {},
      activeCar: null,
      theme: DEFAULT_THEME,
    };
  }
  return context;
}
