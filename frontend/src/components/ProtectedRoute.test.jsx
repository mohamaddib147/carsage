// Tests that ProtectedRoute redirects logged-out users to /login and
// renders the protected content for logged-in users.

import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

vi.mock("../lib/supabaseClient.js", () => ({
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
});
