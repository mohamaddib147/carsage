// Car Onboarding screen — manual add-a-car form. The "scan registration
// card" button is a disabled placeholder for MVP (OCR is a stretch goal).

import PageShell from "../components/PageShell.jsx";

/**
 * Placeholder for the Car Onboarding screen.
 * @returns {JSX.Element}
 */
function CarOnboardingPage() {
  return (
    <PageShell
      title="Add a Car"
      description="Manual car entry form will go here."
    >
      <button className="btn-accent" type="button" disabled>
        Scan Registration Card (coming soon)
      </button>
    </PageShell>
  );
}

export default CarOnboardingPage;
