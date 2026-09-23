// Tests that ProtectedRoute redirects logged-out users to /login and
// renders the protected content for logged-in users.

import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

// Lets a test end (or start) the session after the page is already showing.
let emitAuthChange;

function renderProtected() {
  render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Login placeholder</p>} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <p>Protected dashboard content</p>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  emitAuthChange = () => {};
  supabase.auth.onAuthStateChange.mockImplementation((callback) => {
    emitAuthChange = (session) => callback("SIGNED_OUT", session);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

describe("ProtectedRoute", () => {
  it("redirects a logged-out user to /login (edge case: no session)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    renderProtected();

    expect(await screen.findByText("Login placeholder")).toBeInTheDocument();
    expect(
      screen.queryByText("Protected dashboard content"),
    ).not.toBeInTheDocument();
  });

  it("renders the protected content for a logged-in user (normal case)", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { email: "driver@example.com" } } },
    });

    renderProtected();

    expect(
      await screen.findByText("Protected dashboard content"),
    ).toBeInTheDocument();
  });

  it("shows nothing (not the protected content) while the session is still being checked", () => {
    // getSession never resolves -> still loading.
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));

    renderProtected();

    expect(screen.queryByText("Protected dashboard content")).not.toBeInTheDocument();
    expect(screen.queryByText("Login placeholder")).not.toBeInTheDocument();
  });

  it("redirects to /login the moment the session ends while the protected page is open (expiry / sign-out elsewhere)", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { email: "driver@example.com" } } },
    });

    renderProtected();
    expect(await screen.findByText("Protected dashboard content")).toBeInTheDocument();

    act(() => emitAuthChange(null));

    expect(await screen.findByText("Login placeholder")).toBeInTheDocument();
    expect(screen.queryByText("Protected dashboard content")).not.toBeInTheDocument();
  });

  it("remembers where the visitor was headed so login can send them back", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    const { useLocation } = await import("react-router-dom");
    function ShowFrom() {
      const location = useLocation();
      return <p>came from {location.state?.from?.pathname}</p>;
    }

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<ShowFrom />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <p>Protected dashboard content</p>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("came from /dashboard")).toBeInTheDocument();
  });
});
