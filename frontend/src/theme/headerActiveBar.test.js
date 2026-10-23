// CAR-77: the active-link bar in the header must be seen on every brand. It is white (#ffffff) on the header, which is
// the brand's primary colour, so the bar reaches the WCAG non-text minimum of 3:1 on all nine themes. The accent was
// tried first and fails (Audi 1.35:1, Honda 1.99:1, Toyota 2.07:1, BMW 2.58:1), so this also fails if the stylesheet
// ever goes back to drawing the bar in the accent. Read from disk, like themeContrast.test.js.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, getBrandTheme, RECOGNIZED_MAKES } from "./carBrandThemes.js";

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

const css = readFileSync("src/index.css", "utf8");
const themes = [["default", DEFAULT_THEME], ...RECOGNIZED_MAKES.map((make) => [make, getBrandTheme(make)])];
const BAR = "#ffffff";

describe("the active-link bar on the header (CAR-77)", () => {
  it("covers the default theme and all eight brands", () => {
    expect(themes).toHaveLength(9);
  });

  it.each(themes)("%s: the white bar is at least 3:1 on the header (the brand's primary)", (_name, theme) => {
    expect(contrast(BAR, theme["--color-primary"])).toBeGreaterThanOrEqual(3);
  });

  it("the stylesheet draws the bar in that white, not in the accent (which fails 3:1 on four brands)", () => {
    const bar = /\.site-nav__links > li > a\.active::after,\s*\n\.site-nav__menu-btn\.active::after \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(bar).toContain(`background-color: ${BAR}`);
    expect(bar).not.toMatch(/--color-accent/);
  });

  it("and the accent really would fail, so the choice is not arbitrary", () => {
    const failing = themes.filter(([, theme]) => contrast(theme["--color-accent"], theme["--color-primary"]) < 3);
    expect(failing.length).toBeGreaterThanOrEqual(4);
  });
});
