// Car-brand color themes (CAR-55): a small lookup table mapping a
// recognized car make to a brand-inspired palette of CSS custom property
// overrides. An unrecognized make (or no active car) falls back to
// DEFAULT_THEME — the site's normal British Racing Green/cream/gold
// palette (see index.css's :root) — so the theme never breaks or looks
// empty for an unmapped car. Colors here are generic, brand-associated
// hues chosen by hand (e.g. "Ferrari red", "BMW blue") — not sampled or
// copied from any official brand asset — so there's no trademark
// artwork involved, only a color association, same as saying "Ferrari
// red" in conversation.

/** The site's normal palette (index.css's :root), reapplied for an unmapped make or no active car. */
export const DEFAULT_THEME = {
  "--color-primary": "#00594c",
  "--color-primary-hover": "#00473d",
  "--color-accent": "#c9a24b",
  "--color-background": "#f5f1e8",
};

/**
 * make (lowercased) -> palette. Each palette only overrides the same four
 * tokens as DEFAULT_THEME, so it can never leave a partially-themed page.
 */
const BRAND_THEMES = {
  toyota: {
    "--color-primary": "#c8102e",
    "--color-primary-hover": "#970c22",
    "--color-accent": "#1a1a1a",
    "--color-background": "#fbeaec",
  },
  honda: {
    "--color-primary": "#e4002b",
    "--color-primary-hover": "#b40022",
    "--color-accent": "#4d4d4d",
    "--color-background": "#fdecec",
  },
  "mercedes-benz": {
    "--color-primary": "#1b1b1b",
    "--color-primary-hover": "#000000",
    "--color-accent": "#00a0dc",
    "--color-background": "#f0f1f2",
  },
  ferrari: {
    "--color-primary": "#d40000",
    "--color-primary-hover": "#a80000",
    "--color-accent": "#ffd900",
    "--color-background": "#fdeded",
  },
  bmw: {
    "--color-primary": "#0066b2",
    "--color-primary-hover": "#004c87",
    "--color-accent": "#6ab2e7",
    "--color-background": "#eaf4fb",
  },
  audi: {
    "--color-primary": "#333333",
    "--color-primary-hover": "#1a1a1a",
    "--color-accent": "#bb0a30",
    "--color-background": "#f2f2f2",
  },
  volkswagen: {
    "--color-primary": "#001e50",
    "--color-primary-hover": "#00102b",
    "--color-accent": "#00b1eb",
    "--color-background": "#eaf0fb",
  },
  tesla: {
    "--color-primary": "#cc0000",
    "--color-primary-hover": "#990000",
    "--color-accent": "#171a20",
    "--color-background": "#fbeceb",
  },
};

/**
 * The CSS custom property overrides for a car make, or DEFAULT_THEME if
 * the make is missing or not a recognized brand. Matching is
 * case/whitespace-insensitive ("BMW", " bmw ", "Bmw" all match).
 * @param {string | null | undefined} make
 * @returns {typeof DEFAULT_THEME}
 */
export function getBrandTheme(make) {
  if (!make || typeof make !== "string") return DEFAULT_THEME;
  const key = make.trim().toLowerCase();
  return BRAND_THEMES[key] ?? DEFAULT_THEME;
}

/** The recognized brand names, in lookup-table order (for tests/docs). */
export const RECOGNIZED_MAKES = Object.keys(BRAND_THEMES);
