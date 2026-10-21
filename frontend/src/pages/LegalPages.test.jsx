// Tests for the placeholder Terms of Service / Privacy Policy pages and the
// Landing footer links to them: the links exist and point at real routes
// (no dead links), each route renders its own page while logged out, and
// each page offers a way back.

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { CurrencyProvider } from "../currency/CurrencyContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

// A minimal, endlessly-chainable stub for supabase.from(...) — every method
// call returns itself, and it resolves to an empty result whenever awaited,
// so a protected page's own data fetch (cars, advisor_messages, ...) never
// throws here; this file only cares whether the footer renders.
function chainableEmptyResult() {
  const target = () => {};
  const handler = {
    get(_t, prop) {
      if (prop === "then") return (resolve) => resolve({ data: [], error: null });
      return () => new Proxy(target, handler);
    },
  };
  return new Proxy(target, handler);
}

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => chainableEmptyResult()),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

// Wrapped like main.jsx: since CAR-64 the Dashboard shows the USD | LBP switch,
// which needs the currency provider.
function renderAt(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("footer legal links", () => {
  it("shows Terms of Service and Privacy Policy links in the footer", async () => {
    renderAt("/");

    const footer = (await screen.findByText(/Built for a calmer commute/)).closest("footer");
    const terms = footer.querySelector('a[href="/terms"]');
    const privacy = footer.querySelector('a[href="/privacy"]');

    expect(terms).toHaveTextContent("Terms of Service");
    expect(privacy).toHaveTextContent("Privacy Policy");
  });

  // CAR-52: the footer is rendered once in App.jsx (not per page), so it
  // shows up on every screen, not just the Landing page.
  it.each([["/login"], ["/signup"], ["/terms"], ["/privacy"]])(
    "also shows the footer links at %s",
    async (path) => {
      renderAt(path);

      const footer = (await screen.findByText(/Built for a calmer commute/)).closest("footer");
      expect(footer.querySelector('a[href="/terms"]')).toHaveTextContent("Terms of Service");
      expect(footer.querySelector('a[href="/privacy"]')).toHaveTextContent("Privacy Policy");
    },
  );

  it("shows the footer links on a protected screen too, once signed in", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: "user-123", email: "driver@example.com" } } },
    });
    renderAt("/dashboard");

    const footer = (await screen.findByText(/Built for a calmer commute/)).closest("footer");
    expect(footer.querySelector('a[href="/terms"]')).toHaveTextContent("Terms of Service");
    expect(footer.querySelector('a[href="/privacy"]')).toHaveTextContent("Privacy Policy");
  });

  it("navigates from the footer links to the matching pages", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await user.click(await screen.findByRole("link", { name: "Terms of Service" }));
    expect(await screen.findByRole("heading", { name: "Terms of Service" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to Landing" }));
    await user.click(await screen.findByRole("link", { name: "Privacy Policy" }));
    expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument();
  });
});

describe("legal pages", () => {
  it.each([
    ["/terms", "Terms of Service", "Estimates, not guarantees"],
    ["/privacy", "Privacy Policy", "Row-level security"],
  ])("%s renders its page for a logged-out visitor, not the 404", async (path, title, sectionHeading) => {
    renderAt(path);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: sectionHeading })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Not Found" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Back to Landing" }).length).toBeGreaterThan(0);
  });

  it("Terms of Service warns that the AI Advisor isn't professional advice", async () => {
    renderAt("/terms");

    expect(
      await screen.findByText(/not a substitute for a professional mechanical inspection/),
    ).toBeInTheDocument();
  });

  it("Privacy Policy lists the third-party services CarSage calls", async () => {
    renderAt("/privacy");

    expect(await screen.findByText("Supabase")).toBeInTheDocument();
    expect(screen.getByText("Google Maps & Places")).toBeInTheDocument();
    expect(screen.getByText(/NHTSA/)).toBeInTheDocument();
  });

  it("Privacy Policy lists what goes to Gemini (Advisor text, pump and odometer photos), the free-tier terms, and what is stored", async () => {
    renderAt("/privacy");

    expect(await screen.findByRole("heading", { name: "What goes to Google Gemini" })).toBeInTheDocument();
    for (const item of ["AI Advisor", "Fuel pump display photo", "Odometer photo", "Dashboard warning light photo"]) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
    expect(document.body.textContent).toMatch(/Odometer photo\s*\(Fuel Log and Maintenance\)/);
    expect(document.body.textContent).toMatch(/Dashboard warning light photo\s*\(AI Advisor\)/);
    expect(document.body.textContent).toMatch(/A warning light sentence is saved only if you send it/);
    expect(document.body.textContent).not.toMatch(/may be added/);
    expect(screen.getByText(/Later features may add more\. Each will be listed here before it is\s+released/)).toBeInTheDocument();
    expect(screen.getByText(/free \(unpaid\) tier of the Gemini API/)).toBeInTheDocument();
    expect(screen.getByText(/provide, improve and develop its products and services, and human reviewers may read it/)).toBeInTheDocument();
    expect(screen.getByText(/does not store: the photo itself/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Gemini API Additional Terms of Service" })).toHaveAttribute(
      "href",
      "https://ai.google.dev/gemini-api/terms",
    );
  });

  it("Privacy Policy no longer mentions a registration card or its owner name/address", async () => {
    renderAt("/privacy");

    await screen.findByRole("heading", { name: "What goes to Google Gemini" });
    expect(document.body.textContent).not.toMatch(/registration card/i);
    expect(document.body.textContent).not.toMatch(/name and address/i);
  });

  it("Deleting your data matches what the app can delete (no fuel log deletion; a car delete removes its photo file)", async () => {
    renderAt("/privacy");

    await screen.findByRole("heading", { name: "Deleting your data" });
    const text = document.body.textContent;
    expect(text).not.toMatch(/delete individual cars and fuel logs/);
    expect(text).toMatch(/You can.t delete these in the app: individual fuel log entries, saved trips, AI Advisor conversations, or your account/);
    expect(text).toMatch(/permanently deletes that car.s trips, fuel log entries, maintenance items with their history, expenses, and its photo file/);
    expect(text).not.toMatch(/photo file is not removed/);
  });

  it("says attached maintenance and expense photos stay private and never go to Google, and can be removed", async () => {
    renderAt("/privacy");

    await screen.findByRole("heading", { name: "What we store" });
    expect(screen.getByText("Photos you attach to maintenance and expenses stay in your private storage and are never sent to Google.")).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/together with any photos or receipt attached to them/);
    expect(screen.getByText("A photo or receipt you attached")).toBeInTheDocument();
  });

  it("each page carries its own last-updated date (the policy change doesn't move the Terms date)", async () => {
    renderAt("/privacy");
    expect(await screen.findByText("Last updated: 21 October 2026")).toBeInTheDocument();
  });

  it("the Terms of Service date is unchanged", async () => {
    renderAt("/terms");
    expect(await screen.findByText("Last updated: September 2026")).toBeInTheDocument();
  });
});

describe("landing page trust badge", () => {
  it("says the data is never sold, not the broader 'stays private'", async () => {
    renderAt("/");
    expect(await screen.findByText("✓ Your data is never sold")).toBeInTheDocument();
    expect(screen.queryByText(/stays private/)).not.toBeInTheDocument();
  });
});
