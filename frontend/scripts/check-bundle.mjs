// Bundle budget guard (CAR-67): after `vite build`, fails (exit 1) if the
// JS every first visit downloads is over budget, or if Recharts has crept
// back into it. "Initial JS" is the entry chunk plus the chunks index.html
// preloads with it (<link rel="modulepreload">). Sizes use Vite's units
// (1 kB = 1000 bytes) so they match the build log.
// Run: node scripts/check-bundle.mjs [buildDir]   (buildDir defaults to dist)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// Recorded after CAR-67 (entry 456.51 / 129.57, initial 505.51 / 146.92)
// plus 2%. Raise only on purpose, with the reason in the commit message.
// Raised once, after CAR-74 (entry 463.29 / 131.81, initial 512.29 / 149.16): the entry
// budget to 470 / 134. The entry chunk had grown 6.8 kB min / 2.2 kB gzip from real
// behaviour that has to load with the first screen (the theme follows the car, the signed-in
// redirect, the mobile menu), leaving 0.2 kB of gzip room. The ticket limit on the entry
// chunk is 480 / 150, so this stays well inside it. The initial budget is unchanged.
const BUDGET = {
  entry: { minKB: 470, gzipKB: 134 },
  initial: { minKB: 516, gzipKB: 150 },
};

// A class name Recharts writes into the DOM; present in any chunk that bundles it.
const RECHARTS_MARKER = "recharts-wrapper";

const buildDir = process.argv[2] ?? "dist";
const html = readFileSync(join(buildDir, "index.html"), "utf8");
const entryPath = /<script[^>]+type="module"[^>]+src="\/?([^"]+)"/.exec(html)?.[1];
if (!entryPath) {
  console.error(`check-bundle: no module <script> found in ${buildDir}/index.html`);
  process.exit(1);
}
const preloadPaths = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/?([^"]+)"/g)].map((m) => m[1]);

/** Min and gzip size in kB (1000 bytes) of the given build files, and whether any bundles Recharts. */
function measure(paths) {
  const files = paths.map((path) => readFileSync(join(buildDir, path)));
  const bytes = files.reduce((sum, file) => sum + file.length, 0);
  const gzipBytes = files.reduce((sum, file) => sum + gzipSync(file).length, 0);
  const hasRecharts = files.some((file) => file.toString("utf8").includes(RECHARTS_MARKER));
  return { minKB: bytes / 1000, gzipKB: gzipBytes / 1000, hasRecharts };
}

const sizes = { entry: measure([entryPath]), initial: measure([entryPath, ...preloadPaths]) };
const problems = [];
for (const [name, size] of Object.entries(sizes)) {
  const budget = BUDGET[name];
  console.log(
    `${name}: ${size.minKB.toFixed(2)} kB min, ${size.gzipKB.toFixed(2)} kB gzip (budget ${budget.minKB} / ${budget.gzipKB})`,
  );
  if (size.minKB > budget.minKB) problems.push(`${name} min ${size.minKB.toFixed(2)} kB > ${budget.minKB} kB`);
  if (size.gzipKB > budget.gzipKB) problems.push(`${name} gzip ${size.gzipKB.toFixed(2)} kB > ${budget.gzipKB} kB`);
}
if (sizes.initial.hasRecharts) problems.push("Recharts is in the initial JS");

if (problems.length) {
  console.error(`check-bundle FAILED: ${problems.join("; ")}`);
  process.exit(1);
}
console.log("check-bundle OK");
