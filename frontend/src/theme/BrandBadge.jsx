// Brand-identifying badge (CAR-55; CAR-55 follow-up, mentor feedback, no
// Jira task): shows the car manufacturer's real logo mark (from
// carBrandIcons.js, CC0-licensed redraws via simple-icons) at a small
// icon size next to a car's name — never as a large background,
// watermark, or decorative element, per the scoping in CAR-55's own Jira
// description. Falls back to a generic colored-circle initial for a make
// simple-icons doesn't carry (e.g. Mercedes-Benz) or that isn't a
// recognized brand at all, so it never implies a false or missing match.

import { getBrandTheme, DEFAULT_THEME } from "./carBrandThemes.js";
import { getBrandIcon } from "./carBrandIcons.js";

/**
 * A small logo mark (or, without one, a colored initial) for a car brand,
 * or nothing for an unrecognized/missing make.
 * @param {{ make: string | null | undefined, size?: number }} props
 * @returns {JSX.Element | null}
 */
function BrandBadge({ make, size = 20 }) {
  if (!make) return null;
  const icon = getBrandIcon(make);
  const theme = getBrandTheme(make);
  if (!icon && theme === DEFAULT_THEME) return null;

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
