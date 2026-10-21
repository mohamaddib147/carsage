// Font guard (CAR-68): after `vite build`, checks that the brand fonts are wired
// up the way they must be, and exits non-zero if not:
//   1. index.html preloads exactly the fonts the CSS declares: every
//      <link rel="preload" as="font"> href equals a woff2 url() in an @font-face
//      in the built CSS, and the other way round (so a rename or a hash change
//      can't leave a preload pointing at a file that no longer exists, which would
//      waste a request and download the font twice);
//   2. every preload has crossorigin and type="font/woff2" (without crossorigin
//      the browser ignores a font preload);
//   3. the files exist in the build, under assets/ (so public/_headers caches them),
//      with a content hash in their names;
//   4. at most two woff2 files and at most 80 kB in total;
//   5. nothing in the built HTML, CSS or JS refers to Google Fonts.
// Run: node scripts/check-fonts.mjs [buildDir]   (buildDir defaults to dist)

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_FILES = 2;
const MAX_BYTES = 80 * 1000;
const GOOGLE_FONT_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.google\.com/i;

const buildDir = process.argv[2] ?? "dist";
const html = readFileSync(join(buildDir, "index.html"), "utf8");
const assetNames = readdirSync(join(buildDir, "assets"));
const problems = [];

// 1 and 2: the preload links
const preloads = [...html.matchAll(/<link\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => /\brel="preload"/.test(tag) && /\bas="font"/.test(tag));
const preloadHrefs = preloads.map((tag) => /\bhref="([^"]+)"/.exec(tag)?.[1]);
for (const tag of preloads) {
  const href = /\bhref="([^"]+)"/.exec(tag)?.[1] ?? "(none)";
  if (!/\scrossorigin(\s|=|\/|>)/.test(tag)) problems.push(`preload ${href} has no crossorigin attribute`);
  if (!/\btype="font\/woff2"/.test(tag)) problems.push(`preload ${href} is not type="font/woff2"`);
}

// The @font-face urls, from every built stylesheet.
const cssFiles = assetNames.filter((name) => name.endsWith(".css"));
const fontFaceUrls = new Set();
for (const name of cssFiles) {
  const css = readFileSync(join(buildDir, "assets", name), "utf8");
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    for (const url of block.matchAll(/url\(\s*["']?([^"')]+\.woff2)["']?\s*\)/g)) fontFaceUrls.add(url[1]);
  }
}

if (fontFaceUrls.size === 0) problems.push("no woff2 @font-face url() found in the built CSS");
if (preloadHrefs.length === 0) problems.push("index.html preloads no fonts");
for (const href of preloadHrefs) {
  if (!fontFaceUrls.has(href)) problems.push(`preload ${href} matches no @font-face url() in the built CSS`);
}
for (const url of fontFaceUrls) {
  if (!preloadHrefs.includes(url)) problems.push(`@font-face url ${url} is not preloaded in index.html`);
}

// 3 and 4: the files themselves
let totalBytes = 0;
for (const url of fontFaceUrls) {
  const file = join(buildDir, url.replace(/^\//, ""));
  if (!url.startsWith("/assets/")) problems.push(`${url} is not under /assets/ (public/_headers only caches /assets/*)`);
  if (!/-[A-Za-z0-9_-]{8}\.woff2$/.test(url)) problems.push(`${url} has no content hash in its name`);
  if (!existsSync(file)) {
    problems.push(`${url} does not exist in the build`);
    continue;
  }
  totalBytes += statSync(file).size;
}
if (fontFaceUrls.size > MAX_FILES) problems.push(`${fontFaceUrls.size} woff2 files, at most ${MAX_FILES} allowed`);
if (totalBytes > MAX_BYTES) problems.push(`fonts total ${totalBytes} bytes, at most ${MAX_BYTES} allowed`);

// 5: no Google Fonts anywhere in what ships
const shipped = ["index.html", ...assetNames.filter((name) => /\.(css|js)$/.test(name)).map((name) => join("assets", name))];
for (const file of shipped) {
  const hit = GOOGLE_FONT_HOSTS.exec(readFileSync(join(buildDir, file), "utf8"));
  if (hit) problems.push(`${file} refers to ${hit[0]}`);
}

console.log(`preloaded: ${preloadHrefs.join(", ") || "(none)"}`);
console.log(`@font-face: ${[...fontFaceUrls].join(", ") || "(none)"}`);
console.log(`fonts: ${fontFaceUrls.size} woff2 files, ${totalBytes} bytes (limits ${MAX_FILES} files, ${MAX_BYTES} bytes)`);
if (problems.length) {
  console.error(`check-fonts FAILED:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("check-fonts OK");
