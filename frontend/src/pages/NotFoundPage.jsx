// Fallback screen for any route that doesn't match one of the 7 defined
// screens. CAR-73: one primary way out that fits who is looking: the
// Dashboard when signed in, the Landing page when signed out. While the
// session is still being restored an invisible stand-in holds the button's
// place, so neither the wrong button nor a jump ever shows.

import { Link } from "react-router-dom";
import { useAuthStatus } from "../auth/AuthContext.jsx";
import PageShell from "../components/PageShell.jsx";

/**
 * 404 fallback page.
 * @returns {JSX.Element}
 */
function NotFoundPage() {
  const { status } = useAuthStatus();
  return (
    <PageShell title="Page Not Found" description="That page doesn't exist.">
      {status === "signedIn" ? (
        <Link className="btn-primary" to="/dashboard">
          Go to Dashboard
        </Link>
      ) : status === "signedOut" ? (
        <Link className="btn-primary" to="/">
          Back to Home
        </Link>
      ) : (
        <span className="btn-primary" aria-hidden="true" style={{ visibility: "hidden" }}>
          Go to Dashboard
        </span>
      )}
    </PageShell>
  );
}

export default NotFoundPage;
