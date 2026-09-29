// Tests for the combined Sign Up / Log In screen: valid signup, valid
// login, invalid password, duplicate email signup, and empty fields.
// Also (mentor feedback, no Jira task) the "Continue with Google" button:
// starts the OAuth redirect, shows a clear error if it can't even start,
// and is disabled while a redirect is in flight. The Supabase client is
// mocked so no real network/auth calls happen.

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
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
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

describe("AuthPage — input limits (CAR-23)", () => {
  it("caps the email at 254 and the password at 72 characters", () => {
    renderAuthPage("/signup");

    expect(screen.getByLabelText("Email")).toHaveAttribute("maxlength", "254");
    expect(screen.getByLabelText("Password")).toHaveAttribute("maxlength", "72");
  });

  it("rejects a password under 6 characters on Sign Up without calling Supabase", async () => {
    const user = userEvent.setup();

    renderAuthPage("/signup");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "abc12");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 6 characters.",
    );
    expect(supabase.auth.signUp).not.toHaveBeenCalled();
  });

  it("accepts a 6-character password on Sign Up (the boundary)", async () => {
    const user = userEvent.setup();
    supabase.auth.signUp.mockResolvedValue({ data: { session: null }, error: null });

    renderAuthPage("/signup");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "abc123");
    await user.click(screen.getByRole("button", { name: "Sign Up" }));

    await waitFor(() => expect(supabase.auth.signUp).toHaveBeenCalledWith({ email: "new@example.com", password: "abc123" }));
  });

  it("does NOT block a short password on Log In (an existing account must be able to try its own)", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    renderAuthPage("/login");
    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.type(screen.getByLabelText("Password"), "abc");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "driver@example.com",
        password: "abc",
      }),
    );
  });
});

describe("AuthPage — Continue with Google (mentor feedback, no Jira task)", () => {
  it("starts the Google OAuth redirect on click, from both Log In and Sign Up", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/..." }, error: null });

    for (const path of ["/login", "/signup"]) {
      supabase.auth.signInWithOAuth.mockClear();
      renderAuthPage(path);
      await user.click(screen.getByRole("button", { name: /Continue with Google/ }));
      await waitFor(() => expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/dashboard` },
      }));
    }
  });

  it("shows a clear error if the redirect can't even start, instead of Supabase's raw wording", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "Unsupported provider: provider is not enabled" },
    });

    renderAuthPage("/login");
    await user.click(screen.getByRole("button", { name: /Continue with Google/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });

  it("does not block the email/password form, and vice versa", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: { user: { email: "driver@example.com" } } },
      error: null,
    });

    renderAuthPage("/login");
    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() => expect(screen.getByText("Dashboard placeholder")).toBeInTheDocument());
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe("AuthPage — show/hide password (professional-polish pass, no Jira task)", () => {
  it("hides the password by default and reveals it on toggle click", async () => {
    const user = userEvent.setup();
    renderAuthPage("/login");

    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput).toHaveAttribute("type", "password");
  });
});

describe("AuthPage — Forgot password (professional-polish pass, no Jira task)", () => {
  it("shows the link on Log In", () => {
    renderAuthPage("/login");
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument();
  });

  it("does not show the link on Sign Up", () => {
    renderAuthPage("/signup");
    expect(screen.queryByRole("button", { name: "Forgot password?" })).not.toBeInTheDocument();
  });

  it("sends a reset email and shows a non-committal confirmation (never reveals whether the account exists)", async () => {
    const user = userEvent.setup();
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    renderAuthPage("/login");
    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.click(screen.getByRole("button", { name: /Send reset link/ }));

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "driver@example.com",
      { redirectTo: `${window.location.origin}/reset-password` },
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If that email has an account, a reset link is on its way.",
    );
  });

  it("requires an email before submitting", async () => {
    const user = userEvent.setup();
    renderAuthPage("/login");

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    await user.click(screen.getByRole("button", { name: /Send reset link/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your email address.");
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("returns to the normal Log In form via \"Back to Log In\"", async () => {
    const user = userEvent.setup();
    renderAuthPage("/login");

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByRole("heading", { name: "Reset your password" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to Log In" }));
    expect(screen.getByRole("heading", { name: "Log In" })).toBeInTheDocument();
  });
});

describe("AuthPage — error wording (CAR-25)", () => {
  it("never shows server-side wording from Supabase Auth, only a generic sentence", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Database error saving new user at /var/app/gotrue/api.go:214" },
    });

    renderAuthPage("/login");
    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.type(screen.getByLabelText("Password"), "some-password");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong. Please try again.");
    expect(alert).not.toHaveTextContent(/database|gotrue|\.go/i);
  });

  it("says so in plain words when the server can't be reached", async () => {
    const user = userEvent.setup();
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { name: "AuthRetryableFetchError", message: "Failed to fetch" },
    });

    renderAuthPage("/login");
    await user.type(screen.getByLabelText("Email"), "driver@example.com");
    await user.type(screen.getByLabelText("Password"), "some-password");
    await user.click(screen.getByRole("button", { name: "Log In" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});
