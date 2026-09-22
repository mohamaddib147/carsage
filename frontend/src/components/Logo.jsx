// CarSage brand mark (CAR-51): the finalized logo, a single flattened image
// (circular car+brain icon, "CarSage" wordmark and "The Mindful Driver's
// Co-Pilot" tagline, all baked into one picture by design) rather than the
// earlier hand-coded placeholder SVG. Used everywhere the brand mark
// appears: the site header (every screen, via SiteNav) and the Landing
// page's hero and footer.
//
// The asset as delivered (frontend/src/assets/logo-primary.jpeg) is a JPEG
// with no alpha channel — its "transparent" background is actually a
// checkerboard pattern baked into opaque pixels. `mix-blend-mode: multiply`
// (see .logo in index.css) blends that light checkerboard into whatever is
// behind it, so it reads as roughly transparent on both the dark green
// header and the page's light background, without touching the file itself.

import logoPrimary from "../assets/logo-primary.jpeg";

/**
 * The full CarSage brand lockup. `size` is the rendered height in px; width
 * follows the image's own aspect ratio, so it never looks stretched.
 * @param {{ size?: number, className?: string }} props
 * @returns {JSX.Element}
 */
function Logo({ size = 32, className = "" }) {
  return (
    <img
      src={logoPrimary}
      alt="CarSage"
      className={`logo ${className}`}
      style={{ height: size, width: "auto" }}
    />
  );
}

export default Logo;
