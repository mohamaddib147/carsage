// Top navigation bar shown on every screen: the CarSage brand mark on
// the left (click to go to the Landing page), the centered links, and one
// auth control on the right. The centered links depend on who is looking:
// signed-out visitors get a simple marketing nav (Features / How it works,
// anchors on the Landing page — no internal app routes), signed-in users
// get the full app menu (CAR-62: Dashboard, a "My Car" menu holding Car Profile,
// Fuel Log, Maintenance and Add a car, Trip Planner, AI Advisor). The auth control — "Sign Up / Log In" when
// signed out, "Log Out" when signed in, never both (and neither while the
// session is still being restored, so nothing flashes the wrong state).

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthStatus } from "../auth/AuthContext.jsx";
import Logo from "./Logo.jsx";
import CurrencyToggle from "./CurrencyToggle.jsx";
import { PRICE_PAGES } from "../lib/currency.js";

// CAR-62: the per-car screens sit under one "My Car" menu so the bar stays at four
// items (and doesn't wrap on phones) as Maintenance and, later, Expenses are added.
// Adding a car is occasional, so it lives here too; the Dashboard keeps its own
// "Add Another Car" button.
const MY_CAR_LINKS = [
  { to: "/cars/mine", label: "Car Profile" },
  { to: "/fuel-log", label: "Fuel Log" },
  { to: "/maintenance", label: "Maintenance" },
  { to: "/cars/new", label: "Add a car" },
];

const CENTER_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { menu: "My Car", links: MY_CAR_LINKS },
  { to: "/trip-planner", label: "Trip Planner" },
  { to: "/advisor", label: "AI Advisor" },
];

/** True when the current path is one of the My Car screens (any car's profile included). */
function isMyCarPath(pathname) {
  return pathname.startsWith("/cars/") || pathname.startsWith("/fuel-log") || pathname.startsWith("/maintenance");
}

/**
 * The "My Car" disclosure menu: a button that shows/hides a list of links. Keyboard:
 * Enter/Space or ArrowDown opens it (ArrowDown also focuses the first link), ArrowUp/
 * ArrowDown/Home/End move between links, Escape closes it and returns focus to the
 * button. It also closes on a click outside, when focus leaves it, and on navigation.
 * The button reads as active on any of its screens.
 * @param {{ label: string, links: { to: string, label: string }[] }} props
 * @returns {JSX.Element}
 */
function NavMenu({ label, links }) {
  const { pathname } = useLocation();
  // The path the menu was opened on: it counts as open only while we're still
  // there, so navigating anywhere closes it without an extra effect.
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === pathname;
  const setOpen = (next) =>
    setOpenOn((current) => {
      const isOpen = current === pathname;
      const wantOpen = typeof next === "function" ? next(isOpen) : next;
      return wantOpen ? pathname : null;
    });
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const menuId = `site-nav-menu-${label.toLowerCase().replace(/\s+/g, "-")}`;

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpenOn(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function menuLinks() {
    return Array.from(containerRef.current?.querySelectorAll(".site-nav__menu-list a") ?? []);
  }

  function focusLink(index) {
    const items = menuLinks();
    if (items.length === 0) return;
    items[(index + items.length) % items.length].focus();
  }

  function handleButtonKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      // The list renders on the next paint; focus its first link then.
      requestAnimationFrame(() => focusLink(0));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  function handleMenuKeyDown(event) {
    const items = menuLinks();
    const current = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusLink(current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusLink(current - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusLink(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusLink(items.length - 1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  }

  function handleBlur(event) {
    if (!containerRef.current?.contains(event.relatedTarget)) setOpen(false);
  }

  const active = isMyCarPath(pathname);
  return (
    <div className="site-nav__menu" ref={containerRef} onBlur={handleBlur}>
      <button
        ref={buttonRef}
        type="button"
        className={`site-nav__menu-btn${active ? " active" : ""}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={handleButtonKeyDown}
      >
        {label}
        <span className="site-nav__menu-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul id={menuId} className="site-nav__menu-list" onKeyDown={handleMenuKeyDown}>
          {links.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} end onClick={() => setOpen(false)}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
        <Logo onDark size={48} />
      </NavLink>

      <ul className="site-nav__links">
        {status === "signedIn" &&
          CENTER_LINKS.map((link) =>
            link.menu ? (
              <li key={link.menu}>
                <NavMenu label={link.menu} links={link.links} />
              </li>
            ) : (
              <li key={link.to}>
                <NavLink to={link.to}>{link.label}</NavLink>
              </li>
            ),
          )}
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
