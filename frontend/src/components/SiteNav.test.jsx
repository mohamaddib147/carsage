// Tests for the header's centered links (marketing anchors when signed out,
// the full app menu when signed in, none while loading) and its auth
// control: a logged-out session shows ONLY "Sign Up / Log In", a logged-in
// session shows ONLY "Log Out" (no email in it), neither shows while the
// session is still loading, the header flips when the session changes (log
// in / log out), and Log Out really signs out. The Supabase client is
// mocked so getSession() and the auth-state listener are driven by the
// tests — no real network calls.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  const MY_CAR_LINKS = ["Car Profile", "Fuel Log", "Maintenance", "Expenses", "Add a car"];

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
  it.each(["/trip-planner", "/fuel-log", "/fuel-log/", "/trip-planner/", "/expenses", "/dashboard"])(
    "logged in on %s (a screen that shows prices): the switch is shown",
    async (path) => {
      supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
      renderNavWithCurrency(path);

      expect(await screen.findByRole("group", { name: "Show prices in" })).toBeInTheDocument();
    },
  );

  it.each(["/cars/new", "/cars/mine", "/cars/car-1", "/advisor", "/maintenance", "/"])(
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
    renderNavWithCurrency("/advisor"); // CAR-64: the Dashboard shows prices now, so start from AI Advisor
    await screen.findByRole("button", { name: "Log Out" });
    expect(toggle()).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "My Car" })); // CAR-62: Fuel Log is in this menu
    await user.click(screen.getByRole("link", { name: "Fuel Log" }));
    expect(await screen.findByRole("group", { name: "Show prices in" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "AI Advisor" }));
    expect(toggle()).not.toBeInTheDocument();
  });

  it("keeps the saved choice while the switch is hidden on other screens", async () => {
    const user = userEvent.setup();
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
    renderNavWithCurrency("/fuel-log");
    await user.click(await screen.findByRole("button", { name: "LBP" }));

    await user.click(screen.getByRole("link", { name: "AI Advisor" })); // hidden here
    await user.click(screen.getByRole("link", { name: "Trip Planner" })); // and back

    expect(await screen.findByRole("button", { name: "LBP" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("SiteNav brand logo (CAR-51)", () => {
  // CAR-74: the link is named "CarSage home" (where it goes), not just the logo's alt text.
  it("shows the CarSage logo, linking to the Landing page", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNav();

    const brandLink = await screen.findByRole("link", { name: "CarSage home" });
    expect(brandLink).toHaveAttribute("href", "/");
    expect(brandLink.querySelector("img")).toBeInTheDocument();
  });

  it("uses the on-dark (white) logo variant — the header background is dark green", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNav();

    const brandLink = await screen.findByRole("link", { name: "CarSage home" });
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

  it("is closed until clicked, then lists Car Profile, Fuel Log, Maintenance, Expenses and Add a car", async () => {
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
    expect(screen.getByRole("link", { name: "Expenses" })).toHaveAttribute("href", "/expenses");
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

  it.each(["/maintenance", "/expenses", "/fuel-log", "/cars/mine", "/cars/abc-123", "/cars/new"])(
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

// --- CAR-74: the narrow-screen Menu button and panel ---------------------------
// jsdom has no media queries, so these test the behaviour and the markup (one
// panel element holds every link on both widths); the CSS that shows the panel
// as a dropdown at 860 px and below, and as the plain bar above it, is checked
// in src/headerCss.test.js, and in a real browser at 1280, 1024, 768, 390 and 320 px.
describe("SiteNav narrow-screen menu (CAR-74)", () => {
  function renderAt(path, session = { user: LOGGED_IN_USER }) {
    supabase.auth.getSession.mockResolvedValue({ data: { session } });
    render(
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider><CurrencyProvider>
          <SiteNav />
          <Routes>
            <Route path="*" element={<><p>Page content</p><button type="button">Page button</button></>} />
          </Routes>
        </CurrencyProvider></AuthProvider>
      </MemoryRouter>,
    );
  }

  const menu = () => screen.getByRole("button", { name: "Menu" });
  const panel = () => document.getElementById("site-nav-panel");

  it("shows a same-sized, silent placeholder (no button, no links) until the session is known", () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider><CurrencyProvider><SiteNav /></CurrencyProvider></AuthProvider>
      </MemoryRouter>,
    );

    const placeholder = document.querySelector(".site-nav__toggle--pending");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveClass("site-nav__toggle");
    expect(placeholder).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("button", { name: "Menu" })).not.toBeInTheDocument();
    expect(within(panel()).queryAllByRole("link")).toHaveLength(0);
    expect(within(panel()).queryAllByRole("button")).toHaveLength(0);
  });

  it("is a labelled button that controls the panel, closed at first", async () => {
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });

    expect(menu().tagName).toBe("BUTTON");
    expect(menu()).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toHaveAttribute("aria-controls", "site-nav-panel");
    expect(panel()).not.toHaveClass("is-open");
    expect(document.querySelector(".site-nav__toggle--pending")).not.toBeInTheDocument();
  });

  it("signed in: the panel holds every app link, the My Car menu, the currency switch on price pages, and Log Out", async () => {
    const user = userEvent.setup();
    renderAt("/fuel-log");
    await screen.findByRole("button", { name: "Log Out" });
    const inPanel = within(panel());

    for (const name of ["Dashboard", "Trip Planner", "AI Advisor"]) {
      expect(inPanel.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(inPanel.getByRole("button", { name: "USD" })).toBeInTheDocument();
    expect(inPanel.getByRole("button", { name: "LBP" })).toBeInTheDocument();
    expect(inPanel.getByRole("button", { name: "Log Out" })).toBeInTheDocument();

    await user.click(inPanel.getByRole("button", { name: "My Car" }));
    expect(inPanel.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Dashboard", "/dashboard"],
      ["Car Profile", "/cars/mine"],
      ["Fuel Log", "/fuel-log"],
      ["Maintenance", "/maintenance"],
      ["Expenses", "/expenses"],
      ["Add a car", "/cars/new"],
      ["Trip Planner", "/trip-planner"],
      ["AI Advisor", "/advisor"],
    ]);
    // The logo stays outside the panel, always visible, named for where it goes.
    expect(panel()).not.toContainElement(screen.getByRole("link", { name: "CarSage home" }));
  });

  it("no currency switch in the panel on a page without prices", async () => {
    renderAt("/advisor");
    await screen.findByRole("button", { name: "Log Out" });
    expect(within(panel()).queryByRole("button", { name: "USD" })).not.toBeInTheDocument();
  });

  it("signed out: the panel holds Features, How it works and Sign Up / Log In", async () => {
    renderAt("/", null);
    await screen.findByRole("link", { name: "Sign Up / Log In" });

    expect(within(panel()).getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Features", "/#features"],
      ["How it works", "/#how-it-works"],
      ["Sign Up / Log In", "/login"],
    ]);
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });

  it("keyboard: Enter opens it and moves focus to the first link; Escape closes it and returns focus to the button", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });

    menu().focus();
    await user.keyboard("{Enter}");
    expect(menu()).toHaveAttribute("aria-expanded", "true");
    expect(panel()).toHaveClass("is-open");
    await waitFor(() => expect(within(panel()).getByRole("link", { name: "Dashboard" })).toHaveFocus());

    await user.keyboard("{Escape}");
    expect(menu()).toHaveAttribute("aria-expanded", "false");
    expect(panel()).not.toHaveClass("is-open");
    expect(menu()).toHaveFocus();
  });

  it("keyboard: the My Car menu keeps its arrow keys inside the panel, and its Escape closes only My Car", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });
    await user.click(menu());
    // Opening moves focus into the panel on the next frame; let that happen first.
    await waitFor(() => expect(within(panel()).getByRole("link", { name: "Dashboard" })).toHaveFocus());

    const myCar = within(panel()).getByRole("button", { name: "My Car" });
    myCar.focus();
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("link", { name: "Car Profile" })).toHaveFocus());
    await user.keyboard("{End}");
    expect(screen.getByRole("link", { name: "Add a car" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(myCar).toHaveAttribute("aria-expanded", "false");
    expect(myCar).toHaveFocus();
    expect(menu()).toHaveAttribute("aria-expanded", "true");

    // A second Escape (My Car already closed) closes the panel.
    await user.keyboard("{Escape}");
    expect(menu()).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toHaveFocus();
  });

  it("Escape on the My Car button with its list open closes only My Car", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });
    await user.click(menu());
    await waitFor(() => expect(within(panel()).getByRole("link", { name: "Dashboard" })).toHaveFocus());

    const myCar = within(panel()).getByRole("button", { name: "My Car" });
    await user.click(myCar);
    expect(myCar).toHaveAttribute("aria-expanded", "true");
    expect(myCar).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(myCar).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toHaveAttribute("aria-expanded", "true");
  });

  it("Tab-ing out past the last item closes it", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });
    await user.click(menu());

    within(panel()).getByRole("button", { name: "Log Out" }).focus();
    await user.tab();

    expect(screen.getByRole("button", { name: "Page button" })).toHaveFocus();
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });

  it("Shift+Tab from the first link back to the button keeps it open", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });
    await user.click(menu());
    await waitFor(() => expect(within(panel()).getByRole("link", { name: "Dashboard" })).toHaveFocus());

    await user.tab({ shift: true });
    expect(menu()).toHaveFocus();
    expect(menu()).toHaveAttribute("aria-expanded", "true");
  });

  it("a click outside on plain content closes it and returns focus to the button", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });
    await user.click(menu());
    expect(menu()).toHaveAttribute("aria-expanded", "true");
    // Focus is inside the panel (on its first link) when the click lands.
    await waitFor(() => expect(within(panel()).getByRole("link", { name: "Dashboard" })).toHaveFocus());

    await user.click(screen.getByText("Page content"));

    expect(menu()).toHaveAttribute("aria-expanded", "false");
    expect(menu()).toHaveFocus();
  });

  it("a click outside on another control closes it and leaves focus on that control", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });
    await user.click(menu());

    await user.click(screen.getByRole("button", { name: "Page button" }));
    // Let the frame that opening had queued run: it must not pull focus into the now hidden panel.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(menu()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Page button" })).toHaveFocus();
  });

  it("clicking the button again closes it; following a link closes it", async () => {
    const user = userEvent.setup();
    renderAt("/dashboard");
    await screen.findByRole("button", { name: "Log Out" });

    await user.click(menu());
    await user.click(menu());
    expect(menu()).toHaveAttribute("aria-expanded", "false");

    await user.click(menu());
    await user.click(within(panel()).getByRole("link", { name: "Trip Planner" }));
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });

  it("a signed-out hash link (same page, new location) closes it too", async () => {
    const user = userEvent.setup();
    renderAt("/", null);
    await screen.findByRole("link", { name: "Sign Up / Log In" });

    await user.click(menu());
    await user.click(within(panel()).getByRole("link", { name: "How it works" }));
    expect(menu()).toHaveAttribute("aria-expanded", "false");
  });
});

describe("SiteNav sticky header, active state and keyboard (CAR-77)", () => {
  /** Renders the nav signed in, at `path`, and waits for the signed-in bar. */
  async function renderSignedIn(path = "/dashboard") {
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
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
    await screen.findByRole("button", { name: "Log Out" });
  }

  const nav = () => document.querySelector(".site-nav");

  /** Moves the window to `y` and fires the scroll the header listens for. */
  function scrollTo(y) {
    window.scrollY = y;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
  }

  afterEach(() => {
    window.scrollY = 0;
  });

  it("casts no shadow at the top, and does once the page is past 8 px", async () => {
    await renderSignedIn();
    expect(nav()).not.toHaveClass("is-scrolled");

    scrollTo(9);
    expect(nav()).toHaveClass("is-scrolled");

    scrollTo(0);
    expect(nav()).not.toHaveClass("is-scrolled");
  });

  it("does not cast it at exactly 8 px (the threshold is past 8, not at it)", async () => {
    await renderSignedIn();
    scrollTo(8);
    expect(nav()).not.toHaveClass("is-scrolled");
    scrollTo(8.5);
    expect(nav()).toHaveClass("is-scrolled");
  });

  it("starts with the shadow when the page is already scrolled (a reload part-way down)", async () => {
    window.scrollY = 400;
    await renderSignedIn();
    expect(nav()).toHaveClass("is-scrolled");
  });

  it("stops listening when the header unmounts", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    supabase.auth.getSession.mockResolvedValue({ data: { session: { user: LOGGED_IN_USER } } });
    const { unmount } = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider><CurrencyProvider><SiteNav /></CurrencyProvider></AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Log Out" });
    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });

  it("marks the screen you are on, and only that one (aria-current, which the 2 px bar is drawn from)", async () => {
    await renderSignedIn("/trip-planner");
    expect(screen.getByRole("link", { name: "Trip Planner" })).toHaveAttribute("aria-current", "page");
    for (const label of ["Dashboard", "AI Advisor"]) {
      expect(screen.getByRole("link", { name: label })).not.toHaveAttribute("aria-current");
    }
    expect(screen.getByRole("link", { name: "Trip Planner" })).toHaveClass("active");
  });

  it("marks the My Car button on each of its screens, and not elsewhere", async () => {
    await renderSignedIn("/fuel-log");
    expect(screen.getByRole("button", { name: "My Car" })).toHaveClass("active");
  });

  it("is fully keyboard operable: Tab reaches the links, the menu and Log Out in order", async () => {
    const user = userEvent.setup();
    await renderSignedIn();

    await user.tab(); // the brand
    expect(screen.getByRole("link", { name: "CarSage home" })).toHaveFocus();
    // The narrow-screen Menu button is always in the DOM; on a desktop width CSS hides it with display: none (so it
    // is skipped there) — headerCss.test.js guards that rule, since jsdom applies no media queries.
    await user.tab();
    expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "My Car" })).toHaveFocus();
    // ArrowDown opens the menu and moves into it (CAR-62), Escape returns focus to the button.
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("link", { name: "Car Profile" })).toHaveFocus());
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.getByRole("button", { name: "My Car" })).toHaveFocus());
    // Past the menu: the remaining top-level links, then Log Out.
    await user.tab();
    expect(screen.getByRole("link", { name: "Trip Planner" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "AI Advisor" })).toHaveFocus();
    // The Dashboard shows prices, so the USD | LBP switch is inline in the bar, before Log Out (CAR-64).
    await user.tab();
    expect(screen.getByRole("button", { name: "USD" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "LBP" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Log Out" })).toHaveFocus();
  });

  it("still has no account menu: Log Out is a plain button and the email is never shown", async () => {
    await renderSignedIn();
    const logOutButton = screen.getByRole("button", { name: "Log Out" });
    expect(logOutButton).not.toHaveAttribute("aria-expanded");
    expect(logOutButton).not.toHaveAttribute("aria-haspopup");
    expect(nav()).not.toHaveTextContent(LOGGED_IN_USER.email);
  });
});
