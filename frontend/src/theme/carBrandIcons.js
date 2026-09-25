// Real manufacturer logo marks for BrandBadge (CAR-55 follow-up, mentor
// feedback, no Jira task — explicitly requested after the earlier
// generic/stylized badge). Sourced from `simple-icons` (CC0-1.0 licensed
// SVG redraws, https://simpleicons.org), used only as a small icon-size
// badge near a car's own name/details — never as a large background,
// watermark, or decorative element — per the scoping already in CAR-55's
// Jira description. Simple Icons does not carry a Mercedes-Benz mark;
// BrandBadge falls back to the generic colored-circle initial for any
// make (like Mercedes-Benz) that isn't in this table.
import { siAudi, siBmw, siFerrari, siHonda, siTesla, siToyota, siVolkswagen } from "simple-icons";

const BRAND_ICONS = {
  toyota: siToyota,
  honda: siHonda,
  bmw: siBmw,
  ferrari: siFerrari,
  audi: siAudi,
  volkswagen: siVolkswagen,
  tesla: siTesla,
};

/**
 * The simple-icons icon object ({ path, hex, title, ... }) for a make, or
 * null if there isn't one (case/whitespace-insensitive, same normalization
 * as carBrandThemes.getBrandTheme).
 * @param {string | null | undefined} make
 * @returns {{ path: string, hex: string, title: string } | null}
 */
export function getBrandIcon(make) {
  if (!make || typeof make !== "string") return null;
  return BRAND_ICONS[make.trim().toLowerCase()] ?? null;
}
