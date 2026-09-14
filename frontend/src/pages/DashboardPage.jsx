// Dashboard / Home screen — logged-in user's landing page, links out to
// their cars and the two core features.

import PageShell from "../components/PageShell.jsx";

/**
 * Placeholder for the Dashboard / Home screen.
 * @returns {JSX.Element}
 */
function DashboardPage() {
  return (
    <PageShell
      title="Dashboard"
      description="Overview of the user's cars and quick access to Trip Planner and AI Advisor."
    />
  );
}

export default DashboardPage;
