// Tests for the Set New Password screen (professional-polish pass, no Jira
// task): the page a "forgot password" email link lands on. Supabase's
// detectSessionInUrl is what actually signs the browser into a recovery
// session before this page mounts — here that's simulated by controlling
// what getSession() resolves to, the same seam AuthContext.test.jsx uses.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ResetPasswordPage from "./ResetPasswordPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      updateUser: vi.fn(),
    },
  },
}));

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/reset-password"]}>
      <AuthProvider>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/dashboard" element={<p>Dashboard placeholder</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordPage — no recovery session (expired/reused link, edge case)", () => {
  it("shows an expired-link message instead of the form", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    renderPage();

    expect(await screen.findByText(/This reset link has expired or was already used/)).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});

describe("ResetPasswordPage — with a recovery session (normal case)", () => {
  beforeEach(() => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-1", email: "driver@example.com" } } },
    });
  });

  it("rejects a password under 6 characters without calling Supabase", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("New password"), "abc12");
    await user.type(screen.getByLabelText("Confirm new password"), "abc12");
    await user.click(screen.getByRole("button", { name: /Set new password/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must be at least 6 characters.",
    );
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched passwords", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("New password"), "abc123");
    await user.type(screen.getByLabelText("Confirm new password"), "different123");
    await user.click(screen.getByRole("button", { name: /Set new password/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passwords don't match.");
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password, shows a confirmation, and redirects to the dashboard", async () => {
    const user = userEvent.setup();
    supabase.auth.updateUser.mockResolvedValue({ data: {}, error: null });

    renderPage();

    await user.type(await screen.findByLabelText("New password"), "newSecurePass123");
    await user.type(screen.getByLabelText("Confirm new password"), "newSecurePass123");
    await user.click(screen.getByRole("button", { name: /Set new password/ }));

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "newSecurePass123" });
    expect(await screen.findByRole("status")).toHaveTextContent("Password updated");
    // The redirect is deliberately delayed (setTimeout in ResetPasswordPage.jsx)
    // so the confirmation is actually readable before navigating away.
    await waitFor(() => expect(screen.getByText("Dashboard placeholder")).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it("shows the password only after the show/hide toggle is clicked, and applies to both fields", async () => {
    const user = userEvent.setup();
    renderPage();

    const newPassword = await screen.findByLabelText("New password");
    const confirmPassword = screen.getByLabelText("Confirm new password");
    expect(newPassword).toHaveAttribute("type", "password");
    expect(confirmPassword).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(newPassword).toHaveAttribute("type", "text");
    expect(confirmPassword).toHaveAttribute("type", "text");
  });

  it("shows a clear error when Supabase rejects the update", async () => {
    const user = userEvent.setup();
    supabase.auth.updateUser.mockResolvedValue({
      data: {},
      error: { message: "Some server-side wording" },
    });

    renderPage();

    await user.type(await screen.findByLabelText("New password"), "newSecurePass123");
    await user.type(screen.getByLabelText("Confirm new password"), "newSecurePass123");
    await user.click(screen.getByRole("button", { name: /Set new password/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong. Please try again.");
  });
});
