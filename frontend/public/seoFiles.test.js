// Guard for the professional-polish pass (no Jira task): robots.txt and
// sitemap.xml must exist as real static files in public/, not fall through
// to Netlify's SPA catch-all redirect (_redirects: "/* /index.html 200"),
// which would otherwise silently serve the app shell's HTML at both URLs
// with a 200 status, exactly the bug this replaces. Vite copies everything
// in public/ into dist/ untouched, so a file here is what gets deployed.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_DIR = path.resolve(__dirname);

describe("robots.txt", () => {
  const filePath = path.join(PUBLIC_DIR, "robots.txt");

  it("exists as a real file in public/", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("allows crawling and points at the real sitemap URL", () => {
    const text = readFileSync(filePath, "utf-8");
    expect(text).toMatch(/Allow:\s*\//);
    expect(text).toContain("Sitemap: https://carsage.netlify.app/sitemap.xml");
  });

  it("disallows the signed-in-only routes, which have nothing for a crawler to index", () => {
    const text = readFileSync(filePath, "utf-8");
    for (const route of ["/dashboard", "/trip-planner", "/advisor", "/fuel-log"]) {
      expect(text).toContain(`Disallow: ${route}`);
    }
  });
});

describe("sitemap.xml", () => {
  const filePath = path.join(PUBLIC_DIR, "sitemap.xml");

  it("exists as a real file in public/", () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it("is well-formed XML listing the real production URL", () => {
    const text = readFileSync(filePath, "utf-8");
    expect(text).toMatch(/^<\?xml/);
    expect(text).toContain("<urlset");
    expect(text).toContain("<loc>https://carsage.netlify.app/</loc>");
  });

  it("only lists public, logged-out-visible pages (no signed-in-only routes)", () => {
    const text = readFileSync(filePath, "utf-8");
    for (const route of ["/dashboard", "/trip-planner", "/advisor", "/fuel-log", "/cars/"]) {
      expect(text).not.toContain(route);
    }
  });
});
