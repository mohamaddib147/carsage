// Tests for the combined Sign Up / Log In screen: valid signup, valid
// login, invalid password, duplicate email signup, and empty fields.
// The Supabase client is mocked so no real network/auth calls happen.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthPage from "./AuthPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

/** Renders AuthPage at the given path with a landing page at "/" to observe redirects. */
function renderAuthPage(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<p>Landing placeholder</p>} />
          <Route path="/dashboard" element={<p>Dashboard placeholder</p>} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/signup" element={<AuthPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

describe("AuthPage — Log In", () => {
  it("logs in with correct credentials and redirects to the dashboard (normal case)", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: { user: { email: "driver@example.com" } } },
      error: null,
    });

    renderAuthPage("/login");
    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "driver@example.com",
      password: "correct-password",
    });
    await waitFor(() =>
      expect(screen.getByText("Dashboard placeholder")).toBeInTheDocument(),
    );
  });

  it("shows a clear error on incorrect credentials (invalid password case)", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    renderAuthPage("/login");
    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Invalid login credentials");
    expect(screen.queryByText("Dashboard placeholder")).not.toBeInTheDocument();
  });

  it("does not call Supabase and shows a validation error on empty fields (edge case)", async () => {
    const user = userEvent.setup();
    renderAuthPage("/login");

    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Email and password are required.");
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("AuthPage — Sign Up", () => {
  it("creates an account and redirects when no email confirmation is required (normal case)", async () => {
    const user = userEvent.setup();
    supabase.auth.signUp.mockResolvedValue({
      data: { session: { user: { email: "new@example.com" } } },
      error: null,
    });

    renderAuthPage("/signup");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "a-strong-password");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "a-strong-password",
    });
    await waitFor(() =>
      expect(screen.getByText("Dashboard placeholder")).toBeInTheDocument(),
    );
  });

  it("shows a confirmation-email message when signup requires email confirmation", async () => {
    const user = userEvent.setup();
    supabase.auth.signUp.mockResolvedValue({
      data: { session: null, user: { email: "new@example.com" } },
      error: null,
    });

    renderAuthPage("/signup");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "a-strong-password");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Check your email to confirm it",
    );
  });

  it("shows a clear error on duplicate email signup", async () => {
    const user = userEvent.setup();
    supabase.auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "User already registered" },
    });

    renderAuthPage("/signup");
    await user.type(screen.getByLabelText("Email"), "existing@example.com");
    await user.type(screen.getByLabelText("Password"), "a-strong-password");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "User already registered",
    );
  });

  it("does not call Supabase and shows a validation error on empty fields (edge case)", async () => {
    const user = userEvent.setup();
    renderAuthPage("/signup");

    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Email and password are required.");
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });
});
