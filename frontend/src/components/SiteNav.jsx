// Top navigation bar shown on every screen: the CarSage brand mark on
// the left (click to go to the Landing page), the centered links, and one
// auth control on the right. The centered links depend on who is looking:
// signed-out visitors get a simple marketing nav (Features / How it works,
// anchors on the Landing page — no internal app routes), signed-in users
// get the full app menu (CAR-62: Dashboard, a "Manage car" menu holding the active car's page,
// Fuel Log, Maintenance, Expenses (CAR-64) and Add a car, Trip Planner, AI Advisor). The auth control — "Sign Up / Log In" when
// signed out, "Log Out" when signed in, never both (and neither while the
// session is still being restored, so nothing flashes the wrong state).
//
// CAR-74: at 860 px and below the bar is one fixed 64 px row: the logo and a
// "Menu" button (a same-sized placeholder while the session is restored, so
// nothing jumps). The links and the auth control sit in one panel element: on
// wide screens it is `display: contents`, so the desktop bar is unchanged; on
// narrow ones it drops down under the bar when the button opens it. Escape,
// a click outside, Tab-ing out of it and any navigation close it.
//
// CAR-77: the bar is sticky at every width (72 px on desktop, the 64 px row below 861 px) and casts a shadow once the
// page scrolls past 8 px. The screen you are on is marked by a 2 px white bar (a left-edge bar in the mobile panel);
// `scroll-padding-top` on <html> keeps anchors and anything that takes focus clear of the sticky bar. There is still
// no account menu: Log Out stays a plain button and the email is never shown.

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthStatus } from "../auth/AuthContext.jsx";
import { useActiveCar } from "../theme/ActiveCarContext.jsx";
import Logo from "./Logo.jsx";
import CurrencyToggle from "./CurrencyToggle.jsx";
import { PRICE_PAGES } from "../lib/currency.js";
import { ChevronDown } from "./icons.jsx";

// CAR-62: the per-car screens sit under one menu so the bar stays at four items (and
// doesn't wrap on phones) as Maintenance and, later, Expenses are added. Adding a car is
// occasional, so it lives here too; the Dashboard keeps its own "Add Another Car" button.
// Dashboard fix: the menu is "Manage car" (it is not a car switcher; the Dashboard pills are),
// and its first entry opens the ACTIVE car's page.

/**
 * The "Manage car" menu's links.
 * @param {string | null} activeCarId - the active car's id, or null when there is none yet (no car, or the list is
 *   still loading); the first entry then falls back to /cars/mine, which opens the default car.
 * @returns {{ to: string, label: string }[]}
 */
function manageCarLinks(activeCarId) {
  return [
    { to: activeCarId ? `/cars/${encodeURIComponent(activeCarId)}` : "/cars/mine", label: "Car Profile" },
    { to: "/fuel-log", label: "Fuel Log" },
    { to: "/maintenance", label: "Maintenance" },
    { to: "/expenses", label: "Expenses" },
    { to: "/cars/new", label: "Add a car" },
  ];
}

const CENTER_LINKS = [
  { to: "/dashboard", label: "Dashboard" },
  { menu: "Manage car" },
  { to: "/trip-planner", label: "Trip Planner" },
  { to: "/advisor", label: "AI Advisor" },
];

/** True when the current path is one of the Manage car screens (any car's profile included). */
function isMyCarPath(pathname) {
  return ["/cars/", "/fuel-log", "/maintenance", "/expenses"].some((prefix) => pathname.startsWith(prefix));
}

/**
 * The "Manage car" disclosure menu: a button that shows/hides a list of links. Keyboard:
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
    } else if (event.key === "Escape" && open) {
      // Handled here: the header's mobile panel (CAR-74) must not close too.
      event.preventDefault();
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
        <ChevronDown size={16} className="site-nav__menu-caret" />
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

/** CAR-77: how far the page must scroll before the sticky header casts its shadow. */
const SHADOW_AFTER_PX = 8;

/**
 * Renders the top-level navigation bar: brand (left), the centered links
 * (marketing anchors when signed out, app screens when signed in, none
 * while the session loads), and the auth control (right).
 * @returns {JSX.Element}
 */
function SiteNav() {
  const { status, signOut } = useAuthStatus();
  const { activeCarId } = useActiveCar();
  const navigate = useNavigate();
  const { pathname, key: locationKey } = useLocation();
  // The USD | LBP switch only appears on screens that show prices (Trip Planner, Fuel Log).
  const showCurrencyToggle = PRICE_PAGES.includes(pathname.replace(/\/+$/, ""));

  // CAR-77: the sticky header casts a shadow once the page has scrolled past 8 px, and none at the very top. A
  // passive listener that only flips a boolean, so a scroll costs nothing but a comparison; the shadow itself is a
  // box-shadow, so showing it never moves the layout.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > SHADOW_AFTER_PX);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  // CAR-74: the narrow-screen panel. Like NavMenu, it is open only on the
  // location it was opened on, so any navigation (a hash link too) closes it.
  const [panelOpenOn, setPanelOpenOn] = useState(null);
  const panelOpen = panelOpenOn === locationKey;
  const navRef = useRef(null);
  const toggleRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!panelOpen) return undefined;
    function handlePointerDown(event) {
      if (navRef.current?.contains(event.target)) return;
      setPanelOpenOn(null);
      // A click on plain page content would drop focus to <body>; send it back
      // to the Menu button instead. A click on a control keeps its focus.
      if (!event.target.closest?.("a, button, input, select, textarea, [tabindex]")) {
        event.preventDefault();
        toggleRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [panelOpen]);

  function togglePanel() {
    if (panelOpen) {
      setPanelOpenOn(null);
      return;
    }
    setPanelOpenOn(locationKey);
    // The panel shows on the next paint; move focus to its first control then,
    // unless it was closed again in the meantime (focus must never go into a hidden panel).
    requestAnimationFrame(() => {
      if (panelRef.current?.classList.contains("is-open")) panelRef.current.querySelector("a, button")?.focus();
    });
  }

  function handleNavKeyDown(event) {
    if (event.key === "Escape" && panelOpen && !event.defaultPrevented) {
      event.preventDefault();
      setPanelOpenOn(null);
      toggleRef.current?.focus();
    }
  }

  // Tab-ing out of the bar (past the last item in the panel) closes the panel.
  function handleNavBlur(event) {
    if (panelOpen && !navRef.current?.contains(event.relatedTarget)) setPanelOpenOn(null);
  }

  async function handleLogOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <nav
      className={`site-nav${scrolled ? " is-scrolled" : ""}`}
      ref={navRef}
      onKeyDown={handleNavKeyDown}
      onBlur={handleNavBlur}
    >
      <NavLink to="/" end className="site-nav__brand" aria-label="CarSage home">
        <Logo onDark size={48} />
      </NavLink>

      {status === "loading" ? (
        // Same size as the button, so the bar never changes when the session is known.
        <span className="site-nav__toggle site-nav__toggle--pending" aria-hidden="true" />
      ) : (
        <button
          ref={toggleRef}
          type="button"
          className="site-nav__toggle"
          aria-expanded={panelOpen}
          aria-controls="site-nav-panel"
          onClick={togglePanel}
        >
          <span className="site-nav__toggle-icon" aria-hidden="true" />
          Menu
        </button>
      )}

      <div id="site-nav-panel" ref={panelRef} className={`site-nav__panel${panelOpen ? " is-open" : ""}`}>
        <ul className="site-nav__links">
          {status === "signedIn" &&
            CENTER_LINKS.map((link) =>
              link.menu ? (
                <li key={link.menu}>
                  <NavMenu label={link.menu} links={manageCarLinks(activeCarId)} />
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
      </div>
    </nav>
  );
}

export default SiteNav;
