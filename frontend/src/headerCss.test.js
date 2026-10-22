// CAR-74: the header's width-dependent CSS, which jsdom cannot apply, checked on the stylesheet's text (read with fs from the
// frontend folder, because Vitest turns a stylesheet imported with ?raw into an empty string). The real-browser checks at
// 1280, 1024, 768, 390 and 320 px are in the CAR-74 report; these keep the rules that make them pass from being lost.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");

/** Declarations of the first top-level rule whose selector is exactly `selector`. */
function rule(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(source)?.[1] ?? "";
}

/** The body of the first `@media (<query>) { ... }` block (blocks close with a "}" at the start of a line). */
function media(query) {
  const start = css.indexOf(`@media ${query} {`);
  if (start === -1) return "";
  const end = css.indexOf("\n}", start);
  return css.slice(start, end);
}

/** Declarations of `selector` inside a media block (rules there are indented by two spaces). */
function inMedia(block, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\n  ${escaped} \\{([^}]*)\\}`).exec(block)?.[1] ?? "";
}

const narrow = media("(max-width: 860px)");

describe("wide screens: the desktop bar is untouched (CAR-74)", () => {
  it("never shows the Menu button, and the panel is display: contents (its links stay grid items of the bar)", () => {
    expect(rule(".site-nav__toggle")).toMatch(/display: none/);
    expect(rule(".site-nav__panel")).toMatch(/display: contents/);
  });

  it("keeps the desktop grid: logo | links | actions", () => {
    expect(rule(".site-nav")).toMatch(/grid-template-columns: 1fr auto 1fr/);
    expect(rule(".site-nav__links")).toMatch(/grid-column: 2/);
    expect(rule(".site-nav__actions")).toMatch(/grid-column: 3/);
  });
});

describe("860 px and below: one fixed row with a Menu button (CAR-74)", () => {
  it("the bar is a 64 px flex row that cannot wrap", () => {
    const bar = inMedia(narrow, ".site-nav");
    expect(bar).toMatch(/display: flex/);
    expect(bar).toMatch(/height: 64px/);
    expect(bar).not.toMatch(/flex-wrap: wrap/);
  });

  it("the Menu button and its pending placeholder share one fixed box, so the bar never changes when the session is known", () => {
    const toggle = inMedia(narrow, ".site-nav__toggle");
    expect(toggle).toMatch(/display: inline-flex/);
    expect(toggle).toMatch(/width: 96px/);
    expect(toggle).toMatch(/height: 44px/);
    expect(inMedia(narrow, ".site-nav__toggle--pending")).not.toMatch(/width|height|display/);
  });

  it("the panel drops down over the page (absolute, so it never pushes the layout) and shows only when open", () => {
    const panel = inMedia(narrow, ".site-nav__panel");
    expect(panel).toMatch(/display: none/);
    expect(panel).toMatch(/position: absolute/);
    expect(panel).toMatch(/top: 100%/);
    expect(inMedia(narrow, ".site-nav__panel.is-open")).toMatch(/display: block/);
  });

  it("opens and closes with a transform on the base motion token (180 ms, CAR-75), and instantly under reduced motion", () => {
    expect(inMedia(narrow, ".site-nav__panel")).toMatch(/transition: transform var\(--motion-base\) var\(--ease-out\)/);
    expect(media("(max-width: 860px) and (prefers-reduced-motion: reduce)")).toMatch(/\.site-nav__panel \{\s*transition: none;/);
  });

  it("every row in the panel is at least 44 px tall", () => {
    expect(narrow).toMatch(/\.site-nav__links > li > a,\s*\n\s*\.site-nav__menu-btn \{[^}]*min-height: 44px/);
    expect(inMedia(narrow, ".site-nav__links .site-nav__menu-list a")).toMatch(/min-height: 44px/);
    expect(narrow).toMatch(/\.site-nav__auth-link,\s*\n\s*\.site-nav__logout \{[^}]*min-height: 44px/);
    expect(inMedia(narrow, ".currency-toggle__option")).toMatch(/min-height: 44px/);
  });

  it("My Car opens in place inside the panel, not as a floating card", () => {
    expect(inMedia(narrow, ".site-nav__menu-list")).toMatch(/position: static/);
  });
});

describe("no layout jump while a page loads (CAR-74)", () => {
  it("the loading skeleton is at least a screen tall, so the footer never paints at the top first", () => {
    expect(rule(".route-loading")).toMatch(/min-height: 100vh/);
  });

  // CAR-79 replaced the Dashboard's "Your Cars" list (and its --waiting visibility trick) with the hero and the three
  // lower cards; those reserve their own height (min-height on the tiles and the title block), so no visibility trick
  // is needed. See DashboardPage.data.test.jsx for the reserved-height guards.
});
