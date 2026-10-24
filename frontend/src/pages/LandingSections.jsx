// Landing sections below the hero (CAR-76): features, steps, trust pillars and the closing call to action.
// Split out of LandingPage.jsx so this part, which holds the Landing feature icons and most of the page's
// copy, loads as its own chunk after the hero is on screen instead of growing the entry chunk
// (Landing and Log In are the screens every first visit needs).
//
// Feature copy (features pass): every feature named here exists in the app today and is described from its screen,
// not from a wish list. The Dashboard is the "Example" card (its description sits under the car's name); the three
// core tools are the big cards; everything else is the compact grid under "Keep on top of it every day". Nothing from
// CLAUDE.md's out-of-scope list is mentioned, and there are no email or push reminders: the app has no reminder job,
// only the due soon and overdue status on the Maintenance and Dashboard screens.

import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "../components/icons.jsx";
import { Camera, Car, Fuel, Lock, MessageCircle, ReceiptText, Route, Tag, Wrench } from "../components/iconsMore.jsx";

const FEATURES = [
  {
    icon: Car,
    eyebrow: "Your car",
    title: "Car Profile",
    description:
      "Add your car once (make, model, fuel type, and specs), and CarSage remembers it for every trip you plan.",
    previewLabel: "2020 Toyota Corolla",
    previewMeta: "Gasoline · 12.4 km/L",
  },
  {
    icon: Route,
    eyebrow: "Trip costs",
    title: "Trip Planner",
    description:
      "Enter a destination and get real-world fuel cost and traffic-adjusted travel time, using live Google Maps data and Lebanon's current fuel prices.",
    previewRoute: ["Beirut", "Byblos"],
    previewMeta: "$4.10 · 38 min · 42 km",
  },
  {
    icon: MessageCircle,
    eyebrow: "Car problems",
    title: "AI Advisor",
    description:
      "Describe a car issue in plain language and get clear guidance on whether it's safe to fix yourself or time to see a mechanic.",
    previewLabel: "“Loose gas cap”",
    previewMeta: "Advice: safe for DIY inspection",
  },
];

// The preview card's figures (CAR-80). Hard-coded and clearly labelled "Example": no live data, no
// account, no telemetry — they mirror the four tiles the real Dashboard shows for a signed-in driver
// (Odometer, Real economy, Last fill-up, Next service). A different car from the Car Profile card's
// sample below it, which sits close enough on a wide screen that the same figures twice reads as a slip.
const EXAMPLE_CAR = "2019 Honda Civic";
const EXAMPLE_TILES = [
  ["Odometer", "84,120 km"],
  ["Fuel economy", "13.1 km/L"],
  ["Last fill-up", "38.0 L"],
  ["Next service", "Oil change in 1,880 km"],
];

// What the Example card above says about the Dashboard (the screen's four tiles and its "This month" costs).
const DASHBOARD_DESCRIPTION = "Your Dashboard shows your active car at a glance, and what you have spent this month.";

// The everyday tools the big cards do not cover. They reuse the trust pillars' icon-and-text layout, so this adds no CSS.
// Each line is taken from the screen it describes: Fuel Log (cost per fill-up and "Your real average" km/L from odometer
// readings), Maintenance (items by km and/or months, with Due soon, Overdue and OK), Expenses (the category list and
// "Total this month", fuel included), and the three photo scans (pump display and odometer on the Fuel Log, a dashboard
// light or visible problem in the AI Advisor). The photo claim repeats the Privacy page: read once, never stored.
const MORE_TOOLS = [
  {
    icon: Fuel,
    title: "Fuel Log",
    description: "Log each fill-up and your odometer to see what you spend and your real km/L.",
  },
  {
    icon: Wrench,
    title: "Maintenance",
    description: "Add service like oil changes, by distance or time, and see what is due soon or overdue.",
  },
  {
    icon: Tag,
    title: "Expenses",
    description: "Log repairs, parking, insurance and other costs, and see what your car costs you each month, fuel included.",
  },
  {
    icon: Camera,
    title: "Photo scans",
    description:
      "Photograph a fuel pump, your odometer or a dashboard warning light and CarSage reads it for you. It is optional; Google's Gemini reads the photo and CarSage does not keep it.",
  },
];

const STEPS = [
  {
    title: "Add your car",
    description:
      "Enter its make, model, year and fuel type, and CarSage fills in specs like fuel efficiency and tank size where it can.",
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
    icon: ReceiptText,
    title: "Transparent Estimates",
    description:
      "Every fuel cost estimate uses live Google Maps routing and Lebanon's official weekly fuel prices. No guesswork, no hidden markup.",
  },
  {
    icon: MessageCircle,
    title: "Plain answers",
    description:
      "Clear answers in everyday words, so you know what your car needs without an engineering degree.",
  },
  {
    icon: Lock,
    title: "Privacy First",
    description:
      "Your cars, trips and costs are visible only to you.",
  },
];

/**
 * The Landing page below the hero. When the visit started on a #hash (the header's "Features" and
 * "How it works" links), the matching section did not exist until this chunk arrived, so it scrolls
 * there once it has mounted.
 * @param {{ primaryCta: { to: string, label: string, closingLabel: string } | null }} props - the hero's call to action;
 *   the closing banner uses the same link with its own `closingLabel`.
 * @returns {JSX.Element}
 */
function LandingSections({ primaryCta }) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView?.({ behavior: "smooth" });
    // Only once, when the sections first appear; later hash changes are handled by LandingPage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <section className="landing-features" id="features">
        <div className="landing-section-header">
          <p className="landing-section-header__eyebrow">What you can do</p>
          <h2>Everything you need for your car</h2>
          <p>Plan trips, track what you spend, and get plain answers about problems.</p>
        </div>
        <div className="landing-feature-grid">
          <section
            className="landing-feature-card landing-feature-card--example"
            aria-label="Example of the CarSage dashboard"
          >
            <span className="landing-feature-card__eyebrow">Example</span>
            <h3>{EXAMPLE_CAR}</h3>
            <p>{DASHBOARD_DESCRIPTION}</p>
            {/* Each tile reuses the inset panel the feature cards already use for their samples. */}
            <dl className="landing-example__tiles">
              {EXAMPLE_TILES.map(([label, value]) => (
                <div key={label} className="landing-feature-card__preview">
                  <dt className="landing-feature-card__preview-meta">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {FEATURES.map((feature) => (
            <div key={feature.title} className="landing-feature-card">
              <div className="landing-feature-card__icon" aria-hidden="true">
                <feature.icon size={24} />
              </div>
              <span className="landing-feature-card__eyebrow">
                {feature.eyebrow}
              </span>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
              <div className="landing-feature-card__preview">
                <span>
                  {feature.previewRoute ? (
                    <>
                      {feature.previewRoute[0]}
                      <span className="sr-only"> to </span>
                      <ArrowRight size={14} className="icon--route" />
                      {feature.previewRoute[1]}
                    </>
                  ) : (
                    feature.previewLabel
                  )}
                </span>
                <span className="landing-feature-card__preview-meta">
                  {feature.previewMeta}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-pillars" aria-label="More tools">
        <div className="landing-section-header">
          <p className="landing-section-header__eyebrow">Every day</p>
          <h2>Keep on top of it every day</h2>
          <p>Fill-ups, service, costs and photos, all in one place.</p>
        </div>
        <div className="landing-pillars__grid landing-pillars__grid--pairs">
          {MORE_TOOLS.map((tool) => (
            <div key={tool.title} className="landing-pillar">
              <span className="landing-pillar__icon" aria-hidden="true">
                <tool.icon size={20} />
              </span>
              <div>
                <h4>{tool.title}</h4>
                <p>{tool.description}</p>
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
                <pillar.icon size={20} />
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
        <span className="landing-closing-cta__badge">Free, no credit card</span>
        <h2>Ready to know your car better?</h2>
        <p>
          Add your car and plan your first trip today. It&apos;s completely free.
        </p>
        {primaryCta && (
          <Link className="btn-accent" to={primaryCta.to}>
            {primaryCta.closingLabel}
          </Link>
        )}
      </section>
    </>
  );
}

export default LandingSections;
