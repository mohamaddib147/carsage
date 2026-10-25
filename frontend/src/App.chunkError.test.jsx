// Tests the whole app when a screen's code fails to download (CAR-67
// follow-up). The Not Found screen's module is mocked so that importing it
// fails, which is exactly what a lazy import() does after a new deploy removed
// the old files. The header and footer must stay, the visitor must see a clear
// message with a Reload button, and another screen must still open.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
import { supabase } from "./lib/supabaseClient.js";

vi.mock("./lib/supabaseClient.js", () => ({
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

// Importing this screen fails, like a chunk that no longer exists on the server.
// (Vitest wraps this error in its own message, so the boundary shows its generic
// wording here; the exact "failed download" wording is covered in
// ScreenErrorBoundary.test.jsx with a real rejected lazyScreen.)
vi.mock("./pages/NotFoundPage.jsx", () => {
  throw new Error("Failed to fetch dynamically imported module: /assets/NotFoundPage-abc.js");
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

function renderAtPath(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider><CurrencyProvider>
        <App />
      </CurrencyProvider></AuthProvider>
    </MemoryRouter>,
  );
}

describe("App: a screen that fails to download", () => {
  it("shows a clear message and a Reload button instead of a blank page, and keeps the header and footer", async () => {
    renderAtPath("/this-route-does-not-exist");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/This page could not load|Something went wrong/);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Terms of Service" })).toBeInTheDocument();
  });

  it("other screens still open from there, without a reload (the error clears when the path changes)", async () => {
    const user = userEvent.setup();
    renderAtPath("/this-route-does-not-exist");
    await screen.findByRole("alert");

    // The footer's Terms link is a router link to another (working) screen.
    await user.click(screen.getByRole("link", { name: "Terms of Service" }));

    expect(await screen.findByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
