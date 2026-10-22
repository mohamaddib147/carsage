// Guards the readability of themed text (CAR-69). Every car brand theme, and the default, changes the
// colours text is drawn in and drawn on, so a palette tweak or a new rule can silently make text
// unreadable on one brand. This fails if any themed text colour drops below 4.5:1 (WCAG AA) on the
// surface it sits on, and it checks the stylesheet itself so the rules that use the tokens stay honest:
//   - --color-accent is for FILLS and icons only, never a text colour;
//   - text on an accent fill uses --color-on-accent;
//   - white text drawn semi-transparent on the primary colour keeps enough contrast (the alpha values are
//     read out of index.css, so changing them there is checked here);
//   - index.css's :root defaults agree with DEFAULT_THEME.
// What it can't see (hover states, one-off colours) is covered by the browser sweep described in CAR-69.
//
// Read from disk (tests run from the frontend folder, like every npm script).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, getBrandTheme, RECOGNIZED_MAKES } from "./carBrandThemes.js";

// ---- contrast maths (WCAG 2.x relative luminance) ---------------------------------------------------------

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Contrast ratio between two #rrggbb colours (1 to 21). */
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** The opaque colour you get from `fg` at opacity `alpha` over `bg`. */
function blend(fg, alpha, bg) {
  return "#" + rgb(fg).map((c, i) => Math.round(c * alpha + rgb(bg)[i] * (1 - alpha)).toString(16).padStart(2, "0")).join("");
}

// ---- the stylesheet, as a list of { selector, decls } ------------------------------------------------------

const css = readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({
  selector: selector.trim().replace(/\s+/g, " "),
  decls: Object.fromEntries(
    body
      .split(";")
      .map((decl) => decl.trim())
      .filter(Boolean)
      .map((decl) => [decl.slice(0, decl.indexOf(":")).trim(), decl.slice(decl.indexOf(":") + 1).trim()]),
  ),
}));
const rule = (selector) => rules.find((r) => r.selector === selector);
const root = rule(":root").decls;

// ---- the surfaces text sits on ----------------------------------------------------------------------------

const WHITE = root["--color-surface"];          // cards, tables, chart card
const INPUT = root["--color-input-bg"];         // form fields, badges
const CREAM = DEFAULT_THEME["--color-background"];
const GRAPHITE = root["--color-text"];
const MUTED = root["--color-text-muted"];
const DANGER = root["--color-danger"];
// .autofill-tag is primary text on a fixed tint of the default green (rgba(0, 89, 76, 0.1)) over a white card.
const AUTOFILL_TINT = blend("#00594c", 0.1, WHITE);

const themes = [["default", DEFAULT_THEME], ...RECOGNIZED_MAKES.map((make) => [make, getBrandTheme(make)])];
const AA = 4.5;
const surfaces = (theme) => [
  ["its page background", theme["--color-background"]],
  ["a white card", WHITE],
  ["the input fill", INPUT],
  ["cream", CREAM],
];

describe("the contrast maths", () => {
  it("matches known WCAG values (so the checks below can be trusted)", () => {
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#c9a24b", "#f5f1e8")).toBeLessThan(AA);   // today's accent as text: the reason for this ticket
  });
});

describe.each(themes)("theme: %s", (name, theme) => {
  it("--color-accent-text reaches 4.5:1 on every surface accent text can sit on", () => {
    for (const [surface, colour] of surfaces(theme)) {
      expect(contrast(theme["--color-accent-text"], colour), `${name} accent text on ${surface}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("--color-on-accent reaches 4.5:1 on the accent fill (buttons, badges, banners)", () => {
    expect(contrast(theme["--color-on-accent"], theme["--color-accent"]), `${name} on-accent text`).toBeGreaterThanOrEqual(AA);
  });

  it("primary-coloured text (headings, links, titles) reaches 4.5:1 on every surface, including the autofill tint", () => {
    for (const [surface, colour] of [...surfaces(theme), ["the autofill tag tint", AUTOFILL_TINT]]) {
      expect(contrast(theme["--color-primary"], colour), `${name} primary text on ${surface}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("white text on the primary fill and its hover colour (buttons, nav, tabs, reply bubbles) reaches 4.5:1", () => {
    expect(contrast("#ffffff", theme["--color-primary"]), `${name} white on primary`).toBeGreaterThanOrEqual(AA);
    expect(contrast("#ffffff", theme["--color-primary-hover"]), `${name} white on primary hover`).toBeGreaterThanOrEqual(AA);
  });

  it("body, muted and error text reach 4.5:1 on the themed page background", () => {
    const bg = theme["--color-background"];
    expect(contrast(GRAPHITE, bg), `${name} body text`).toBeGreaterThanOrEqual(AA);
    expect(contrast(MUTED, bg), `${name} muted text`).toBeGreaterThanOrEqual(AA);
    expect(contrast(DANGER, bg), `${name} error text`).toBeGreaterThanOrEqual(AA);
  });
});

describe("semi-transparent white text on the primary colour", () => {
  // Selectors whose text is white at less than full strength, drawn on the primary colour (or a primary-coloured bubble).
  const opacityRules = [".site-nav__links a", ".site-nav__menu-btn"];
  const rgbaRules = [".landing-closing-cta p", ".advisor-fix-feedback__prompt", ".advisor-fix-feedback__answered"];

  it.each(opacityRules)("%s keeps 4.5:1 on every theme's primary at its opacity", (selector) => {
    const alpha = Number(rule(selector)?.decls.opacity);
    expect(alpha, `${selector} has an opacity`).toBeGreaterThan(0);
    for (const [name, theme] of themes) {
      const primary = theme["--color-primary"];
      expect(contrast(blend("#ffffff", alpha, primary), primary), `${name} ${selector} at opacity ${alpha}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each(rgbaRules)("%s keeps 4.5:1 on every theme's primary at its alpha", (selector) => {
    const match = /rgba\(255, 255, 255, ([\d.]+)\)/.exec(rule(selector)?.decls.color ?? "");
    expect(match, `${selector} sets a white rgba colour`).not.toBeNull();
    const alpha = Number(match[1]);
    for (const [name, theme] of themes) {
      const primary = theme["--color-primary"];
      expect(contrast(blend("#ffffff", alpha, primary), primary), `${name} ${selector} at alpha ${alpha}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("every white-with-alpha text colour in the stylesheet is one of the checked ones (edge case: a new one must be added to this test)", () => {
    const found = rules.filter((r) => /^rgba\(255, 255, 255, [\d.]+\)$/.test(r.decls.color ?? "")).map((r) => r.selector);
    expect(found.sort()).toEqual([...rgbaRules].sort());
  });
});

describe("the stylesheet keeps the accent colour for fills", () => {
  it("no rule uses the accent colour (token or the default gold) as TEXT colour", () => {
    const offenders = rules.filter((r) => /var\(--color-accent\)|#c9a24b/i.test(r.decls.color ?? "")).map((r) => r.selector);
    expect(offenders).toEqual([]);
  });

  it("every rule that fills with the accent and sets a text colour uses --color-on-accent", () => {
    const fills = rules.filter((r) => /var\(--color-accent\)/.test(r.decls["background-color"] ?? r.decls.background ?? "") && r.decls.color);
    // btn-accent, nav auth link, cold-start banner. (The DIY and due-soon badges used to be here; CAR-81 moved them to the fixed
    // --status-* colours, which no theme changes: see statusColours.test.js.)
    expect(fills.length).toBeGreaterThanOrEqual(3);
    for (const r of fills) expect(r.decls.color, r.selector).toBe("var(--color-on-accent)");
  });

  it("the accent-text eyebrow rule uses --color-accent-text", () => {
    expect(rule(".landing-section-header__eyebrow")?.decls.color).toBe("var(--color-accent-text)");
  });

  it("the Advisor 'Change' link, which sits on the dark reply bubble, is white (the accent colour is unreadable there on most brands)", () => {
    expect(rule(".advisor-fix-feedback__change")?.decls.color).toBe("#ffffff");
  });

  it("index.css's :root defaults agree with DEFAULT_THEME (so a missing theme and the CSS never disagree)", () => {
    for (const [token, value] of Object.entries(DEFAULT_THEME)) {
      expect(root[token], token).toBe(value);
    }
  });

  it("every theme defines exactly the same tokens as the default (no partially themed page)", () => {
    const keys = Object.keys(DEFAULT_THEME).sort();
    for (const [name, theme] of themes) expect(Object.keys(theme).sort(), name).toEqual(keys);
  });
});

describe("the Expenses chart legend", () => {
  const source = readFileSync("src/pages/ExpensesPage.jsx", "utf8");

  it("draws its labels in the normal text colour, not the series colour (the accent bar colour fails as text on most themes)", () => {
    expect(source).toMatch(/<Legend formatter=\{legendLabel\} \/>/);
    expect(source).toMatch(/function legendLabel\(value\) \{\s*return <span style=\{\{ color: "var\(--color-text\)" \}\}>\{value\}<\/span>;/);
  });
});
