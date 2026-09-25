// Small brand-identifying badge (CAR-55) shown next to a car's name on
// Car Profile / Dashboard. Deliberately NOT an official manufacturer
// logo: per the Jira task's trademark scoping, this renders a small
// colored circle in the brand's theme color with the make's first
// letter — a generic, stylized identifier, not scraped or downloaded
// trademark artwork. Renders nothing for an unmapped make, so it never
// implies a false brand match.

import { getBrandTheme, DEFAULT_THEME } from "./carBrandThemes.js";

/**
 * A small circular badge in the car brand's theme color with its first
 * letter, or nothing for an unrecognized/missing make.
 * @param {{ make: string | null | undefined }} props
 * @returns {JSX.Element | null}
 */
function BrandBadge({ make }) {
  if (!make) return null;
  const theme = getBrandTheme(make);
  if (theme === DEFAULT_THEME) return null;

  return (
    <span
      className="brand-badge"
      style={{ backgroundColor: theme["--color-primary"] }}
      title={make}
      aria-label={`${make} brand badge`}
    >
      {make.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default BrandBadge;
