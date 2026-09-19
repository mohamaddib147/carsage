// Top navigation bar shown on every screen: the CarSage brand mark on
// the left (click to go to the Landing page), links to every screen
// centered, and one auth control on the right — "Sign Up / Log In" when
// signed out, "Log Out" when signed in, never both (and neither while the
// session is still being restored, so nothing flashes the wrong state).

import { NavLink, useNavigate } from "react-router-dom";
import { useAuthStatus } from "../auth/AuthContext.jsx";
import Logo from "./Logo.jsx";

const CENTER_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/cars/new", label: "Car Onboarding" },
  { to: "/cars/mine", label: "Car Profile" },
  { to: "/trip-planner", label: "Trip Planner" },
  { to: "/advisor", label: "AI Advisor" },
];

/**
 * Renders the top-level navigation bar: brand (left), screen links
 * (center), and the auth control (right).
 * @returns {JSX.Element}
 */
function SiteNav() {
  const { status, signOut } = useAuthStatus();
  const navigate = useNavigate();

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
        {CENTER_LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to}>{link.label}</NavLink>
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
          <button
            type="button"
            className="site-nav__logout"
            onClick={handleLogOut}
          >
            Log Out
          </button>
        )}
      </div>
    </nav>
  );
}

export default SiteNav;
