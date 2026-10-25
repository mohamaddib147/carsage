// Tracks which of the logged-in user's cars is "active" and applies that
// car's brand theme (CAR-55) site-wide via CSS custom property overrides
// on the document root — swappable, not hardcoded per component, same
// approach index.css already uses for its own tokens.
//
// CAR-70 (behavior fix for CAR-55's "the theme follows the car currently shown"):
//  - Every screen with a car selector (Trip Planner, AI Advisor, Fuel Log, Maintenance,
//    Expenses) and Car Profile REPORTS the car it is showing, on load as well as when
//    the user picks another one. Before, they only reported a pick, so the theme
//    followed "the last car reported" while the page showed the oldest car.
//  - A selector screen starts on the active car when it is in its list, else its first
//    car (selectInitialCar below), so moving between screens keeps the same car.
//  - The active car is remembered per user as { carId, make } in localStorage, and
//    which user's entry applies before login state is known is remembered too. On a
//    reload the stored brand is therefore known at the first render, and the theme is
//    applied in a layout effect, before the first paint. No green flash first.
//  - The cars lookup used to throw its error away: a failed request (a 401 when it ran
//    without the user's session) left an empty list and, silently, the default theme.
//    Now a failure is remembered; while it stands, a stored-but-unconfirmed car is not
//    trusted (default theme), a screen's own report still counts (it came from a
//    successful query), and the lookup is retried when the session's token changes.
//  - The lookup is keyed on the user's id, not the user object, so a token refresh
//    doesn't refetch.
//
// Unlike useCurrency, useActiveCar does NOT throw when used without a
// provider: the pages that report a selection are unit tested on their
// own, without the whole app tree, and forcing every one of those test
// files to wrap this provider just to make a no-op call would be a lot of
// churn for no behavioral gain — outside a real <ActiveCarProvider> there's
// no document to theme anyway, so a no-op setter, "first car" selection and
// DEFAULT_THEME are a safe, inert fallback, not a silent-wrong value like
// an un-provided currency would be.

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { DEFAULT_THEME, getBrandTheme } from "./carBrandThemes.js";

const ActiveCarContext = createContext(undefined);

/** Per user: JSON { carId, make }. */
const STORAGE_PREFIX = "carsage.activeCar.";
/** Before CAR-70 only the car id was stored, under this key. Still read, so nobody loses their choice. */
const LEGACY_PREFIX = "carsage.activeCarId.";
/** Whose stored car applies at the first render, before the login state has loaded. */
const LAST_USER_KEY = "carsage.activeCarUser";

// Public/marketing pages keep CarSage's own brand look even when logged in
// (e.g. clicking the header logo takes a signed-in user back to "/") — a
// car's brand theme belongs on the screens about that car, not on
// CarSage's own landing/auth/legal pages. CAR-70 adds two more: /reset-password
// (a password-recovery link signs the visitor in, but it is a CarSage page, not
// a car page) and /cars/new (a car that is being added has no brand yet).
const UNTHEMED_PATHS = new Set(["/", "/login", "/signup", "/reset-password", "/terms", "/privacy", "/cars/new"]);

/** Nobody's car: no user, no car, nothing confirmed. */
const NO_CAR = Object.freeze({ userId: null, carId: null, make: null, verified: false });

/** The browser's localStorage, or null where it's blocked. Never throws. */
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @returns {string | null} the user whose stored car applies before login state is known */
function readLastUserId() {
  try {
    return getStorage()?.getItem(LAST_USER_KEY) ?? null;
  } catch {
    return null;
  }
}

/**
 * The remembered active car for a user, from the current key, else the pre-CAR-70 key.
 * @param {string} userId
 * @returns {{ carId: string, make: string | null } | null}
 */
function readStoredCar(userId) {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(STORAGE_PREFIX + userId);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.carId === "string") {
        return { carId: parsed.carId, make: typeof parsed.make === "string" ? parsed.make : null };
      }
    }
    const legacy = storage?.getItem(LEGACY_PREFIX + userId);
    return legacy ? { carId: legacy, make: null } : null;
  } catch {
    return null;
  }
}

function storeCar(userId, carId, make) {
  try {
    const storage = getStorage();
    storage?.setItem(STORAGE_PREFIX + userId, JSON.stringify({ carId, make }));
    storage?.setItem(LAST_USER_KEY, userId);
  } catch {
    // Not remembered; the app still works, just without persistence.
  }
}

function forgetLastUser() {
  try {
    getStorage()?.removeItem(LAST_USER_KEY);
  } catch {
    // Nothing to do.
  }
}

/** The state to start from: the last user's stored car, as an unconfirmed hint. */
function initialActive() {
  const userId = readLastUserId();
  const stored = userId ? readStoredCar(userId) : null;
  return stored ? { userId, carId: stored.carId, make: stored.make, verified: false } : NO_CAR;
}

/**
 * After the cars lookup succeeds: keep the active car if the user still has it (a screen may
 * have reported one while the lookup was in flight), else the first car, else nothing.
 * @param {typeof NO_CAR} previous
 * @param {{ id: string, make: string }[]} list
 * @param {string} userId
 */
function reconcile(previous, list, userId) {
  const car = list.find((candidate) => candidate.id === previous.carId) ?? list[0] ?? null;
  if (!car) return { userId, carId: null, make: null, verified: true };
  if (previous.userId === userId && previous.carId === car.id && previous.make === car.make && previous.verified) return previous;
  return { userId, carId: car.id, make: car.make, verified: true };
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
  const { user, session, loading } = useAuth();
  const userId = user?.id ?? null;
  const { pathname } = useLocation();
  const [cars, setCars] = useState([]);
  const [active, setActive] = useState(initialActive);
  // Set when the cars lookup fails: { token } is the access token the failing attempt ran with. Cleared on success.
  const [failure, setFailure] = useState(null);
  const lookupFailed = failure !== null;
  const [attempt, setAttempt] = useState(0);
  const token = session?.access_token ?? null;

  // Once the login state has loaded, make sure the active car belongs to whoever is signed in.
  // Done while rendering (React's "adjust state when a value changes" pattern) so there is no
  // render in between that shows another user's car. While it is still loading, the stored hint stays.
  const settledUserId = loading ? undefined : userId;
  const [seenUserId, setSeenUserId] = useState(undefined);
  if (settledUserId !== undefined && settledUserId !== seenUserId) {
    setSeenUserId(settledUserId);
    if (settledUserId === null) {
      setCars([]);
      setActive(NO_CAR);
      setFailure(null);
    } else if (active.userId !== settledUserId) {
      const stored = readStoredCar(settledUserId);
      setActive(stored ? { userId: settledUserId, carId: stored.carId, make: stored.make, verified: false } : { ...NO_CAR, userId: settledUserId });
    }
  }

  // Signed out: don't let the next visitor's first paint pick up this user's brand.
  useEffect(() => {
    if (settledUserId === null) forgetLastUser();
  }, [settledUserId]);

  // The next auth event after a failure (the access token changed): look the cars up again. Only a standing
  // failure retries, so a normal token refresh never refetches, and a failure never retries in a loop by itself.
  if (failure && token !== failure.token) {
    setFailure({ token });
    setAttempt((count) => count + 1);
  }

  // Latest values for the callbacks below, so they keep a stable identity (pages list them as dependencies).
  const carsRef = useRef(cars);
  const activeRef = useRef(active);
  const userIdRef = useRef(userId);
  const tokenRef = useRef(token);
  useLayoutEffect(() => {
    carsRef.current = cars;
    activeRef.current = active;
    userIdRef.current = userId;
    tokenRef.current = token;
  });

  // The lookup. Keyed on the user's id, so a token refresh (a new user object, same id) doesn't refetch;
  // `attempt` is bumped by the retry above.
  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;

    async function loadCars() {
      // Any failure (an error response such as a 401 when the request went out without the user's
      // session, a network error returned as an error, or one THROWN by the request) is handled the
      // same way: remembered, default theme for an unconfirmed car, retried on the next auth event.
      // Nothing here may throw: an unhandled rejection would surface as an app error.
      let result;
      try {
        result = await supabase
          .from("cars")
          .select("id, make")
          .eq("user_id", userId)
          .order("created_at", { ascending: true });
      } catch {
        result = { data: null, error: { message: "network error" }, status: undefined };
      }
      const { data, error, status } = result ?? {};

      if (cancelled) return;
      if (error || !data) {
        // Development only (removed from production builds): the HTTP status, never a token or user data.
        if (import.meta.env.DEV) {
          console.warn(`[CarSage] Brand theme lookup failed (${status ? `HTTP ${status}` : "no HTTP status, network error"}); using the default theme until the next auth event.`);
        }
        setFailure({ token: tokenRef.current });
        return;
      }
      setFailure(null);
      setCars(data);
      setActive((previous) => reconcile(previous, data, userId));
    }

    loadCars();
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  // Remember the active car, with its brand, per user.
  useEffect(() => {
    if (active.userId && active.carId) storeCar(active.userId, active.carId, active.make);
  }, [active.userId, active.carId, active.make]);

  /**
   * Makes a car the active one. Screens call this with the car they are showing; pass the car's
   * `make` when you have it, so the theme doesn't have to wait for the lookup above.
   * @param {string} carId
   * @param {string} [make]
   */
  const setActiveCarId = useCallback((carId, make) => {
    setActive((previous) => {
      const fromList = carsRef.current.find((car) => car.id === carId);
      const knownMake = make ?? fromList?.make ?? (previous.carId === carId ? previous.make : null);
      const confirmed = make !== undefined || Boolean(fromList) || (previous.carId === carId && previous.verified);
      if (previous.carId === carId && previous.make === knownMake && previous.verified === confirmed) return previous;
      return { userId: userIdRef.current ?? previous.userId, carId, make: knownMake, verified: confirmed };
    });
  }, []);

  /**
   * For a screen that has just loaded the user's cars: which one to show first. The active car if the
   * user still has it, else the first car (also the answer when there is no active car yet). The
   * choice is reported as the active car, so the theme matches what the screen shows.
   * @param {{ id: string, make: string }[]} list the screen's cars, oldest first
   * @returns {string} the car id to select, or "" when there are no cars
   */
  const selectInitialCar = useCallback(
    (list) => {
      const car = list.find((candidate) => candidate.id === activeRef.current.carId) ?? list[0];
      if (car) setActiveCarId(car.id, car.make);
      return car?.id ?? "";
    },
    [setActiveCarId],
  );

  const activeCar = useMemo(
    () => cars.find((car) => car.id === active.carId) ?? (active.carId && active.make ? { id: active.carId, make: active.make } : null),
    [cars, active],
  );

  // A stored car that hasn't been confirmed yet is not trusted while the lookup that would confirm it is failing.
  const themeMake = active.verified || !lookupFailed ? active.make : null;
  const theme = useMemo(() => getBrandTheme(themeMake), [themeMake]);

  // Applies the active theme to the document root, except on CarSage's own
  // public/marketing pages (UNTHEMED_PATHS), which keep the default look
  // even while a brand theme is active elsewhere. A LAYOUT effect, so on a
  // reload the stored brand is in place before the first paint. Resets to
  // the default theme on unmount so a page that renders without this
  // provider (a logged-out screen, or a test) never inherits a stale brand theme.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const effectiveTheme = UNTHEMED_PATHS.has(pathname) ? DEFAULT_THEME : theme;
    for (const [property, value] of Object.entries(effectiveTheme)) {
      root.style.setProperty(property, value);
    }
    return () => {
      for (const property of Object.keys(DEFAULT_THEME)) {
        root.style.removeProperty(property);
      }
    };
  }, [theme, pathname]);

  const value = useMemo(
    () => ({ cars, activeCarId: active.carId, setActiveCarId, selectInitialCar, activeCar, theme, lookupFailed }),
    [cars, active.carId, setActiveCarId, selectInitialCar, activeCar, theme, lookupFailed],
  );

  return <ActiveCarContext.Provider value={value}>{children}</ActiveCarContext.Provider>;
}

/** What useActiveCar returns outside a provider: nothing active, the first car wins, no theming. */
const INERT = {
  cars: [],
  activeCarId: null,
  setActiveCarId: () => {},
  selectInitialCar: (list) => list[0]?.id ?? "",
  activeCar: null,
  theme: DEFAULT_THEME,
  lookupFailed: false,
};

/**
 * The active car, its brand theme, and a way to change it. Safe to call
 * without a surrounding <ActiveCarProvider> (see file header) — returns
 * inert defaults (no active car, "first car" selection, DEFAULT_THEME, a no-op setter) instead
 * of throwing.
 * @returns {{ cars: object[], activeCarId: string|null, setActiveCarId: (carId: string, make?: string) => void, selectInitialCar: (list: object[]) => string, activeCar: object|null, theme: typeof DEFAULT_THEME, lookupFailed: boolean }}
 */
export function useActiveCar() {
  return useContext(ActiveCarContext) ?? INERT;
}
