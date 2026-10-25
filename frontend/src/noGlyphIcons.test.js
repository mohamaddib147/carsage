// CAR-76 guards on how icons are used:
//  1. No emoji, and none of the arrow, check, caret, play or sparkle glyphs the self-hosted fonts do not contain, may be used in the source
//     as an icon (they render in a different fallback font on every device). Use components/icons.jsx instead. Text such as a bullet or a
//     middle dot is fine, and so is any character the brand fonts do contain.
//  2. The entry chunk (the header, the Landing hero, Log In and Sign Up) may import only the four icons budgeted for it. Everything else
//     lives in route chunks or the lazy Landing sections chunk, because the entry chunk has under 1 kB of gzip room left.
// Read from disk (tests run from the frontend folder, like every npm script).

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(jsx?|css)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

// Emoji and pictographs, plus → ↓ ↑ ✓ ✔ ✕ ▾ ▸ ▶ ✦ which Space Grotesk and Manrope lack.
const BANNED = /[\u{1F300}-\u{1FAFF}☀-➿⬀-⯿←↑→↓■-◿⌀-⏿]/u;

describe("no emoji or missing-glyph icons in the source (CAR-76)", () => {
  const files = sourceFiles("src");

  it("found the real source", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files).toContain(join("src", "components", "icons.jsx"));
  });

  it.each(files)("%s has none", (file) => {
    const lines = readFileSync(file, "utf8").split("\n");
    const hits = lines.flatMap((line, i) => (BANNED.test(line) ? [`${i + 1}: ${line.trim().slice(0, 80)}`] : []));
    expect(hits).toEqual([]);
  });
});

describe("the entry chunk imports only its four budgeted icons (CAR-76)", () => {
  // The header, the Landing hero and Log In / Sign Up are built into the entry chunk. icons.jsx is the only icon file they may import,
  // and it must stay at the shared Icon wrapper plus four icons: a module shared by the entry chunk and a lazy chunk is built into the
  // entry chunk whole, so one more export there is one more icon on every first visit (the entry has under 1 kB of gzip room).
  const ENTRY_FILES = ["src/components/SiteNav.jsx", "src/pages/LandingPage.jsx", "src/pages/AuthPage.jsx"];
  const ALLOWED = new Set(["ArrowRight", "Check", "ChevronDown", "Sparkle"]);

  it.each(ENTRY_FILES)("%s imports no icon outside the four, and never iconsMore.jsx", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/iconsMore\.jsx/);
    const imports = [...source.matchAll(/import \{([^}]*)\} from "[^"]*icons\.jsx"/g)].flatMap((m) => m[1].split(",").map((n) => n.trim()).filter(Boolean));
    expect(imports.filter((name) => !ALLOWED.has(name))).toEqual([]);
  });

  it("icons.jsx exports only Icon and those four icons", () => {
    const exported = [...readFileSync("src/components/icons.jsx", "utf8").matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(["ArrowRight", "Check", "ChevronDown", "Icon", "Sparkle"]);
  });

  it("the Landing sections, which hold the other Landing icons, are loaded lazily and not imported statically", () => {
    const page = readFileSync("src/pages/LandingPage.jsx", "utf8");
    expect(page).toMatch(/lazy\(\(\) => import\("\.\/LandingSections\.jsx"\)\)/);
    expect(page).not.toMatch(/^import .*LandingSections/m);
  });
});
