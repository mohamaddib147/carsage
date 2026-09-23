// Placeholder Terms of Service and Privacy Policy pages, so the Landing
// footer links go somewhere real instead of being dead or missing. They are
// deliberately minimal ("coming soon" plus a plain-language note that only
// states things CarSage actually does) — not legal documents.

import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";

/**
 * Shared layout for the two placeholder legal pages.
 * @param {{ title: string, children: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
function LegalPlaceholder({ title, children }) {
  return (
    <PageShell title={title} description="Coming soon.">
      <p className="page-shell__description">{children}</p>
      <Link to="/">Back to Landing</Link>
    </PageShell>
  );
}

/**
 * Terms of Service placeholder page (route: /terms).
 * @returns {JSX.Element}
 */
export function TermsPage() {
  return (
    <LegalPlaceholder title="Terms of Service">
      The full Terms of Service are on their way. In the meantime, please note
      that CarSage&apos;s fuel cost and travel time figures are estimates, and
      the AI Advisor gives general guidance, not professional mechanical
      advice.
    </LegalPlaceholder>
  );
}

/**
 * Privacy Policy placeholder page (route: /privacy).
 * @returns {JSX.Element}
 */
export function PrivacyPage() {
  return (
    <LegalPlaceholder title="Privacy Policy">
      The full Privacy Policy is on its way. In the meantime: CarSage stores
      only your account details and the cars and trips you add, and every
      record is protected by row-level security so only your account can
      access it.
    </LegalPlaceholder>
  );
}
