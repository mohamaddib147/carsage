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

import { Link } from "react-router-dom";
import Logo from "../components/Logo.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

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
    eyebrow: "Predictive Route Engine",
    title: "Trip Planner",
    description:
      "Enter a destination and get real-world fuel cost and traffic-adjusted travel time, using live Google Maps data and Lebanon's current fuel prices.",
    previewLabel: "Beirut → Byblos",
    previewMeta: "$4.10 · 38 min · 42 km",
  },
  {
    icon: "💬",
    eyebrow: "Triage Intelligence",
    title: "AI Advisor",
    description:
      "Describe a car issue in plain language and get clear guidance on whether it's safe to fix yourself or time to see a mechanic.",
    previewLabel: "“Squeaking brake when cold”",
    previewMeta: "Advice: safe for DIY inspection",
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
 * whether a visitor is already signed in.
 * @returns {JSX.Element}
 */
function LandingPage() {
  const { user } = useAuth();
  const primaryCta = user
    ? { to: "/dashboard", label: "Go to Dashboard" }
    : { to: "/signup", label: "Get Started" };

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
          <Link className="btn-primary" to={primaryCta.to}>
            {primaryCta.label} <span aria-hidden="true">→</span>
          </Link>
          <a className="btn-secondary" href="#features">
            See how it works <span aria-hidden="true">↓</span>
          </a>
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
        <Link className="btn-accent" to={primaryCta.to}>
          {primaryCta.label}
        </Link>
      </section>

      <footer className="landing-footer">
        <Logo size={24} />
        <p className="landing-footer__tagline">
          Your everyday car companion — trip planning and AI-powered advice,
          all in one place.
        </p>
        <p className="landing-footer__copyright">
          © {new Date().getFullYear()} CarSage. Built for a calmer commute.
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
