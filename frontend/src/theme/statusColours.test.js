// CAR-81: the status colours (maintenance Overdue, Due soon and OK, and the Advisor's mechanic and DIY chips) are fixed red, amber and green
// that no car theme can change. Before this, "Due soon" took the brand accent, so on Toyota, Honda, Audi and Tesla it was red like "Overdue",
// and on Mercedes, BMW and Volkswagen it was blue. This checks, on the stylesheet and on every theme:
//  - the --status-* tokens exist in :root, and no theme sets any of them (themes only set the six colour tokens they always did);
//  - the badge rules use only those tokens, never the brand accent, primary or on-accent;
//  - text on each badge is at least 4.5:1 (WCAG AA), and the three hues are really red, amber and green;
//  - the pairs are therefore the same on all nine themes, which the table in the test shows theme by theme.
// Read from disk (tests run from the frontend folder, like every npm script).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, getBrandTheme, RECOGNIZED_MAKES } from "./carBrandThemes.js";

const css = readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

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
/** Hue angle (0-360) of a #rrggbb colour. */
function hue(hex) {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const rootDecls = [...css.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1]).join(";");
const token = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(rootDecls)?.[1].trim();
const resolve = (value) => (value.startsWith("var(") ? token(value.slice(4, -1)) : value);

const PAIRS = [
  ["Overdue", "--status-overdue-bg", "--status-overdue-text"],
  ["Due soon", "--status-soon-bg", "--status-soon-text"],
  ["OK", "--status-ok-bg", "--status-ok-text"],
];
const themes = [["default", DEFAULT_THEME], ...RECOGNIZED_MAKES.map((make) => [make, getBrandTheme(make)])];

describe("the status colour tokens (CAR-81)", () => {
  it("are defined in :root: red, amber and green", () => {
    expect(resolve(token("--status-overdue-bg"))).toBe("#b3261e");
    expect(token("--status-soon-bg")).toBe("#f5b400");
    expect(token("--status-ok-bg")).toBe("#1b7a3d");
    const hues = Object.fromEntries(PAIRS.map(([name, bg]) => [name, hue(resolve(token(bg)))]));
    expect(hues["Overdue"]).toBeLessThan(15);
    expect(hues["Due soon"]).toBeGreaterThan(35);
    expect(hues["Due soon"]).toBeLessThan(55);
    expect(hues["OK"]).toBeGreaterThan(110);
    expect(hues["OK"]).toBeLessThan(150);
  });

  it.each(PAIRS)("%s: the badge text is at least 4.5:1 on its colour", (_name, bg, text) => {
    expect(contrast(resolve(token(bg)), resolve(token(text)))).toBeGreaterThanOrEqual(4.5);
  });

  it("no car theme sets any of them (a theme sets only the six tokens it always did)", () => {
    const allowed = Object.keys(DEFAULT_THEME).sort();
    for (const [name, theme] of themes) {
      expect(Object.keys(theme).sort(), name).toEqual(allowed);
      expect(Object.keys(theme).filter((key) => key.startsWith("--status-")), name).toEqual([]);
    }
  });

  it("the badge rules use only the status tokens, never the brand accent, primary or on-accent", () => {
    const rules = [...css.matchAll(/(\.(?:maintenance|advisor)-badge--(?:overdue|due_soon|ok|diy|mechanic))\s*\{([^}]*)\}/g)];
    expect(rules.map((m) => m[1]).sort()).toEqual([".advisor-badge--diy", ".advisor-badge--mechanic", ".maintenance-badge--due_soon", ".maintenance-badge--ok", ".maintenance-badge--overdue"]);
    for (const [, selector, decls] of rules) {
      expect(decls, selector).toMatch(/background-color: var\(--status-(overdue|soon|ok)-bg\)/);
      expect(decls, selector).toMatch(/color: var\(--status-(overdue|soon|ok)-text\)/);
      expect(decls, selector).not.toMatch(/--color-(accent|primary|on-accent)/);
    }
  });

  it("the Advisor chips use the same pairs: DIY fixable is the OK green, See a mechanic the Overdue red", () => {
    const rule = (selector) => new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`).exec(css)[1];
    expect(rule(".advisor-badge--diy")).toContain("var(--status-ok-bg)");
    expect(rule(".advisor-badge--mechanic")).toContain("var(--status-overdue-bg)");
  });
});

describe("the same badge on every theme (CAR-81)", () => {
  // The badge colours come from :root tokens no theme overrides, so each row is identical; the table is the proof for the report.
  const rows = themes.flatMap(([name, theme]) => PAIRS.map(([status, bg, text]) => [name, status, theme["--color-accent"], resolve(token(bg)), resolve(token(text))]));

  it.each(rows)("%s, %s: the brand accent is %s, the badge stays %s with %s text, at least 4.5:1", (_name, _status, _accent, bg, text) => {
    expect(contrast(bg, text)).toBeGreaterThanOrEqual(4.5);
  });

  it("no status badge colour ever equals a brand's accent colour on any theme (so it cannot blend into a brand-coloured page)", () => {
    for (const [name, theme] of themes) {
      for (const [status, bg] of PAIRS) {
        expect(resolve(token(bg)).toLowerCase(), `${name}: ${status}`).not.toBe(theme["--color-accent"].toLowerCase());
      }
    }
  });

  it("Due soon is distinguishable from Overdue (hue gap of at least 25 degrees) whatever the theme's accent is", () => {
    const gap = Math.abs(hue(resolve(token("--status-overdue-bg"))) - hue(token("--status-soon-bg")));
    expect(gap).toBeGreaterThanOrEqual(25);
  });
});

describe("one shared badge component (CAR-81)", () => {
  it("the Dashboard's maintenance list and the Maintenance page both use StatusBadge (no hand-made status badge left)", () => {
    for (const file of ["src/pages/DashboardPage.jsx", "src/pages/MaintenancePage.jsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toMatch(/import StatusBadge from "\.\.\/components\/StatusBadge\.jsx"/);
      expect(source, file).toMatch(/<StatusBadge status=\{status\.status\} \/>/);
      expect(source, file).not.toMatch(/maintenance-badge maintenance-badge--/);
    }
  });

  it("the Advisor chips carry an icon next to their words", () => {
    const source = readFileSync("src/pages/AIAdvisorPage.jsx", "utf8");
    expect(source).toMatch(/<Wrench size=\{12\} \/> : <TriangleAlert size=\{12\} \/>/);
  });
});
