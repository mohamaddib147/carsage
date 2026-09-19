// Landing screen — the public marketing page every visitor sees first.
// Layout matches docs/stitch_carsage_landing_page/carsage_modern_marketing_landing_page
// for the in-scope parts (hero, feature highlight cards, reassurance
// strip, closing CTA, footer). Its "Interactive Dashboard Preview" bento
// (odometer, diagnostic health score, tire pressure, battery health) and
// "vehicle history preserved like fine leather" document-vault section
// are OBD-II telemetry and a document vault respectively — both
// explicitly out of scope per CLAUDE.md — and are omitted rather than
// reskinned, since there's no real feature behind them to preview.
// Copy elsewhere is rewritten to only claim what CarSage actually does
// (no invented pricing/trial/diagnostics claims).

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Logo from "../components/Logo.jsx";
import { useAuthStatus } from "../auth/AuthContext.jsx";

const FEATURES = [
  {
    icon: "🚗",
    eyebrow: "Digital Garage",
    title: "Car Profile",
    description:
      "Add your car once — make, model, fuel type, and specs — and CarSage remembers it for every trip you plan.",
    previewLabel: "2020 Toyota Corolla",
    previewMeta: "Gasoline · 12.4 km/L",
  },
  {
    icon: "🧭",
    eyebrow: "Live Route Costing",
    title: "Trip Planner",
    description:
      "Enter a destination and get real-world fuel cost and traffic-adjusted travel time, using live Google Maps data and Lebanon's current fuel prices.",
    previewLabel: "Beirut → Byblos",
    previewMeta: "$4.10 · 38 min · 42 km",
  },
  {
    icon: "💬",
    eyebrow: "Smart Advisor",
    title: "AI Advisor",
    description:
      "Describe a car issue in plain language and get clear guidance on whether it's safe to fix yourself or time to see a mechanic.",
    previewLabel: "“Squeaking brake when cold”",
    previewMeta: "Advice: safe for DIY inspection",
  },
];

const STEPS = [
  {
    title: "Add your car",
    description:
      "Enter its make, model, year and fuel type — CarSage fills in specs like fuel efficiency and tank size where it can.",
  },
  {
    title: "Plan a trip",
    description:
      "Type a destination and get the estimated fuel cost, distance and traffic-adjusted travel time.",
  },
  {
    title: "Ask the advisor",
    description:
      "Describe a car issue in plain language and get a DIY-or-mechanic recommendation with short guidance steps.",
  },
];

const PILLARS = [
  {
    icon: "🧾",
    title: "Transparent Estimates",
    description:
      "Every fuel cost estimate uses live Google Maps routing and Lebanon's official weekly fuel prices — no guesswork, no hidden markup.",
  },
  {
    icon: "💬",
    title: "Zero Jargon",
    description:
      "Straightforward, plain-language answers. Understand what your car needs without needing an engineering degree.",
  },
  {
    icon: "🔒",
    title: "Privacy First",
    description:
      "Your cars and trips are yours alone — every record is protected by row-level security scoped to your account.",
  },
];

/**
 * Landing screen: hero, feature highlights, a reassurance strip, a
 * closing call-to-action, and a footer. The primary CTA adapts to
 * whether a visitor is signed in, using the same useAuthStatus() check as
 * the header: "Get Started Free" -> Sign Up when signed out, "Go to
 * Dashboard" -> Dashboard when signed in, and no CTA while the session is
 * still loading (so a signed-in visitor never sees a sign-up button flash).
 * @returns {JSX.Element}
 */
function LandingPage() {
  const { status } = useAuthStatus();
  const { hash } = useLocation();

  // The header's "Features" / "How it works" links (and the hero button)
  // navigate to a #hash; scroll the matching section into view, including
  // when arriving from another screen. Optional-called because jsdom (tests)
  // has no scrollIntoView.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ behavior: "smooth" });
  }, [hash]);

  const primaryCta = {
    signedIn: { to: "/dashboard", label: "Go to Dashboard" },
    signedOut: { to: "/signup", label: "Get Started Free" },
    loading: null,
  }[status];

  return (
    <div className="landing-page">
      {/* Visually hidden — gives the page an accessible top-level heading
          without duplicating the large hero headline below. */}
      <h1 className="sr-only">CarSage</h1>

      <section className="landing-hero">
        <div className="landing-hero__glow" aria-hidden="true" />
        <Logo size={40} className="landing-hero__logo" />
        <div className="landing-eyebrow">
          <span aria-hidden="true">✦</span>
          <span>The Mindful Driver&apos;s Co-Pilot</span>
        </div>
        <p className="landing-hero__headline">
          Everything about your car, in one place
        </p>
        <p className="landing-hero__subtitle">
          From trip budgets to unexpected engine noises, CarSage simplifies
          car ownership so you can drive with peace of mind.
        </p>
        <div className="landing-hero__cta-row">
          {primaryCta && (
            <Link className="btn-primary" to={primaryCta.to}>
              {primaryCta.label} <span aria-hidden="true">→</span>
            </Link>
          )}
          <Link className="btn-secondary" to={{ hash: "#how-it-works" }}>
            See how it works <span aria-hidden="true">↓</span>
          </Link>
        </div>
        <div className="landing-trust-row">
          <span>✓ Completely free</span>
          <span>✓ No credit card required</span>
          <span>✓ Your data stays private</span>
        </div>
      </section>

      <section className="landing-features" id="features">
        <div className="landing-section-header">
          <p className="landing-section-header__eyebrow">Designed for clarity</p>
          <h2>Thoughtful tools for smarter ownership</h2>
          <p>No technical clutter — just clear answers when you need them.</p>
        </div>
        <div className="landing-feature-grid">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="landing-feature-card">
              <div className="landing-feature-card__icon" aria-hidden="true">
                {feature.icon}
              </div>
              <span className="landing-feature-card__eyebrow">
                {feature.eyebrow}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <div className="landing-feature-card__preview">
                <span>{feature.previewLabel}</span>
                <span className="landing-feature-card__preview-meta">
                  {feature.previewMeta}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-steps" id="how-it-works">
        <div className="landing-section-header">
          <p className="landing-section-header__eyebrow">Three simple steps</p>
          <h2>How it works</h2>
        </div>
        <ol className="landing-steps__list">
          {STEPS.map((step, index) => (
            <li key={step.title} className="landing-step">
              <span className="landing-step__number" aria-hidden="true">
                {index + 1}
              </span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-pillars">
        <div className="landing-pillars__grid">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="landing-pillar">
              <span className="landing-pillar__icon" aria-hidden="true">
                {pillar.icon}
              </span>
              <div>
                <h4>{pillar.title}</h4>
                <p>{pillar.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-closing-cta">
        <span className="landing-closing-cta__badge">Start your journey today</span>
        <h2>Ready for a calmer driving experience?</h2>
        <p>
          Join drivers who plan trips and manage car issues with total ease
          — completely free.
        </p>
        {primaryCta && (
          <Link className="btn-accent" to={primaryCta.to}>
            {primaryCta.label}
          </Link>
        )}
      </section>

      <footer className="landing-footer">
        <Logo size={24} />
        <p className="landing-footer__tagline">
          Your everyday car companion — trip planning and AI-powered advice,
          all in one place.
        </p>
        <div className="landing-footer__links">
          <Link to="/terms">Terms of Service</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </div>
        <p className="landing-footer__copyright">
          © {new Date().getFullYear()} CarSage. Built for a calmer commute.
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
