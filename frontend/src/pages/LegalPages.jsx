// Terms of Service and Privacy Policy pages (route: /terms, /privacy).
// Professional-polish pass (no Jira task): replaces the earlier "coming
// soon" placeholders with real, plain-language content describing what
// CarSage actually does and which third-party services it calls, not a
// substitute for review by a lawyer, but accurate to the running app
// rather than a generic template. LAST_UPDATED is a single source so both
// pages (and a future changelog) stay in sync.

import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";

const LAST_UPDATED = "September 2026";

/**
 * Terms of Service page.
 * @returns {JSX.Element}
 */
export function TermsPage() {
  return (
    <PageShell
      title="Terms of Service"
      description={`Last updated: ${LAST_UPDATED}`}
    >
      <div className="legal-content">
        <p>
          CarSage is a student capstone project, built and run as a demonstration of a
          full-stack car ownership app. By creating an account or using the site, you
          agree to the terms below. If you don&apos;t agree, please don&apos;t use CarSage.
        </p>

        <h2>What CarSage is for</h2>
        <p>
          CarSage lets you save your car&apos;s details, estimate trip fuel cost and
          travel time, log fuel fill-ups, and describe car issues to get general
          DIY-vs-mechanic guidance. It&apos;s built for learning and demonstration, not
          as a commercial or safety-critical product.
        </p>

        <h2>Estimates, not guarantees</h2>
        <p>
          Fuel cost, travel time, and traffic figures in the Trip Planner are
          estimates based on third-party mapping and fuel-price data, and your car&apos;s
          saved fuel efficiency. Actual results will vary with driving conditions,
          fuel prices, and your car&apos;s real-world efficiency.
        </p>

        <h2>AI Advisor is not professional advice</h2>
        <p>
          The AI Advisor gives general, AI-generated guidance based on the issue you
          describe. It is not a substitute for a professional mechanical inspection,
          and CarSage is not responsible for any outcome of following its guidance.
          If a "See a Mechanic" recommendation appears, or a vehicle safety issue is
          involved, have a qualified mechanic inspect the car before doing anything
          yourself.
        </p>

        <h2>Your account</h2>
        <p>
          You&apos;re responsible for the accuracy of the information you enter (your
          cars, trips, and fuel logs) and for keeping your account credentials
          private. You may sign up with an email and password or with Google
          sign-in.
        </p>

        <h2>Acceptable use</h2>
        <p>
          Please don&apos;t use CarSage to submit unlawful, abusive, or harmful content,
          attempt to access another user&apos;s data, or interfere with the service's
          normal operation.
        </p>

        <h2>No warranty</h2>
        <p>
          CarSage is provided "as is," as a student project, without warranties of
          any kind, express or implied, including fitness for a particular purpose
          or uninterrupted availability.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may be updated as the project evolves. Continued use after a
          change means you accept the update.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms can be sent to the project&apos;s maintainer via
          the contact details on the{" "}
          <a href="https://github.com/mohamaddib147/carsage" target="_blank" rel="noopener noreferrer">
            project&apos;s GitHub page
          </a>
          .
        </p>

        <Link to="/">Back to Landing</Link>
      </div>
    </PageShell>
  );
}

/**
 * Privacy Policy page.
 * @returns {JSX.Element}
 */
export function PrivacyPage() {
  return (
    <PageShell
      title="Privacy Policy"
      description={`Last updated: ${LAST_UPDATED}`}
    >
      <div className="legal-content">
        <p>
          CarSage is a student capstone project. This page explains what data it
          collects, why, and how it&apos;s protected.
        </p>

        <h2>What we store</h2>
        <p>
          When you create an account, CarSage stores your email address and the
          data you add yourself: your cars and their specs, trip searches, fuel
          fill-up logs, and your AI Advisor conversations. We don&apos;t ask for or
          store payment information, and we don&apos;t sell your data to anyone.
        </p>

        <h2>Row-level security</h2>
        <p>
          Every record you create is protected by database row-level security, so
          only your own signed-in account can read or change it, not other users,
          and not CarSage staff through the normal app.
        </p>

        <h2>Signing in</h2>
        <p>
          You can sign in with an email and password, or with Google sign-in. With
          Google, CarSage receives only your name, email address, and profile
          picture from Google, and never your Google password.
        </p>

        <h2>Third-party services we call</h2>
        <p>To provide its features, CarSage sends limited data to these services:</p>
        <ul>
          <li>
            <strong>Supabase</strong>: hosts our database and handles authentication.
          </li>
          <li>
            <strong>Google Maps &amp; Places</strong>: used in the Trip Planner for
            address suggestions, route distance, and traffic-aware travel time.
          </li>
          <li>
            <strong>NHTSA (U.S. National Highway Traffic Safety Administration)</strong>:
            public vehicle recall and complaint data, used to inform AI Advisor
            guidance for U.S.-market vehicles.
          </li>
          <li>
            <strong>Google Gemini and Groq</strong>: the AI models used to classify a
            described car issue and generate AI Advisor guidance. The issue
            description you type is sent to whichever of these is available.
          </li>
          <li>
            <strong>YouTube Data API</strong>: used to find a relevant tutorial video
            for a DIY-fixable issue.
          </li>
          <li>
            <strong>API Ninjas</strong>: public vehicle specification data, used to
            auto-fill fields like engine type when adding a car.
          </li>
        </ul>
        <p>
          None of these services receive your email, password, or account identity,
          only the specific trip, car, or issue text needed for that one request.
        </p>

        <h2>Cookies and local storage</h2>
        <p>
          CarSage uses your browser&apos;s local storage to keep you signed in between
          visits and to remember small preferences (like your currency choice). It
          doesn&apos;t use third-party advertising or tracking cookies.
        </p>

        <h2>Deleting your data</h2>
        <p>
          You can delete individual cars and fuel logs yourself from within the app.
          To delete your entire account and all associated data, contact the
          project maintainer using the details on the{" "}
          <a href="https://github.com/mohamaddib147/carsage" target="_blank" rel="noopener noreferrer">
            project&apos;s GitHub page
          </a>
          .
        </p>

        <h2>Changes</h2>
        <p>
          This policy may be updated as the project evolves. Material changes will
          be reflected by updating the date at the top of this page.
        </p>

        <Link to="/">Back to Landing</Link>
      </div>
    </PageShell>
  );
}
