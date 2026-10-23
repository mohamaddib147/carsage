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

/** The site's normal palette (index.css's :root), reapplied for an unmapped make or no active car.
 *
 * CAR-69: besides the four colours there are two tokens that exist only so TEXT stays readable:
 *  - --color-accent-text: the accent darkened until it reaches 4.5:1 on the page background,
 *    white cards, the input fill and cream. --color-accent itself is a FILL colour (buttons,
 *    badges, chart bars, icons); several accents are far too light to read as text.
 *  - --color-on-accent: the text colour that goes ON an accent fill (white, graphite or black,
 *    whichever reaches 4.5:1 on that brand's accent).
 * Every value is verified by theme/themeContrast.test.js. */
export const DEFAULT_THEME = {
  "--color-primary": "#00594c",
  "--color-primary-hover": "#00473d",
  "--color-accent": "#c9a24b",
  "--color-accent-text": "#826627",
  "--color-on-accent": "#2b2b2b",
  "--color-background": "#f5f1e8",
};

/**
 * make (lowercased) -> palette. Each palette only overrides the same tokens as
 * DEFAULT_THEME, so it can never leave a partially-themed page.
 */
// Only Ferrari is a red-primary theme — Toyota and Honda are also
// red-logo brands in real life, but three near-identical reds in a row
// read as "everything is just red" rather than as distinct brands, so
// their primary color leans into a different (still brand-plausible)
// tone instead, with a small red accent as the only nod to the real logo.
const BRAND_THEMES = {
  toyota: {
    "--color-primary": "#2f3640",
    "--color-primary-hover": "#1e2229",
    "--color-accent": "#c8102e",
    "--color-accent-text": "#c8102e",
    "--color-on-accent": "#ffffff",
    "--color-background": "#f2f3f4",
  },
  honda: {
    "--color-primary": "#37474f",
    "--color-primary-hover": "#263238",
    "--color-accent": "#e4002b",
    "--color-accent-text": "#d50028",
    "--color-on-accent": "#ffffff",
    "--color-background": "#eff2f3",
  },
  "mercedes-benz": {
    "--color-primary": "#1b1b1b",
    "--color-primary-hover": "#000000",
    "--color-accent": "#00a0dc",
    "--color-accent-text": "#00729c",
    "--color-on-accent": "#2b2b2b",
    "--color-background": "#f0f1f2",
  },
  ferrari: {
    "--color-primary": "#d40000",
    "--color-primary-hover": "#a80000",
    "--color-accent": "#ffd900",
    "--color-accent-text": "#7a6800",
    "--color-on-accent": "#2b2b2b",
    "--color-background": "#fdeded",
  },
  bmw: {
    "--color-primary": "#0066b2",
    "--color-primary-hover": "#004c87",
    "--color-accent": "#6ab2e7",
    "--color-accent-text": "#1b6da9",
    "--color-on-accent": "#2b2b2b",
    "--color-background": "#eaf4fb",
  },
  audi: {
    "--color-primary": "#4a4a4a",
    "--color-primary-hover": "#333333",
    "--color-accent": "#bb0a30",
    "--color-accent-text": "#bb0a30",
    "--color-on-accent": "#ffffff",
    "--color-background": "#f2f2f2",
  },
  volkswagen: {
    "--color-primary": "#001e50",
    "--color-primary-hover": "#00102b",
    "--color-accent": "#00b1eb",
    "--color-accent-text": "#007297",
    "--color-on-accent": "#2b2b2b",
    "--color-background": "#eaf0fb",
  },
  tesla: {
    "--color-primary": "#171a20",
    "--color-primary-hover": "#000000",
    "--color-accent": "#e82127",
    "--color-accent-text": "#d2161b",
    "--color-on-accent": "#000000",
    "--color-background": "#f4f4f4",
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
