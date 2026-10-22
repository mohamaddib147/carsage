// CAR-75: the motion system, checked on the stylesheet's text (read with fs from the frontend folder, because Vitest turns a stylesheet
// imported with ?raw into an empty string). jsdom cannot run CSS animations, so these guard the rules themselves:
//  - three durations and two easings are the only motion tokens, and every transition and every non-looping animation uses them;
//  - the keyframes are a fixed list: the five looping loading indicators, the fade and the menu rise, and nothing else;
//  - every animation has a reduced-motion rule that turns it off, with a safety net for anything not listed;
//  - money, km, km/L, percentages and advice text are never animated: pages and cards only fade, and nothing there transforms;
//  - hover lifts are at most 2 px; no animation library is installed.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");

/** The stylesheet as a list of { selector, decls, stack } (stack: the at-rules it sits in), plus the @keyframes bodies by name. */
function parse(source) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const keyframes = {};
  let i = 0;
  function block(stack) {
    while (i < text.length) {
      let j = i;
      while (j < text.length && !"{};".includes(text[j])) j++;
      if (j >= text.length) { i = text.length; return; }
      if (text[j] === "}") { i = j + 1; return; }
      if (text[j] === ";") { i = j + 1; continue; }
      const prelude = text.slice(i, j).trim();
      i = j + 1;
      if (prelude.startsWith("@keyframes")) {
        const name = prelude.split(/\s+/)[1];
        const start = i;
        let depth = 1;
        while (depth && i < text.length) { if (text[i] === "{") depth++; else if (text[i] === "}") depth--; i++; }
        keyframes[name] = text.slice(start, i - 1).replace(/\s+/g, " ").trim();
        continue;
      }
      if (prelude.startsWith("@")) { block([...stack, prelude]); continue; }
      const start = i;
      while (i < text.length && text[i] !== "}") i++;
      rules.push({ selector: prelude.replace(/\s+/g, " "), decls: text.slice(start, i).replace(/\s+/g, " ").trim(), stack });
      i++;
    }
  }
  block([]);
  return { rules, keyframes };
}

const { rules, keyframes } = parse(css);
const isReduced = (rule) => rule.stack.some((a) => /prefers-reduced-motion: reduce/.test(a));
const normal = rules.filter((rule) => !isReduced(rule));
const reduced = rules.filter(isReduced);
/** The value of one declaration in a rule, or null. */
const prop = (rule, name) => new RegExp(`(?:^|;|\\s)${name}\\s*:\\s*([^;]+)`).exec(rule.decls)?.[1].trim() ?? null;
/** Splits a comma list at top level (commas inside parentheses stay). */
const topLevel = (value) => {
  const parts = [];
  let depth = 0, current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(current.trim()); current = ""; } else current += ch;
  }
  return [...parts, current.trim()].filter(Boolean);
};

const LOOPS = ["cold-start-spin", "skeleton-shimmer", "screen-loading-slide", "advisor-typing-bounce", "spec-loading-spin"];
const NEW = ["fade-in", "menu-in"];

describe("the motion tokens (CAR-75)", () => {
  const root = rules.filter((rule) => rule.selector === ":root").map((rule) => rule.decls).join(" ");
  const tokens = Object.fromEntries([...root.matchAll(/(--(?:motion|ease)-[a-z-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

  it("defines exactly three durations and two easings", () => {
    expect(tokens).toEqual({
      "--motion-fast": "120ms",
      "--motion-base": "180ms",
      "--motion-slow": "280ms",
      "--ease-out": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "--ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
    });
  });

  it("every transition uses the tokens (no literal duration anywhere)", () => {
    const offenders = [];
    for (const rule of normal) {
      const value = prop(rule, "transition");
      if (!value || value === "none") continue;
      for (const part of topLevel(value)) {
        if (!/var\(--motion-(fast|base|slow)\)/.test(part)) offenders.push(`${rule.selector}: ${part}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every non-looping animation uses the tokens; only the five loading loops are literal and infinite", () => {
    const offenders = [];
    for (const rule of normal) {
      const value = prop(rule, "animation");
      if (!value || value === "none") continue;
      const name = Object.keys(keyframes).find((key) => new RegExp(`(^|\\s)${key}(\\s|$)`).test(value));
      if (/infinite/.test(value)) {
        if (!LOOPS.includes(name)) offenders.push(`${rule.selector}: an infinite animation that is not a loading loop`);
      } else if (!/var\(--motion-(fast|base|slow)\)/.test(value)) {
        offenders.push(`${rule.selector}: ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the only animation delays are the typing dots' offsets and the card stagger (--i x 40 ms)", () => {
    const delays = normal.flatMap((rule) => (prop(rule, "animation-delay") ? [[rule.selector, prop(rule, "animation-delay")]] : []));
    for (const [selector, value] of delays) {
      const ok = /^calc\(var\(--i, 0\) \* 40ms\)$/.test(value) || (/^\.advisor-typing span:nth-child/.test(selector) && /^0?\.\d+s$/.test(value));
      expect(ok, `${selector}: ${value}`).toBe(true);
    }
  });
});

describe("what moves is a fixed list (CAR-75)", () => {
  it("the keyframes are the five loading loops, the fade and the menu rise, and nothing else", () => {
    expect(Object.keys(keyframes).sort()).toEqual([...LOOPS, ...NEW].sort());
  });

  it("the page fade and the card entrance are the fade; the menu is the only thing that rises", () => {
    const users = (name) => normal.filter((rule) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(prop(rule, "animation") ?? "")).map((rule) => rule.selector);
    expect(users("fade-in").sort()).toEqual([":root[data-routed] .app-main > :not(.site-footer):not(.route-loading)", ":root[data-routed] .dashboard-car-card:not(.dashboard-car-card--skeleton)"].sort());
    expect(users("menu-in")).toEqual([".site-nav__menu-list"]);
  });

  it("the page fade skips the footer and the loading skeleton", () => {
    const page = normal.find((rule) => rule.selector.startsWith(":root[data-routed] .app-main >"));
    expect(page.selector).toContain(":not(.site-footer)");
    expect(page.selector).toContain(":not(.route-loading)");
  });

  it("the card entrance staggers 40 ms apart, only the first six cards", () => {
    const card = normal.find((rule) => rule.selector === ":root[data-routed] .dashboard-car-card:not(.dashboard-car-card--skeleton)");
    expect(prop(card, "animation-delay")).toBe("calc(var(--i, 0) * 40ms)");
    expect(readFileSync("src/pages/DashboardPage.jsx", "utf8")).toMatch(/"--i": Math\.min\(index, 5\)/);
  });
});

describe("reduced motion (CAR-75)", () => {
  it("every animation has a rule with the same selector that turns it off", () => {
    const missing = [];
    // A rule may list several selectors; each one must be switched off.
    const switchedOff = new Set(reduced.filter((r) => prop(r, "animation") === "none").flatMap((r) => r.selector.split(/\s*,\s*/)));
    for (const rule of normal) {
      const value = prop(rule, "animation");
      if (!value || value === "none") continue;
      for (const selector of rule.selector.split(/\s*,\s*/)) if (!switchedOff.has(selector)) missing.push(selector);
    }
    expect(missing, `no reduced-motion rule for: ${missing.join(" | ")}`).toEqual([]);
  });

  it("the animations are the eight listed (so a new one cannot slip in without this test seeing it)", () => {
    const animated = normal.filter((rule) => prop(rule, "animation") && prop(rule, "animation") !== "none").map((rule) => rule.selector);
    expect(animated).toHaveLength(8);
  });

  it("every transition is covered: the safety net exists, and the new hover and button transitions are also switched off by name", () => {
    const net = reduced.find((rule) => rule.selector === "*, *::before, *::after");
    expect(net, "the safety-net rule").toBeDefined();
    expect(net.decls).toMatch(/animation-duration: 0\.01ms !important/);
    expect(net.decls).toMatch(/animation-iteration-count: 1 !important/);
    expect(net.decls).toMatch(/transition-duration: 0\.01ms !important/);
    const off = reduced.find((rule) => rule.selector.includes(".dashboard-module-card") && prop(rule, "transition") === "none");
    expect(off.selector).toContain(".btn-primary");
    expect(off.selector).toContain(".landing-feature-card");
  });

  it("the lifts do not happen under reduced motion", () => {
    const lift = reduced.find((rule) => /:hover/.test(rule.selector) && prop(rule, "transform") === "none");
    expect(lift.selector).toContain(".dashboard-module-card:focus-visible");
    expect(lift.selector).toContain(".landing-feature-card:hover");
  });
});

describe("money, km, km/L, percentages and advice are never animated beyond a fade (CAR-75)", () => {
  const NUMBERS = /price|stat-tile|dashboard-costs|trip-result|advisor-bubble|fix-rate|diy-|maintenance-badge|dashboard-maintenance/i;

  it("no rule for a price, stat, cost, trip result, advice bubble or status badge animates or transitions", () => {
    const offenders = normal.filter((rule) => NUMBERS.test(rule.selector)).filter((rule) => {
      const animation = prop(rule, "animation");
      const transition = prop(rule, "transition");
      return (animation && animation !== "none") || (transition && transition !== "none");
    });
    expect(offenders.map((rule) => rule.selector)).toEqual([]);
  });

  it("the fade keyframes change opacity and nothing else, and the page and card rules never set a transform", () => {
    expect(keyframes["fade-in"]).toBe("from { opacity: 0; }");
    for (const rule of normal.filter((r) => r.selector.startsWith(":root[data-routed] .app-main >") || r.selector.startsWith(":root[data-routed] .dashboard-car-card:not"))) {
      expect(rule.decls).not.toMatch(/transform|translate/);
    }
  });

  it("the menu rise is the only keyframe with a movement, and it belongs to the menu", () => {
    expect(keyframes["menu-in"]).toMatch(/translate: 0 -4px/);
    // (The looping loading indicators may move: they are the loading state itself, and each has a static form under reduced motion.)
    expect(keyframes["fade-in"]).not.toMatch(/translate/);
  });
});

describe("hover lifts and dependencies (CAR-75)", () => {
  it("every hover or focus lift is at most 2 px", () => {
    const lifts = normal.filter((rule) => /:hover|:focus-visible/.test(rule.selector) && /translateY\(/.test(rule.decls));
    expect(lifts.length).toBeGreaterThan(0);
    for (const rule of lifts) {
      for (const [, px] of rule.decls.matchAll(/translateY\((-?\d+(?:\.\d+)?)px\)/g)) expect(Math.abs(Number(px)), rule.selector).toBeLessThanOrEqual(2);
    }
  });

  it("no animation library is installed (motion, framer-motion, gsap, aos, animate.css, lottie)", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(deps.filter((name) => /^(motion|framer-motion|gsap|aos|animate\.css|lottie|react-spring|@react-spring)/.test(name))).toEqual([]);
  });
});
