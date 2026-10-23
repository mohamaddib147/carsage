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

import { Suspense, lazy, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import Logo from "../components/Logo.jsx";
import { useAuthStatus } from "../auth/AuthContext.jsx";
import { ArrowRight, Check, Sparkle } from "../components/icons.jsx";

// Everything below the hero is its own chunk (see LandingSections.jsx).
const LandingSections = lazy(() => import("./LandingSections.jsx"));

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
      <section className="landing-hero">
        <div className="landing-hero__glow" aria-hidden="true" />
        {/* The brand name is text beside the icon, not pixels inside the
            artwork, so it is selectable and reads as one word to a screen
            reader (CAR-80). */}
        <p className="landing-hero__brand">
          <Logo size={44} mark />
          CarSage
        </p>
        <div className="landing-eyebrow">
          <Sparkle size={14} />
          <span>The Mindful Driver&apos;s Co-Pilot</span>
        </div>
        {/* The page's only h1 is the headline a visitor actually reads. */}
        <h1 className="landing-hero__headline">
          Everything about your car, <em>in one place</em>
        </h1>
        <p className="landing-hero__subtitle">
          From trip budgets to unexpected engine noises, CarSage simplifies
          car ownership so you can drive with peace of mind.
        </p>
        <div className="landing-hero__cta-row">
          {primaryCta && (
            <Link className="btn-primary" to={primaryCta.to}>
              {primaryCta.label} <ArrowRight size={18} />
            </Link>
          )}
          <Link className="btn-secondary" to={{ hash: "#how-it-works" }}>
            See how it works <ArrowRight size={18} className="icon--turn" />
          </Link>
        </div>
        <div className="landing-trust-row">
          <span>
            <Check size={14} /> Completely free
          </span>
          <span>
            <Check size={14} /> No credit card required
          </span>
          <span>
            <Check size={14} /> Your data is never sold
          </span>
        </div>
      </section>

      <Suspense fallback={<div className="landing-sections-placeholder" aria-hidden="true" />}>
        <LandingSections primaryCta={primaryCta} />
      </Suspense>
    </div>
  );
}

export default LandingPage;
