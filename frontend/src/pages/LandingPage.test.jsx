// Tests for the Landing screen: the accessible page heading, the three
// feature cards, and that the primary CTAs read "Get Started Free" (-> Sign
// Up) when logged out, "Go to Dashboard" (-> Dashboard) when logged in, and
// are absent while the session is still loading. The Supabase client is
// mocked so no real network calls happen.

import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LandingPage from "./LandingPage.jsx";
import { AuthProvider } from "../auth/AuthContext.jsx";
import { supabase } from "../lib/supabaseClient.js";

const LOGGED_IN_USER = { id: "user-123", email: "driver@example.com" };

vi.mock("../lib/supabaseClient.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

function renderPage(path = "/") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LandingPage", () => {
  it("renders an accessible 'CarSage' page heading and the hero headline (normal case)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    expect(
      screen.getByRole("heading", { name: "CarSage" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Everything about your car, in one place"),
    ).toBeInTheDocument();
  });

  it("shows all three feature cards", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    expect(await screen.findByText("Car Profile")).toBeInTheDocument();
    expect(screen.getByText("Trip Planner")).toBeInTheDocument();
    expect(screen.getByText("AI Advisor")).toBeInTheDocument();
  });

  it("labels the feature cards accurately (no 'predictive' / 'triage' overclaims)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    expect(await screen.findByText("Live Route Costing")).toBeInTheDocument();
    expect(screen.getByText("Smart Advisor")).toBeInTheDocument();
    expect(screen.queryByText("Predictive Route Engine")).not.toBeInTheDocument();
    expect(screen.queryByText("Triage Intelligence")).not.toBeInTheDocument();
    // The rest of each card is unchanged.
    expect(screen.getByText(/real-world fuel cost and traffic-adjusted travel time/)).toBeInTheDocument();
    expect(screen.getByText(/safe to fix yourself or time to see a mechanic/)).toBeInTheDocument();
  });

  it("the AI Advisor sample card shows an issue the advisor really treats as DIY", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    // "Loose gas cap" is confirmed DIY in the CAR-22 live testing; the old
    // "squeaking brake" example is answered with "see a mechanic".
    expect(await screen.findByText("“Loose gas cap”")).toBeInTheDocument();
    expect(screen.getByText("Advice: safe for DIY inspection")).toBeInTheDocument();
    expect(screen.queryByText(/Squeaking brake/)).not.toBeInTheDocument();
  });

  it("logged out: every primary CTA says 'Get Started Free' and links to Sign Up (normal case)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    const ctas = await screen.findAllByRole("link", { name: /Get Started Free/ });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/signup");
    }
    expect(screen.queryByRole("link", { name: /Go to Dashboard/ })).not.toBeInTheDocument();
  });

  it("logged in: every primary CTA says 'Go to Dashboard' and links to the Dashboard (edge case)", async () => {
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: LOGGED_IN_USER } },
    });
    renderPage();

    const ctas = await screen.findAllByRole("link", { name: /Go to Dashboard/ });
    expect(ctas).toHaveLength(2);
    for (const cta of ctas) {
      expect(cta).toHaveAttribute("href", "/dashboard");
    }
    expect(screen.queryByRole("link", { name: /Get Started/ })).not.toBeInTheDocument();
  });

  it("shows no CTA while the session is loading (no wrong-state flash)", () => {
    supabase.auth.getSession.mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.queryByRole("link", { name: /Get Started/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Go to Dashboard/ })).not.toBeInTheDocument();
  });
});

describe("LandingPage sections and anchors", () => {
  beforeEach(() => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
  });

  it("has a Features section and a How it works section (the nav's anchor targets)", async () => {
    renderPage();
    await screen.findByText("Everything about your car, in one place");

    expect(document.getElementById("features")).not.toBeNull();
    const howItWorks = document.getElementById("how-it-works");
    expect(howItWorks).not.toBeNull();
    expect(screen.getByRole("heading", { name: "How it works" })).toBeInTheDocument();
    expect(howItWorks.querySelectorAll("li")).toHaveLength(3);
    for (const title of ["Add your car", "Plan a trip", "Ask the advisor"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it.each([
    ["#features", "features"],
    ["#how-it-works", "how-it-works"],
  ])("scrolls to the %s section when opened with that hash", async (hash, id) => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderPage(`/${hash}`);

      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
      expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById(id));
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it("does not scroll or crash when there is no hash, or the hash matches nothing", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderPage("/#no-such-section");
      await screen.findByText("Everything about your car, in one place");

      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it("points the hero 'See how it works' button at the How it works section", async () => {
    renderPage();

    const button = await screen.findByRole("link", { name: /See how it works/ });
    expect(button).toHaveAttribute("href", "/#how-it-works");
  });
});

describe("LandingPage — logo and background texture (CAR-51)", () => {
  it("shows the CarSage logo in both the hero and the footer", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();
    await screen.findByText("Everything about your car, in one place");

    const logos = screen.getAllByRole("img", { name: "CarSage" });
    expect(logos).toHaveLength(2); // hero + footer
    expect(logos[0]).toHaveClass("landing-hero__logo");
  });

  it("shows the background texture as purely decorative, never announced or mistaken for a second logo", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();
    await screen.findByText("Everything about your car, in one place");

    // aria-hidden + empty alt: invisible to assistive tech, so
    // getByRole("img") above finds only the two real logo images, not this.
    const texture = document.querySelector(".landing-hero__texture");
    expect(texture).toBeInTheDocument();
    expect(texture).toHaveAttribute("aria-hidden", "true");
    expect(texture).toHaveAttribute("alt", "");
    expect(screen.getAllByRole("img", { name: "CarSage" })).toHaveLength(2);
  });
});
