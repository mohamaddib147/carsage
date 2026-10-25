// Tests the "slow screen" indicator through the whole app (CAR-67 follow-up).
// The Not Found screen's module is mocked to take about 700 ms to load, like a
// screen on a slow connection. Nothing shows at first (no flash for quick loads);
// after about 300 ms a bar and aria-busy on <main> appear, and both go away when
// the screen arrives.

import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
import { supabase } from "./lib/supabaseClient.js";

// Read from disk: Vitest turns a stylesheet imported with ?raw into an empty string.
// Tests run from the frontend folder, like every npm script.
const indexCss = readFileSync("src/index.css", "utf8");

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

vi.mock("./pages/NotFoundPage.jsx", async () => {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return { default: () => <h1>Page Not Found</h1> };
});

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
});

describe("App: indicator while a slow screen loads", () => {
  it("shows nothing at first, then a bar and aria-busy after about 300 ms, and clears when the screen arrives", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/this-route-does-not-exist"]}>
        <AuthProvider><CurrencyProvider>
          <App />
        </CurrencyProvider></AuthProvider>
      </MemoryRouter>,
    );
    const main = container.querySelector("main");

    // Right away: the skeleton is up, but no indicator yet (a quick load would never show one).
    expect(container.querySelector(".screen-loading-bar")).not.toBeInTheDocument();
    expect(main).toHaveAttribute("aria-busy", "false");

    // After the threshold: the bar, a polite status line, and aria-busy.
    await waitFor(() => expect(container.querySelector(".screen-loading-bar")).toBeInTheDocument(), { timeout: 600 });
    expect(main).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("status").map((status) => status.textContent)).toContain("Loading page...");

    // Once the screen has arrived, both go away.
    expect(await screen.findByRole("heading", { name: "Page Not Found" }, { timeout: 2000 })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector(".screen-loading-bar")).not.toBeInTheDocument());
    expect(main).toHaveAttribute("aria-busy", "false");
  });
});

describe("loading bar CSS", () => {
  it("is static under prefers-reduced-motion: no sliding, but still visible", () => {
    const reducedMotionBlocks = indexCss.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? [];
    const block = reducedMotionBlocks.find((css) => css.includes(".screen-loading-bar__fill"));
    expect(block).toBeDefined();
    // Half width: the dark track stays visible next to the accent segment on any background.
    expect(block).toMatch(/\.screen-loading-bar__fill \{[^}]*animation: none;[^}]*width: 50%;/);
  });

  it("sits above the page and never takes part in the layout (fixed, non-interactive)", () => {
    const rule = /\.screen-loading-bar \{([^}]*)\}/.exec(indexCss)?.[1] ?? "";
    expect(rule).toContain("position: fixed");
    expect(rule).toContain("pointer-events: none");
  });
});
