// Fallback screen for any route that doesn't match one of the 7 defined
// screens.

import { Link } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";

/**
 * 404 fallback page.
 * @returns {JSX.Element}
 */
function NotFoundPage() {
  return (
    <PageShell title="Page Not Found" description="That page doesn't exist.">
      <Link to="/">Back to Landing</Link>
    </PageShell>
  );
}

export default NotFoundPage;
