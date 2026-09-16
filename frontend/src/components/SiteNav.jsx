// Top navigation bar linking to every screen. Temporary aid for manually
// verifying routing during development; also shows Log In/Sign Up vs Log
// Out depending on auth state.

import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

const NAV_LINKS = [
  { to: "/", label: "Landing" },
  { to: "/login", label: "Sign Up / Log In" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/cars/new", label: "Car Onboarding" },
  { to: "/cars/mine", label: "Car Profile" },
  { to: "/trip-planner", label: "Trip Planner" },
  { to: "/advisor", label: "AI Advisor" },
];

/**
 * Renders the top-level navigation bar used to move between placeholder
 * screens, plus a Log Out action when a user is logged in.
 * @returns {JSX.Element}
 */
function SiteNav() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleLogOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <nav className="site-nav">
      <span className="site-nav__brand">CarSage</span>
      <ul className="site-nav__links">
        {NAV_LINKS.map((link) => (
          <li key={link.to}>
            <NavLink to={link.to} end={link.to === "/"}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
      {user && (
        <button
          type="button"
          className="site-nav__logout"
          onClick={handleLogOut}
        >
          Log Out ({user.email})
        </button>
      )}
    </nav>
  );
}

export default SiteNav;
