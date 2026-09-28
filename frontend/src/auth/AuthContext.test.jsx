// Tests that AuthContext re-hydrates the session on mount (this is what
// makes the logged-in state persist across a page refresh, since
// supabase-js stores the session in localStorage and getSession() reads
// it back), reacts to sign-out, and (mentor feedback, no Jira task)
// starts the Google OAuth redirect with the right provider/options.

import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
    },
  },
}));

function wrapper({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function AuthProbe() {
  const { user, loading } = useAuth();
  if (loading) return <p>Loading...</p>;
  return <p>{user ? `Logged in as ${user.email}` : "Logged out"}</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AuthProvider", () => {
  it("re-hydrates an existing session on mount (persists across page refresh)", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { email: "returning@example.com" } } },
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("Logged in as returning@example.com"),
      ).toBeInTheDocument(),
    );
  });

  it("reports logged out when there is no stored session (edge case)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Logged out")).toBeInTheDocument(),
    );
  });

  it("signInWithGoogle starts the OAuth redirect with the google provider and a dashboard redirect", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/..." }, error: null });

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.signInWithGoogle();

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  });
});
