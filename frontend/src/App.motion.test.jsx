// CAR-75: the page fade and the Dashboard card entrance (index.css) are scoped to <html data-routed>, which App.jsx sets on the first
// in-app navigation and never on a fresh page load, so they cannot delay the largest contentful paint (measured: a fade on load
// moved the Landing LCP from 80 ms to 360 ms). jsdom cannot run the animation, so this checks the marker: absent at first, set by the
// first navigation to a different screen, and set before the new screen is painted (a layout effect, so the fade starts at its first frame).

import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.jsx";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { CurrencyProvider } from "./currency/CurrencyContext.jsx";
import { supabase } from "./lib/supabaseClient.js";

vi.mock("./lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  delete document.documentElement.dataset.routed;
});

afterEach(() => {
  delete document.documentElement.dataset.routed;
});

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("the entrance-animation marker on <html> (CAR-75)", () => {
  it("is not set on a fresh load, on any screen", async () => {
    renderAt("/login");
    await screen.findByRole("heading", { name: "Log In" });
    expect(document.documentElement.dataset.routed).toBeUndefined();
  });

  it("is set by the first in-app navigation to another screen, and stays set", async () => {
    const user = userEvent.setup();
    renderAt("/login");
    await screen.findByRole("heading", { name: "Log In" });

    await user.click(screen.getAllByRole("link", { name: "Sign Up" })[0]);

    await waitFor(() => expect(document.documentElement.dataset.routed).toBe("true"));
    await screen.findByRole("heading", { name: "Sign Up" });
    expect(document.documentElement.dataset.routed).toBe("true");
  });

  it("is already set when the new screen first appears (so the fade starts on its first frame, with no flash)", async () => {
    const user = userEvent.setup();
    renderAt("/login");
    await screen.findByRole("heading", { name: "Log In" });

    // Watch for the Sign Up heading to be added to the page and record the marker at that very moment.
    let markerWhenShown = "never shown";
    const observer = new MutationObserver(() => {
      if (document.querySelector(".auth-card__title")?.textContent === "Sign Up" && markerWhenShown === "never shown") {
        markerWhenShown = document.documentElement.dataset.routed ?? "unset";
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    await user.click(screen.getAllByRole("link", { name: "Sign Up" })[0]);
    await screen.findByRole("heading", { name: "Sign Up" });
    observer.disconnect();

    expect(markerWhenShown).toBe("true");
  });

  // jsdom runs effects synchronously, so it cannot tell a layout effect from a normal one by behaviour; in a browser a normal effect
  // would set the marker after the new screen's first paint (a flash of the screen, then the fade). The real-browser check in the
  // CAR-75 report shows the fade running 40 ms after a navigation; this keeps the choice from being undone by accident.
  it("sets the marker in a layout effect (before paint), as the source says", () => {
    const source = readFileSync("src/App.jsx", "utf8");
    expect(source).toMatch(/useLayoutEffect\(\(\) => \{\s*if \(pathname !== firstPathname\.current\) document\.documentElement\.dataset\.routed = "true";/);
  });
});
