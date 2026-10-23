// Dashboard fix: the decorative background emblem (.app-background-texture) is checked on the stylesheet's text (jsdom applies no
// CSS): it must stay very faint, so it never competes with headings and body copy, and stay purely decorative (it can't take clicks
// and sits behind the content). The real contrast figures (8.26:1 behind the Dashboard heading) are in the Dashboard fix report.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/index.css", "utf8");
const declarations = /\.app-background-texture \{([^}]*)\}/.exec(css)?.[1] ?? "";

describe("the background texture", () => {
  it("is very faint: opacity 0.02 or lower (it was 0.035 and read as busy behind the Dashboard heading)", () => {
    const opacity = Number(/opacity:\s*([\d.]+)/.exec(declarations)?.[1]);
    expect(opacity).toBeGreaterThan(0); // still there: it is the site's brand texture
    expect(opacity).toBeLessThanOrEqual(0.02);
  });

  it("stays decorative: no pointer events, behind the content", () => {
    expect(declarations).toMatch(/pointer-events:\s*none/);
    expect(declarations).toMatch(/z-index:\s*-1/);
  });
});
