// CAR-82: asset weight guards. public/favicon.svg is downloaded by every first visit for the tab icon; it was 343 kB because two of its four traced paths
// were display="none" (never drawn) and the others carried far more points than a 16 to 48 px icon can show. This keeps it small and intact (the two
// drawn paths, the dark-mode swap, an accessible title), keeps the design-source copy in src/assets identical to it, and fails if an unreferenced
// image is left in src/assets (the files removed in CAR-82 were unreferenced by any import or url()).
// Read from disk (tests run from the frontend folder, like every npm script).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const favicon = readFileSync("public/favicon.svg", "utf8");

describe("public/favicon.svg (CAR-82)", () => {
  it("is 5 kB or less", () => {
    expect(statSync("public/favicon.svg").size).toBeLessThanOrEqual(5000);
  });

  it("is two drawn paths only: no hidden (display none) path left to download", () => {
    const markup = favicon.replace(/<!--[\s\S]*?-->/g, "");
    expect(markup).not.toMatch(/display\s*=\s*"none"/);
    expect(markup.match(/<path\b/g)).toHaveLength(2);
  });

  it("keeps its look: the dark green outline, the gold brain, the 1024 grid and an accessible title", () => {
    expect(favicon).toMatch(/<path class="favicon-outline" fill="#1B5C41"/);
    expect(favicon).toMatch(/<path fill="#C0A25A"/);
    expect(favicon).toMatch(/viewBox="0 0 1024 1024"/);
    expect(favicon).toMatch(/<title id="faviconTitle">CarSage<\/title>/);
    expect(favicon).toMatch(/aria-labelledby="faviconTitle"/);
  });

  it("keeps the dark-mode swap: the outline turns white on a dark browser tab", () => {
    expect(favicon).toMatch(/@media \(prefers-color-scheme: dark\) \{ \.favicon-outline \{ fill: #ffffff; \} \}/);
  });

  it("src/assets/favicon-icon.svg, the design-source copy index.html describes, is byte-identical", () => {
    expect(readFileSync("src/assets/favicon-icon.svg", "utf8")).toBe(favicon);
  });

  it("index.html still points at /favicon.svg as an SVG icon", () => {
    expect(readFileSync("index.html", "utf8")).toMatch(/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
  });
});

describe("no unreferenced image in src/assets (CAR-82)", () => {
  function sourceFiles(dir) {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "assets" ? [] : sourceFiles(path);
      return /\.(jsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
    });
  }
  const code = sourceFiles("src").map((file) => readFileSync(file, "utf8")).join("\n");
  const assets = readdirSync("src/assets").filter((name) => statSync(join("src/assets", name)).isFile());
  // favicon-icon.svg is the design-source copy of public/favicon.svg (asserted identical above), not imported by code.
  const NOT_IMPORTED_ON_PURPOSE = new Set(["favicon-icon.svg"]);

  it("found the real assets", () => {
    expect(assets).toEqual(expect.arrayContaining(["logo.svg", "logo-on-dark.svg", "background-texture-icon.svg", "Mercedes-Benz-Logo.png", "favicon-icon.svg"]));
  });

  it.each(assets)("%s is imported by code or used in a stylesheet (or is the documented favicon copy)", (name) => {
    if (NOT_IMPORTED_ON_PURPOSE.has(name)) return;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(code).toMatch(new RegExp(`(?:from\\s+|import\\s+|url\\()["']?[^"')\\n]*${escaped}`));
  });
});
