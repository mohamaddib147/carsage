// CarSage brand mark (CAR-51): the finalized logo — a real, transparent SVG
// (circular car+brain icon, "CarSage" wordmark and "The Mindful Driver's
// Co-Pilot" tagline), replacing both the earlier hand-coded placeholder SVG
// and the interim raster (JPEG) version. Used everywhere the brand mark
// appears: the site header (every screen, via SiteNav) and the Landing
// page's hero and footer.
//
// Two color variants, since the artwork's outline and wordmark are dark
// green (#114E38): on the site header's own dark green background
// (--color-primary) that's nearly invisible, so `onDark` swaps in
// logo-on-dark.svg — the same artwork with the outline/text in white
// instead (generated from logo.svg; see that file's own comment). The gold
// brain accent is unchanged in both, since gold already reads on both.

import logo from "../assets/logo.svg";
import logoOnDark from "../assets/logo-on-dark.svg";

/**
 * The full CarSage brand lockup. `size` is the rendered height in px; width
 * follows the image's own aspect ratio, so it never looks stretched.
 * @param {{ size?: number, onDark?: boolean, className?: string }} props
 * @returns {JSX.Element}
 */
function Logo({ size = 32, onDark = false, className = "" }) {
  return (
    <img
      src={onDark ? logoOnDark : logo}
      alt="CarSage"
      className={`logo ${className}`}
      style={{ height: size, width: "auto" }}
    />
  );
}

export default Logo;
