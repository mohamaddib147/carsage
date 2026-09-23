// Guard for CAR-51: the favicon <link> in index.html must point at a file
// that actually exists in public/, with a type attribute matching that
// file's real format. (This caught a real bug during CAR-51: the tag
// referenced /favicon.svg, but only favicon.jpeg was ever added to public/
// — the browser tab would have silently shown no icon at all.)

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const FRONTEND_ROOT = path.resolve(__dirname);
const html = readFileSync(path.join(FRONTEND_ROOT, "index.html"), "utf-8");

const EXTENSION_TO_MIME = {
  ".svg": "image/svg+xml",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

describe("index.html — favicon", () => {
  it("has a <link rel=\"icon\"> tag", () => {
    expect(html).toMatch(/<link\s+rel="icon"/);
  });

  it("points at a file that actually exists in public/", () => {
    const [, href] = html.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/) ?? [];
    expect(href).toBeTruthy();

    const publicPath = path.join(FRONTEND_ROOT, "public", href.replace(/^\//, ""));
    expect(existsSync(publicPath)).toBe(true);
  });

  it("declares a type matching the referenced file's real extension", () => {
    const [, href] = html.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/) ?? [];
    const [, type] = html.match(/<link\s+rel="icon"[^>]*type="([^"]+)"/) ?? [];
    const extension = path.extname(href).toLowerCase();

    expect(EXTENSION_TO_MIME[extension]).toBeDefined();
    expect(type).toBe(EXTENSION_TO_MIME[extension]);
  });

  it("public/ has no other favicon-looking file left over that the tag doesn't point to (stale-asset guard)", () => {
    const [, href] = html.match(/<link\s+rel="icon"[^>]*href="([^"]+)"/) ?? [];
    const referenced = href.replace(/^\//, "");
    const publicFiles = readdirSync(path.join(FRONTEND_ROOT, "public"));
    const faviconLike = publicFiles.filter((name) => /^favicon\./i.test(name));

    expect(faviconLike).toEqual([referenced]);
  });
});
