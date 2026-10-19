// Tests for the header's centered links (marketing anchors when signed out,
// the full app menu when signed in, none while loading) and its auth
// control: a logged-out session shows ONLY "Sign Up / Log In", a logged-in
// session shows ONLY "Log Out" (no email in it), neither shows while the
// session is still loading, the header flips when the session changes (log
// in / log out), and Log Out really signs out. The Supabase client is
// mocked so getSession() and the auth-state listener are driven by the
// tests — no real network calls.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteNav from "./SiteNav.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { CURRENCY_STORAGE_KEY } from "../lib/currency.js";
import { supabase } from "../lib/supabaseClient.js";

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

let emitAuthChange;

beforeEach(() => {
  vi.clearAllMocks();
  emitAuthChange = () => {};
  supabase.auth.onAuthStateChange.mockImplementation((callback) => {
    emitAuthChange = (session) => callback("SIGNED_IN", session);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  supabase.auth.signOut.mockResolvedValue({ error: null });
});

function renderNav() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider><CurrencyProvider>
        <SiteNav />
        <Routes>
          <Route path="/login" element={<p>Login screen</p>} />
          <Route path="*" element={<p>Some other screen</p>} />
        </Routes>
      </CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
}

const signUpLogIn = () => screen.queryByRole("link", { name: "Sign Up / Log In" });
const logOut = () => screen.queryByRole("button", { name: /Log Out/ });

describe("SiteNav auth control", () => {
  it("logged out: shows ONLY 'Sign Up / Log In'", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNav();

    expect(await screen.findByRole("link", { name: "Sign Up / Log In" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(logOut()).not.toBeInTheDocument();
  });

  it("logged in: shows ONLY 'Log Out', without the raw email", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    renderNav();

    expect(await screen.findByRole("button", { name: "Log Out" })).toBeInTheDocument();
    expect(signUpLogIn()).not.toBeInTheDocument();
    expect(screen.queryByText(/driver@example\.com/)).not.toBeInTheDocument();
  });

  it("shows neither control while the session is still loading (no wrong-state flash)", async () => {
    // getSession never resolves -> AuthProvider stays in its loading state.
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    renderNav();

    expect(signUpLogIn()).not.toBeInTheDocument();
    expect(logOut()).not.toBeInTheDocument();
  });

  it("flips from Log Out to Sign Up / Log In when the session ends, and back on log in", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    renderNav();
    expect(await screen.findByRole("button", { name: "Log Out" })).toBeInTheDocument();

    // The session ends (e.g. expiry or logout in another tab).
    act(() => emitAuthChange(null));
    expect(await screen.findByRole("link", { name: "Sign Up / Log In" })).toBeInTheDocument();
    expect(logOut()).not.toBeInTheDocument();

    // A new session starts (logging in).
    act(() => emitAuthChange({ user: LOGGED_IN_USER }));
    expect(await screen.findByRole("button", { name: "Log Out" })).toBeInTheDocument();
    expect(signUpLogIn()).not.toBeInTheDocument();
  });

  it("clicking Log Out signs out, goes to the Log In screen, and shows Sign Up / Log In", async () => {
    const user = userEvent.setup();
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    // Like real supabase-js, signing out fires the auth listener with no session.
    supabase.auth.signOut.mockImplementation(async () => {
      emitAuthChange(null);
      return { error: null };
    });
    renderNav();

    await user.click(await screen.findByRole("button", { name: "Log Out" }));

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Login screen")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Sign Up / Log In" })).toBeInTheDocument();
    expect(logOut()).not.toBeInTheDocument();
  });
});

describe("SiteNav center links", () => {
  // CAR-62: the top level is Dashboard, the "My Car" menu, Trip Planner, AI Advisor;
  // Car Profile, Fuel Log, Maintenance and "Add a car" sit inside "My Car".
  const APP_LINKS = ["Dashboard", "Trip Planner", "AI Advisor"];
  const MY_CAR_LINKS = ["Car Profile", "Fuel Log", "Maintenance", "Add a car"];

  it("logged out: shows only 'Features' and 'How it works' anchors, no app routes", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNav();
    await screen.findByRole("link", { name: "Sign Up / Log In" });

    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute("href", "/#features");
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "/#how-it-works",
    );
    for (const label of [...APP_LINKS, ...MY_CAR_LINKS]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "My Car" })).not.toBeInTheDocument();
  });

  it("logged in: shows the full app menu and no marketing anchors", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    renderNav();
    await screen.findByRole("button", { name: "Log Out" });

    for (const label of APP_LINKS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    await userEvent.setup().click(screen.getByRole("button", { name: "My Car" }));
    for (const label of MY_CAR_LINKS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("link", { name: "Features" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "How it works" })).not.toBeInTheDocument();
  });

  it("shows no center links while the session is loading (no wrong-state flash)", () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    renderNav();

    expect(screen.queryByRole("link", { name: "Features" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });

  it("swaps the menu when the session changes", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    renderNav();
    expect(await screen.findByRole("link", { name: "Dashboard" })).toBeInTheDocument();

    act(() => emitAuthChange(null));

    expect(await screen.findByRole("link", { name: "Features" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
  });
});

describe("SiteNav currency toggle (CAR-54)", () => {
  // The switch is only shown on screens that show prices, so these tests open the Trip Planner
  // unless they are checking another screen.
  function renderNavWithCurrency(path = "/trip-planner") {
    window.localStorage.clear();
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <CurrencyProvider>
            <SiteNav />
          </CurrencyProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  const toggle = () => screen.queryByRole("group", { name: "Show prices in" });

  it("logged in: shows the USD | LBP switch next to Log Out, with USD pressed by default", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
    renderNavWithCurrency();

    expect(await screen.findByRole("group", { name: "Show prices in" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "USD" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "false");
    expect(logOut()).toBeInTheDocument();
  });

  it("logged out: no switch (there are no prices to show)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNavWithCurrency();

    await screen.findByRole("link", { name: "Sign Up / Log In" });
    expect(toggle()).not.toBeInTheDocument();
  });

  it("no switch while the session is still loading", () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    renderNavWithCurrency();

    expect(toggle()).not.toBeInTheDocument();
  });

  it("choosing LBP presses it and saves the choice", async () => {
    const user = userEvent.setup();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
    renderNavWithCurrency();

    await user.click(await screen.findByRole("button", { name: "LBP" }));

    expect(screen.getByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "USD" })).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem(CURRENCY_STORAGE_KEY)).toBe("LBP");
  });

  // Item 7 of the Car Onboarding polish: only screens that display prices get the switch.
  it.each(["/trip-planner", "/fuel-log", "/fuel-log/", "/trip-planner/"])(
    "logged in on %s (a screen that shows prices): the switch is shown",
    async (path) => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
      renderNavWithCurrency(path);

      expect(await screen.findByRole("group", { name: "Show prices in" })).toBeInTheDocument();
    },
  );

  it.each(["/dashboard", "/cars/new", "/cars/mine", "/cars/car-1", "/advisor", "/"])(
    "logged in on %s (no prices here): the switch is hidden but Log Out is still there",
    async (path) => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
      renderNavWithCurrency(path);

      expect(await screen.findByRole("button", { name: "Log Out" })).toBeInTheDocument();
      expect(toggle()).not.toBeInTheDocument();
    },
  );

  it("appears when the user navigates to a price screen and goes away again when they leave it", async () => {
    const user = userEvent.setup();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
    renderNavWithCurrency("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });
    expect(toggle()).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "My Car" })); // CAR-62: Fuel Log is in this menu
    await user.click(screen.getByRole("link", { name: "Fuel Log" }));
    expect(await screen.findByRole("group", { name: "Show prices in" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    expect(toggle()).not.toBeInTheDocument();
  });

  it("keeps the saved choice while the switch is hidden on other screens", async () => {
    const user = userEvent.setup();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
    renderNavWithCurrency("/fuel-log");
    await user.click(await screen.findByRole("button", { name: "LBP" }));

    await user.click(screen.getByRole("link", { name: "Dashboard" })); // hidden here
    await user.click(screen.getByRole("link", { name: "Trip Planner" })); // and back

    expect(await screen.findByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("SiteNav brand logo (CAR-51)", () => {
  it("shows the CarSage logo, linking to the Landing page", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNav();

    const brandLink = await screen.findByRole("link", { name: "CarSage" });
    expect(brandLink).toHaveAttribute("href", "/");
    expect(brandLink.querySelector("img")).toBeInTheDocument();
  });

  it("uses the on-dark (white) logo variant — the header background is dark green", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNav();

    const brandLink = await screen.findByRole("link", { name: "CarSage" });
    expect(brandLink.querySelector("img").src).toMatch(/on-dark/);
  });
});

describe("SiteNav 'My Car' menu (CAR-62)", () => {
  function renderAt(path) {
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider><CurrencyProvider>
          <SiteNav />
          <Routes>
            <Route path="*" element={<p>Some screen</p>} />
          </Routes>
        </CurrencyProvider></AuthProvider>
      </MemoryRouter>,
    );
  }

  beforeEach(() => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
  });

  const menuButton = () => screen.getByRole("button", { name: "My Car" });

  it("is closed until clicked, then lists Car Profile, Fuel Log, Maintenance and Add a car", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Maintenance" })).not.toBeInTheDocument();

    await user.click(menuButton());

    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Car Profile" })).toHaveAttribute("href", "/cars/mine");
    expect(screen.getByRole("link", { name: "Fuel Log" })).toHaveAttribute("href", "/fuel-log");
    expect(screen.getByRole("link", { name: "Maintenance" })).toHaveAttribute("href", "/maintenance");
    expect(screen.getByRole("link", { name: "Add a car" })).toHaveAttribute("href", "/cars/new");
  });

  it("closes when a link is followed (and on any navigation)", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });

    await user.click(menuButton());
    await user.click(screen.getByRole("link", { name: "Maintenance" }));

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Fuel Log" })).not.toBeInTheDocument();
  });

  it("works from the keyboard: ArrowDown opens and focuses the first link, arrows move, Escape closes and returns focus", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });

    menuButton().focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("link", { name: "Car Profile" })).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("link", { name: "Fuel Log" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("link", { name: "Add a car" })).toHaveFocus();
    await user.keyboard("{ArrowDown}"); // wraps around
    expect(screen.getByRole("link", { name: "Car Profile" })).toHaveFocus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("link", { name: "Add a car" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("link", { name: "Car Profile" })).not.toBeInTheDocument();
    expect(menuButton()).toHaveFocus();
  });

  it("closes on a click outside it", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });

    await user.click(menuButton());
    await user.click(screen.getByText("Some screen"));

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  it.each(["/maintenance", "/fuel-log", "/cars/mine", "/cars/abc-123", "/cars/new"])(
    "shows the menu as the current section on %s",
    async (path) => {
      renderAt(path);
      await screen.findByRole("button", { name: "Log Out" });

      expect(menuButton()).toHaveClass("active");
    },
  );

  it("doesn't show it as current elsewhere", async () => {
    renderAt("/trip-planner");
    await screen.findByRole("button", { name: "Log Out" });

    expect(menuButton()).not.toHaveClass("active");
  });
});
