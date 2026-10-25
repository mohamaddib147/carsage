// Guards public/_headers (Netlify caching headers). The rule must stay narrow:
// only the hashed files Vite writes to assets/ get a year-long immutable cache.
// index.html and the unhashed files in public/ must never be matched, or a
// deploy would not reach visitors until their cached copy expired.
//
// Read from disk (tests run from the frontend folder, like every npm script).

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const text = readFileSync("public/_headers", "utf8");

// Netlify's format: an unindented line is a path, indented lines below it are its
// headers, and lines starting with # are comments.
const rules = [];
for (const line of text.split(/\r?\n/)) {
  if (!line.trim() || line.trim().startsWith("#")) continue;
  if (/^\s/.test(line)) {
    const [name, ...value] = line.trim().split(":");
    rules.at(-1).headers[name.trim().toLowerCase()] = value.join(":").trim();
  } else {
    rules.push({ path: line.trim(), headers: {} });
  }
}

describe("public/_headers", () => {
  it("has exactly one rule, for the hashed build output in /assets/", () => {
    expect(rules.map((rule) => rule.path)).toEqual(["/assets/*"]);
  });

  it("makes those files cacheable for a year and immutable", () => {
    expect(rules[0].headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it("sets nothing else on them", () => {
    expect(Object.keys(rules[0].headers)).toEqual(["cache-control"]);
  });

  it("never matches index.html, the root, or the unhashed files in public/ (edge cases: a catch-all or broad rule would freeze a deploy)", () => {
    const matches = (path, pattern) =>
      new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$").test(path);
    for (const path of ["/", "/index.html", "/favicon.svg", "/og-image.png", "/robots.txt", "/sitemap.xml", "/_redirects", "/_headers", "/dashboard"]) {
      expect(matches(path, rules[0].path), path).toBe(false);
    }
    expect(matches("/assets/index-DydNaJ1N.js", rules[0].path)).toBe(true);
    expect(matches("/assets/Mercedes-Benz-Logo-BWY0Tt1E.png", rules[0].path)).toBe(true);
  });
});
