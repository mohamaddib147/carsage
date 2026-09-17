// CarSage brand mark (icon + wordmark), matching
// docs/stitch_carsage_landing_page/carsage_logo. The icon's colors are
// fixed (brand SVG); the wordmark inherits CSS color so it reads
// correctly on both light and dark backgrounds via the `onDark` prop.

/**
 * The icon-only mark: a mountain-and-sun glyph in a rounded green badge.
 * @param {{ size?: number }} props
 * @returns {JSX.Element}
 */
function LogoMark({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className="logo__mark"
    >
      <rect width="32" height="32" rx="10" fill="#00594C" />
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
      <LogoMark size={size} />
      <span className="logo__wordmark">CarSage</span>
    </span>
  );
}

export default Logo;
export { LogoMark };
