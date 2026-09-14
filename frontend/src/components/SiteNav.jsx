// Top navigation bar linking to every screen. Temporary aid for manually
// verifying routing during development; will be replaced by real
// auth-aware navigation once the Dashboard and auth flows are built.

import { NavLink } from "react-router-dom";

const NAV_LINKS = [
  { to: "/", label: "Landing" },
  { to: "/login", label: "Sign Up / Log In" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/cars/new", label: "Car Onboarding" },
  { to: "/cars/demo-car-id", label: "Car Profile" },
  { to: "/trip-planner", label: "Trip Planner" },
  { to: "/advisor", label: "AI Advisor" },
];

/**
 * Renders the top-level navigation bar used to move between placeholder screens.
 * @returns {JSX.Element}
 */
function SiteNav() {
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
    </nav>
  );
}

export default SiteNav;
