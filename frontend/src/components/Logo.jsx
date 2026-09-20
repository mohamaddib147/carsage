// CarSage brand mark (icon + wordmark), matching
// docs/stitch_carsage_landing_page/carsage_logo. The icon's colors are
// fixed (brand SVG); the wordmark inherits CSS color so it reads
// correctly on both light and dark backgrounds via the `onDark` prop.

/**
 * The icon-only mark: a mountain-and-sun glyph in a rounded green badge.
 * On a background that's the same green (e.g. the site header), the
 * badge gets a faint light ring so its edge stays visible — otherwise
 * it disappears into the background.
 * @param {{ size?: number, onDark?: boolean }} props
 * @returns {JSX.Element}
 */
function LogoMark({ size = 32, onDark = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="logo__mark"
    >
      <rect
        width="32"
        height="32"
        rx="10"
        fill="#00594C"
        stroke={onDark ? "rgba(255,255,255,0.35)" : "none"}
        strokeWidth={onDark ? 1 : 0}
      />
      <path
        d="M9 22L16 12L23 22H9Z"
        fill="#C9A24B"
        stroke="#C9A24B"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="18" r="3" fill="#FFFFFF" />
      <path
        d="M10 24C12 21 20 21 22 24"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The full brand lockup: icon + "CarSage" wordmark.
 * @param {{ size?: number, onDark?: boolean, className?: string }} props
 * @returns {JSX.Element}
 */
function Logo({ size = 32, onDark = false, className = "" }) {
  return (
    <span className={`logo ${onDark ? "logo--on-dark" : ""} ${className}`}>
      <LogoMark size={size} onDark={onDark} />
      <span className="logo__wordmark">CarSage</span>
    </span>
  );
}

export default Logo;
export { LogoMark };
