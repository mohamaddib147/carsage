// Tests for the header's centered links (marketing anchors when signed out,
// the full app menu when signed in, none while loading) and its auth
// control: a logged-out session shows ONLY "Sign Up / Log In", a logged-in
// session shows ONLY "Log Out" (no email in it), neither shows while the
// session is still loading, the header flips when the session changes (log
// in / log out), and Log Out really signs out. The Supabase client is
// mocked so getSession() and the auth-state listener are driven by the
// tests — no real network calls.

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SiteNav from "./SiteNav.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
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
      <AuthProvider>
        <SiteNav />
        <Routes>
          <Route path="/login" element={<p>Login screen</p>} />
          <Route path="*" element={<p>Some other screen</p>} />
        </Routes>
      </AuthProvider>
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
  const APP_LINKS = ["Dashboard", "Car Onboarding", "Car Profile", "Trip Planner", "AI Advisor"];

  it("logged out: shows only 'Features' and 'How it works' anchors, no app routes", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderNav();
    await screen.findByRole("link", { name: "Sign Up / Log In" });

    expect(screen.getByRole("link", { name: "Features" })).toHaveAttribute("href", "/#features");
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "/#how-it-works",
    );
    for (const label of APP_LINKS) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
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
