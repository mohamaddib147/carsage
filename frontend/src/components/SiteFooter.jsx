// Site footer (CAR-52): shown at the bottom of every screen (rendered once
// in App.jsx, outside the route table) so Terms of Service and Privacy
// Policy are reachable from anywhere, not just the Landing page.

import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";

/**
 * The shared footer: brand mark, tagline, Terms/Privacy links, and the
 * copyright line.
 * @returns {JSX.Element}
 */
function SiteFooter() {
  return (
    <footer className="site-footer">
      <Logo size={36} />
      <p className="site-footer__tagline">
        Your everyday car companion: trip planning and AI-powered advice,
        all in one place.
      </p>
      <div className="site-footer__links">
        <Link to="/terms">Terms of Service</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </div>
      <p className="site-footer__copyright">
        © {new Date().getFullYear()} CarSage. Built for a calmer commute.
      </p>
    </footer>
  );
}

export default SiteFooter;
