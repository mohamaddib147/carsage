// Guards the self-hosted brand fonts (CAR-68) at source level: the files and their
// licence are in the repo, @font-face points at them with a relative url (so Vite
// hashes them), index.html preloads the same two files with crossorigin, the
// tokens and heading rule exist, and nothing refers to Google Fonts. What only a
// build can show (hashed names matching between the preload and the CSS) is
// checked by scripts/check-fonts.mjs.
//
// Read from disk (tests run from the frontend folder, like every npm script).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FONT_DIR = "src/assets/fonts";
const MANROPE = "manrope-latin-wght-normal.woff2";
const SPACE_GROTESK = "space-grotesk-latin-wght-normal.woff2";

const read = (path) => readFileSync(path, "utf8");
const fontsCss = read("src/fonts.css");
const indexCss = read("src/index.css");
const tailwindCss = read("src/tailwind.css");
const indexHtml = read("index.html");
const mainJsx = read("src/main.jsx");

/** The @font-face blocks of a stylesheet, as text. */
const fontFaces = fontsCss.match(/@font-face\s*\{[^}]*\}/g) ?? [];
const faceFor = (family) => fontFaces.find((block) => block.includes(`font-family: "${family}";`));

describe("font files and licence", () => {
  it("both variable latin WOFF2 files are in the repo and are real WOFF2 (magic number wOF2)", () => {
    for (const name of [MANROPE, SPACE_GROTESK]) {
      const path = join(FONT_DIR, name);
      expect(existsSync(path), name).toBe(true);
      expect(readFileSync(path).subarray(0, 4).toString("latin1"), name).toBe("wOF2");
    }
  });

  it("there are exactly two font files, and together they stay under 80 kB", () => {
    const fonts = readdirSync(FONT_DIR).filter((name) => name.endsWith(".woff2"));
    expect(fonts.sort()).toEqual([MANROPE, SPACE_GROTESK].sort());
    const total = fonts.reduce((sum, name) => sum + statSync(join(FONT_DIR, name)).size, 0);
    expect(total).toBeLessThan(80_000);
  });

  it("OFL.txt sits next to the fonts and carries both full licences", () => {
    const ofl = read(join(FONT_DIR, "OFL.txt"));
    expect(ofl.match(/SIL OPEN FONT LICENSE Version 1\.1/g)).toHaveLength(2);
    expect(ofl).toMatch(/The Space Grotesk Project Authors/);
    expect(ofl).toMatch(/The Manrope Project Authors/);
    expect(ofl).toContain(SPACE_GROTESK);
    expect(ofl).toContain(MANROPE);
  });
});

describe("@font-face rules (src/fonts.css)", () => {
  it.each([
    ["Manrope", MANROPE, "200 800"],
    ["Space Grotesk", SPACE_GROTESK, "300 700"],
  ])("%s: relative url into src, swap, a weight range, latin unicode-range", (family, file, weights) => {
    const face = faceFor(family);
    expect(face, family).toBeDefined();
    expect(face).toContain(`src: url("./assets/fonts/${file}") format("woff2");`);
    expect(face).toContain("font-display: swap;");
    expect(face).toContain(`font-weight: ${weights};`);
    expect(face).toContain("unicode-range: U+0000-00FF");
  });

  it("each web font has a metric-matched local Arial fallback face (limits layout shift)", () => {
    for (const family of ["Manrope Fallback", "Space Grotesk Fallback"]) {
      const face = faceFor(family);
      expect(face, family).toBeDefined();
      expect(face).toContain('src: local("Arial");');
      for (const descriptor of ["size-adjust", "ascent-override", "descent-override", "line-gap-override"]) {
        expect(face, `${family} ${descriptor}`).toContain(descriptor);
      }
    }
  });

  it("loads nothing from a remote host (edge case: no http(s) url in any @font-face)", () => {
    expect(fontsCss.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/https?:\/\//);
  });
});

describe("tokens and where they are used", () => {
  it("index.css defines both stacks, each ending in the old system fonts, and the body uses the body stack", () => {
    expect(indexCss).toMatch(/--font-body: "Manrope", "Manrope Fallback", system-ui[^;]*sans-serif;/);
    expect(indexCss).toMatch(/--font-heading: "Space Grotesk", "Space Grotesk Fallback", system-ui[^;]*sans-serif;/);
    expect(indexCss).toContain("--font-family-base: var(--font-body);");
    expect(indexCss).toMatch(/body \{[^}]*font-family: var\(--font-family-base\);/);
  });

  it("every heading level and the Landing hero headline use the heading font", () => {
    const rule = /(h1,\s*h2,\s*h3,\s*h4,\s*h5,\s*h6,\s*\.landing-hero__headline)\s*\{([^}]*)\}/.exec(indexCss);
    expect(rule).not.toBeNull();
    expect(rule[2]).toContain("font-family: var(--font-heading);");
  });

  it("Tailwind's font utilities follow the same tokens", () => {
    expect(tailwindCss).toMatch(/@theme inline \{[^}]*--font-sans: var\(--font-body\);[^}]*--font-display: var\(--font-heading\);/);
  });

  it("main.jsx loads fonts.css before index.css", () => {
    expect(mainJsx.indexOf('import "./fonts.css";')).toBeGreaterThan(-1);
    expect(mainJsx.indexOf('import "./fonts.css";')).toBeLessThan(mainJsx.indexOf('import "./index.css";'));
  });
});

describe("preload links in index.html", () => {
  const preloads = (indexHtml.replace(/<!--[\s\S]*?-->/g, "").match(/<link\b[^>]*>/g) ?? []).filter(
    (tag) => /\brel="preload"/.test(tag) && /\bas="font"/.test(tag),
  );

  it("preloads exactly the two brand fonts, as WOFF2, with crossorigin (required, or the preload is ignored)", () => {
    expect(preloads).toHaveLength(2);
    for (const tag of preloads) {
      expect(tag).toMatch(/\stype="font\/woff2"/);
      expect(tag).toMatch(/\scrossorigin(\s|\/|>)/);
    }
  });

  it("each preload points at the same source file an @font-face uses, and that file exists (Vite hashes both to the same name)", () => {
    const hrefs = preloads.map((tag) => /href="([^"]+)"/.exec(tag)[1]).sort();
    expect(hrefs).toEqual([`/src/assets/fonts/${MANROPE}`, `/src/assets/fonts/${SPACE_GROTESK}`].sort());
    for (const href of hrefs) {
      expect(existsSync(href.replace(/^\//, "")), href).toBe(true);
      expect(fontsCss).toContain(`./assets/fonts/${href.split("/").pop()}`);
    }
  });
});

describe("no Google Fonts anywhere (the Privacy Policy lists no font host)", () => {
  /** Every non-test css/js/jsx file under src, plus index.html. */
  function sourceFiles(dir = "src") {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return /\.(css|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
    });
  }

  it("no source file or index.html mentions a Google Fonts host", () => {
    const hits = [...sourceFiles(), "index.html"].filter((path) =>
      /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.google\.com/i.test(read(path)),
    );
    expect(hits).toEqual([]);
  });

  it("the scan really covers the stylesheets and the entry HTML", () => {
    const files = sourceFiles();
    expect(files.some((path) => path.endsWith("fonts.css"))).toBe(true);
    expect(files.some((path) => path.endsWith("index.css"))).toBe(true);
    expect(files.length).toBeGreaterThan(30);
  });
});
