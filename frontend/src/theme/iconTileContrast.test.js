// CAR-76: an icon sits on a tile tinted with the car's accent (--color-icon-tile = the accent at 16% over white) and is drawn in
// --color-accent-text. For every car theme, and the default, that pair must reach 3:1 (WCAG non-text contrast), and the stylesheet must
// really define the tile that way and give the icon tiles that colour pair. Read from disk, like themeContrast.test.js.

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
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** color-mix(in srgb, fg 16%, white): a straight mix of the sRGB channels, rounded like the browser. */
const tile = (accent) => "#" + rgb(accent).map((c) => Math.round(c * 0.16 + 255 * 0.84).toString(16).padStart(2, "0")).join("");

const css = readFileSync("src/index.css", "utf8");
const themes = [["default", DEFAULT_THEME], ...RECOGNIZED_MAKES.map((make) => [make, getBrandTheme(make)])];

describe("icon tiles (CAR-76)", () => {
  it("covers the default and all eight brand themes", () => {
    expect(themes).toHaveLength(9);
  });

  it.each(themes)("%s: the accent text colour on the 16% accent tile is at least 3:1", (_name, theme) => {
    const ratio = contrast(theme["--color-accent-text"], tile(theme["--color-accent"]));
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  it("the stylesheet defines the tile as the accent at 16% over white, and one stroke weight", () => {
    expect(css).toMatch(/--color-icon-tile: color-mix\(in srgb, var\(--color-accent\) 16%, #ffffff\);/);
    expect(css).toMatch(/--icon-stroke: 1\.75;/);
    expect(css).toMatch(/\.icon \{[^}]*stroke-width: var\(--icon-stroke\)/);
  });

  it("every icon tile uses the tile colour with the accent text colour", () => {
    const block = /(\.scan-card__icon,[^{]*)\{([^}]*)\}/.exec(css);
    expect(block, "the shared icon tile rule").not.toBeNull();
    for (const selector of [".scan-card__icon", ".dashboard-module-card__icon", ".landing-feature-card__icon", ".landing-pillar__icon", ".car-profile__field-icon"]) {
      expect(block[1]).toContain(selector);
    }
    expect(block[2]).toMatch(/background-color: var\(--color-icon-tile\)/);
    expect(block[2]).toMatch(/color: var\(--color-accent-text\)/);
  });
});
