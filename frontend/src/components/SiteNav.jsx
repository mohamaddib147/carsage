// Top navigation bar shown on every screen: the CarSage brand mark on
// the left (click to go to the Landing page), the centered links, and one
// auth control on the right. The centered links depend on who is looking:
// signed-out visitors get a simple marketing nav (Features / How it works,
// anchors on the Landing page — no internal app routes), signed-in users
// get the full app menu. The auth control — "Sign Up / Log In" when
// signed out, "Log Out" when signed in, never both (and neither while the
// session is still being restored, so nothing flashes the wrong state).

import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthStatus } from "../auth/AuthContext.jsx";
import Logo from "./Logo.jsx";
import CurrencyToggle from "./CurrencyToggle.jsx";
import { PRICE_PAGES } from "../lib/currency.js";

const CENTER_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/cars/new", label: "Car Onboarding" },
  { to: "/cars/mine", label: "Car Profile" },
  { to: "/trip-planner", label: "Trip Planner" },
  { to: "/advisor", label: "AI Advisor" },
  { to: "/fuel-log", label: "Fuel Log" },
];

// Signed-out nav: anchors on the Landing page (its sections carry these ids).
const MARKETING_LINKS = [
  { hash: "#features", label: "Features" },
  { hash: "#how-it-works", label: "How it works" },
];

/**
 * Renders the top-level navigation bar: brand (left), the centered links
 * (marketing anchors when signed out, app screens when signed in, none
 * while the session loads), and the auth control (right).
 * @returns {JSX.Element}
 */
function SiteNav() {
  const { status, signOut } = useAuthStatus();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The USD | LBP switch only appears on screens that show prices (Trip Planner, Fuel Log).
  const showCurrencyToggle = PRICE_PAGES.includes(pathname.replace(/\/+$/, ""));

  async function handleLogOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <nav className="site-nav">
      <NavLink to="/" end className="site-nav__brand">
        <Logo onDark size={28} />
      </NavLink>

      <ul className="site-nav__links">
        {status === "signedIn" &&
          CENTER_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to}>{link.label}</NavLink>
            </li>
          ))}
        {status === "signedOut" &&
          MARKETING_LINKS.map((link) => (
            <li key={link.hash}>
              {/* Works from any screen: goes to the Landing page and the
                  page scrolls to the section (see LandingPage). */}
              <Link to={{ pathname: "/", hash: link.hash }}>{link.label}</Link>
            </li>
          ))}
      </ul>

      <div className="site-nav__actions">
        {status === "signedOut" && (
          <NavLink to="/login" className="site-nav__auth-link">
            Sign Up / Log In
          </NavLink>
        )}
        {status === "signedIn" && (
          <>
            {showCurrencyToggle && <CurrencyToggle />}
            <button
              type="button"
              className="site-nav__logout"
              onClick={handleLogOut}
            >
              Log Out
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

export default SiteNav;
