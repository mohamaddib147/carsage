// Brand-identifying badge (CAR-55; CAR-55 follow-up, mentor feedback, no
// Jira task): shows the car manufacturer's real logo mark at a small
// icon size next to a car's name — never as a large background,
// watermark, or decorative element, per the scoping in CAR-55's own Jira
// description. Two sources, checked in order:
//  1. RASTER_LOGOS — a user-supplied logo image file, for a brand
//     simple-icons doesn't carry (currently just Mercedes-Benz).
//  2. carBrandIcons.js — CC0-licensed SVG redraws via simple-icons, for
//     every other mapped make it has (Toyota, Honda, BMW, Ferrari, Audi,
//     Volkswagen, Tesla).
// Falls back to a generic colored-circle initial for a mapped make with
// neither, or renders nothing for an unrecognized/missing make, so it
// never implies a false or missing match.

import mercedesBenzLogo from "../assets/Mercedes-Benz-Logo.png";
import { getBrandTheme, DEFAULT_THEME } from "./carBrandThemes.js";
import { getBrandIcon } from "./carBrandIcons.js";

const RASTER_LOGOS = {
  "mercedes-benz": mercedesBenzLogo,
};

/**
 * A small logo mark (or, without one, a colored initial) for a car brand,
 * or nothing for an unrecognized/missing make.
 * @param {{ make: string | null | undefined, size?: number }} props
 * @returns {JSX.Element | null}
 */
/**
 * True if BrandBadge would actually render something (a raster logo, an
 * icon-library logo, or the colored-initial fallback) for this make —
 * lets a caller (Car Profile's header icon) show its own placeholder
 * only when BrandBadge truly has nothing to show.
 * @param {string | null | undefined} make
 * @returns {boolean}
 */
export function hasBrandBadge(make) {
  if (!make) return false;
  return Boolean(
    RASTER_LOGOS[make.trim().toLowerCase()] ||
      getBrandIcon(make) ||
      getBrandTheme(make) !== DEFAULT_THEME,
  );
}

function BrandBadge({ make, size = 20 }) {
  if (!make) return null;
  const rasterLogo = RASTER_LOGOS[make.trim().toLowerCase()];
  const icon = getBrandIcon(make);
  const theme = getBrandTheme(make);
  if (!rasterLogo && !icon && theme === DEFAULT_THEME) return null;

  if (rasterLogo) {
    return (
      <img
        src={rasterLogo}
        alt={`${make} logo`}
        aria-label={`${make} brand badge`}
        width={size}
        height={size}
        className="brand-badge brand-badge--logo"
        style={{ objectFit: "contain" }}
      />
    );
  }

  if (icon) {
    return (
      <svg
        role="img"
        aria-label={`${make} brand badge`}
        viewBox="0 0 24 24"
        width={size}
        height={size}
        className="brand-badge brand-badge--logo"
      >
        <path d={icon.path} fill={`#${icon.hex}`} />
      </svg>
    );
  }

  return (
    <span
      className="brand-badge"
      style={{ backgroundColor: theme["--color-primary"], width: size, height: size }}
      title={make}
      aria-label={`${make} brand badge`}
    >
      {make.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default BrandBadge;
