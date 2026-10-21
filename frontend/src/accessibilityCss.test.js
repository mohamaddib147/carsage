// CAR-72: CSS-level accessibility rules that jsdom cannot compute, checked on the stylesheet's text (read with fs from the
// frontend folder, because Vitest turns a stylesheet imported with ?raw into an empty string):
//  - the cold-start spinner and the Advisor typing dots stop under prefers-reduced-motion but stay visible as static dots;
//  - the Fuel Log scroll region shows a brand-coloured focus ring;
//  - the Car Profile row draws its icon from data-icon (the markup is checked in CarProfilePage.test.jsx).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");

/** The declarations of the first rule for `selector` (exact selector text), outside any @media block. */
function rule(selector, source = css) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`).exec(source)?.[1] ?? "";
}

const reducedMotion = (css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g) ?? []).join("\n");

describe("prefers-reduced-motion (CAR-72)", () => {
  it("both animations exist for everyone else (so these tests mean something)", () => {
    expect(rule(".cold-start-banner__spinner")).toMatch(/animation: cold-start-spin/);
    expect(rule(".advisor-typing span")).toMatch(/animation: advisor-typing-bounce/);
  });

  it("the cold-start spinner stops and becomes three static dots, not nothing", () => {
    const block = /\.cold-start-banner__spinner \{([^}]*)\}/.exec(reducedMotion)?.[1] ?? "";
    expect(block).toMatch(/animation: none/);
    expect(block).toMatch(/border: 0/);
    expect(block).toMatch(/radial-gradient\(circle, var\(--color-on-accent\)/);
    expect(block).toMatch(/width: 18px/);
    expect(block).toMatch(/height: 4px/);
  });

  it("the Advisor typing dots stop and stay as three static dots of rising opacity", () => {
    expect(/\.advisor-typing span \{([^}]*)\}/.exec(reducedMotion)?.[1]).toMatch(/animation: none/);
    const opacity = (n) => /opacity: ([\d.]+)/.exec(new RegExp(`\\.advisor-typing span:nth-child\\(${n}\\) \\{([^}]*)\\}`).exec(reducedMotion)?.[1] ?? "")?.[1];
    expect([opacity(1), opacity(2), opacity(3)]).toEqual(["0.5", "0.75", "1"]);
  });
});

describe("keyboard focus ring on the Fuel Log scroll region (CAR-72)", () => {
  it("is drawn in the theme's primary colour and is thick enough to see", () => {
    const ring = rule(".fuel-log-table-wrap:focus-visible");
    expect(ring).toMatch(/outline: 3px solid var\(--color-primary\)/);
    expect(ring).toMatch(/outline-offset: 2px/);
  });
});

describe("Car Profile spec rows (CAR-72)", () => {
  it("draw the icon box as the row's ::before from data-icon, spanning both lines of the grid", () => {
    const before = rule(".car-profile__field::before");
    expect(before).toMatch(/content: attr\(data-icon\)/);
    expect(before).toMatch(/grid-row: 1 \/ span 2/);
    expect(rule(".car-profile__field")).toMatch(/display: grid/);
    expect(css).not.toContain(".car-profile__field-icon");
  });
});
