// Tests for the Landing screen: the accessible page heading, the three
// feature cards, and that the primary CTAs read "Get Started Free" (-> Sign
// Up) when logged out, "Go to Dashboard" (-> Dashboard) when logged in, and
// are absent while the session is still loading. The Supabase client is
// mocked so no real network calls happen.

import { readFileSync } from "node:fs";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  // CAR-80: the headline a visitor reads is the page's only h1; before, the h1 was a visually
  // hidden "CarSage" and the headline was a <p>. The brand name is now text beside the hero mark.
  it("makes the hero headline the page's h1, with the wordmark as text (normal case)", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();

    const headline = screen.getByRole("heading", { level: 1 });
    expect(headline).toHaveTextContent("Know what your car costs, and what it needs next");
    expect(screen.getByText("CarSage")).toHaveClass("landing-hero__brand");
    expect(screen.queryByRole("heading", { name: "CarSage" })).not.toBeInTheDocument();
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

    expect(await screen.findByText("Trip costs")).toBeInTheDocument();
    expect(screen.getByText("Car problems")).toBeInTheDocument();
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

  // CAR-76: everything below the hero is a lazy chunk (LandingSections), so these wait for it.
  // (React.lazy keeps a loaded module for the rest of the file, so the placeholder can only be checked in the source.)
  it("loads the sections below the hero as a separate chunk, holding their place with a screen-tall placeholder", () => {
    const page = readFileSync("src/pages/LandingPage.jsx", "utf8");
    expect(page).toMatch(/<Suspense fallback=\{<div className="landing-sections-placeholder" aria-hidden="true" \/>\}>/);
    expect(page).not.toContain("landing-features");
    expect(readFileSync("src/index.css", "utf8")).toMatch(/\.landing-sections-placeholder \{\s*min-height: 100vh;/);
  });

  // CAR-80, criterion 2: the preview is clearly an example with hard-coded figures — never a
  // signed-in driver's own data, and nothing CarSage cannot actually measure (no telemetry).
  it("shows a static preview card labelled 'Example' with hard-coded figures", async () => {
    renderPage();

    const preview = await screen.findByRole("region", { name: "Example of the CarSage dashboard" });
    expect(preview).toHaveTextContent("Example");
    for (const text of ["2019 Honda Civic", "Odometer", "84,120 km", "Fuel economy", "13.1 km/L", "Next service"]) {
      expect(preview).toHaveTextContent(text);
    }
    // A different car from the Car Profile card's own sample, which sits right below it.
    expect(preview).not.toHaveTextContent("Toyota Corolla");
    expect(preview).not.toHaveTextContent(/tire pressure|battery health|diagnostic/i);
  });

  // Copy pass: the page used to show 3 of the app's 6 tools. The other three sit in a short list under the cards.
  it("also lists the everyday tools the three feature cards leave out", async () => {
    renderPage();

    const more = await screen.findByRole("region", { name: "More tools" });
    for (const [title, text] of [
      ["Fuel Log", /real km\/L/],
      ["Service reminders", /oil changes/],
      ["Expenses", /repairs, parking, insurance/i],
    ]) {
      expect(within(more).getByRole("heading", { name: title })).toBeInTheDocument();
      expect(within(more).getByText(text)).toBeInTheDocument();
    }
  });

  it("explains itself in everyday words: no developer terms, and it says who it is for", async () => {
    renderPage();

    await screen.findByRole("region", { name: "More tools" });
    const text = document.body.textContent;
    expect(text).toContain("Free car care app for drivers in Lebanon");
    expect(text).not.toMatch(/row-level security|telemetry|predictive|triage|OBD/i);
  });

  it("has a Features section and a How it works section (the nav's anchor targets)", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "How it works" });

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
      await screen.findByText(/Know what your car costs/);

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

describe("LandingPage — logo (CAR-51, CAR-80)", () => {
  it("shows the brand mark in the hero, decorative, with the wordmark as the text beside it", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });
    renderPage();
    await screen.findByText(/Know what your car costs/);

    // CAR-80: the mark is cropped out of the lockup and the name is real text, so the image is
    // decorative (alt="") — otherwise a screen reader would read "CarSage" twice.
    // The footer (with its own logo) moved to App.jsx (CAR-52), rendered once for every screen —
    // see LegalPages.test.jsx for its coverage.
    expect(screen.queryByRole("img", { name: "CarSage" })).not.toBeInTheDocument();
    const mark = document.querySelector(".landing-hero__brand .logo--mark");
    expect(mark).not.toBeNull();
    expect(mark.getAttribute("alt")).toBe("");
  });

  // The crop is what hides the lockup's own wordmark and tagline. Without it the hero would show
  // "CarSage" twice, and jsdom applies no stylesheet, so this is checked on the CSS text.
  it("crops the lockup to its icon in CSS", () => {
    expect(readFileSync("src/index.css", "utf8")).toMatch(
      /\.logo--mark \{\s*aspect-ratio: 373 \/ 344;\s*object-fit: cover;\s*object-position: top;/,
    );
  });

  // The ratio above is measured off logo.svg, so it silently stops cropping if that artwork is
  // re-laid-out — and logo.svg's own header says it is kept in sync by hand with two other files.
  // Nothing else would fail: the hero would just show the lockup's "CarSage" under the icon again.
  // So pin the geometry the ratio assumes. If this fails, re-measure the icon's extent in a browser
  // (the bottom of the paths' bounding boxes) and update .logo--mark's aspect-ratio to 373:<that>.
  it("logo.svg still has the geometry the crop ratio was measured from", () => {
    const svg = readFileSync("src/assets/logo.svg", "utf8");
    expect(svg).toMatch(/viewBox="0 0 373 480"/);
    // The wordmark sits below the icon: its text box starts at y=345, past the 344-row crop.
    expect(svg).toMatch(/<text x="186\.5" y="412"[^>]*font-size="62"/);
    expect(svg).toMatch(/<text x="186\.5" y="448"[^>]*font-size="19"/);
    // Three icon paths above it, and no fourth drawn element that could reach lower.
    expect(svg.match(/<path\b/g)).toHaveLength(3);
    expect(svg.match(/<text\b/g)).toHaveLength(2);
  });
});

// The decorative background texture is rendered once, site-wide, in App.jsx
// rather than per page — see App.test.jsx for its tests.
