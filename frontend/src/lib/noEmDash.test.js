// Copy regression guard (CAR-52): no em-dash ("—") in visible UI text — page
// copy, labels, placeholders, headings. Code comments (// lines and /* */
// blocks, including JSX {/* */}) are exempt, and so are test files
// themselves. A manual sweep found this true today; this test fails if
// someone reintroduces one. Also scans index.html's own text (<title>,
// meta description/OG/Twitter tags) — a real gap found live: those are
// just as user-facing (browser tab, search results, link previews) as
// any JSX copy, but weren't covered by the src/**/*.{js,jsx} glob below.

import { describe, expect, it } from "vitest";

// Every non-test source file under src/, plus index.html, as raw text.
const jsModules = import.meta.glob("/src/**/*.{js,jsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const htmlModules = import.meta.glob("/index.html", {
  query: "?raw",
  import: "default",
  eager: true,
});
const sources = [
  ...Object.entries(jsModules).filter(([path]) => !/\.test\.jsx?$/.test(path)),
  ...Object.entries(htmlModules),
];

const EM_DASH = "—";

/** Blanks out // line comments, /* block comments, and <!-- --> HTML
 * comments (line numbers unaffected either way). */
function stripComments(text) {
  const noBlocks = text.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
  const noLine = noBlocks.replace(/\/\/.*$/gm, "");
  return noLine.replace(/<!--[\s\S]*?-->/g, (match) => match.replace(/[^\n]/g, " "));
}

function offenders() {
  return sources.flatMap(([path, text]) =>
    stripComments(text)
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => line.includes(EM_DASH))
      .map(({ line, number }) => `${path}:${number}: ${line.trim()}`),
  );
}

describe("frontend UI copy has no em-dashes (CAR-52)", () => {
  it("scans the real source files, including index.html", () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some(([path]) => path.endsWith("/pages/CarOnboardingPage.jsx"))).toBe(true);
    expect(sources.some(([path]) => path.endsWith("/index.html"))).toBe(true);
  });

  it("never uses an em-dash outside a code comment", () => {
    expect(offenders()).toEqual([]);
  });

  it("the scanner strips comments rather than just matching line prefixes (regression: multi-line block/JSX comments with no per-line marker)", () => {
    const sample = [
      "const x = 1;",
      "{/* a decorative note that",
      "   continues onto a second line — no leading marker here */}",
      'const y = "real UI text — this should be flagged";',
    ].join("\n");
    const stripped = stripComments(sample);
    expect(stripped).not.toContain(EM_DASH + " no leading marker");
    expect(stripped).toContain("real UI text — this should be flagged");
  });

  it("also strips HTML comments, so a note in index.html doesn't false-positive", () => {
    const sample = [
      "<!-- a decorative note mentioning an em-dash — like this one -->",
      '<title>Real title text — this should be flagged</title>',
    ].join("\n");
    const stripped = stripComments(sample);
    expect(stripped).not.toContain(EM_DASH + " like this one");
    expect(stripped).toContain("Real title text — this should be flagged");
  });
});
