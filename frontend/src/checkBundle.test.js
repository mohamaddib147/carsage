// Runs scripts/check-bundle.mjs against small fake build folders to prove it
// rejects a build made without the Supabase variables (PLAN-02).
// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const root = mkdtempSync(join(tmpdir(), "check-bundle-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/**
 * Writes a fake build folder: index.html, one entry chunk with the given code and an empty stylesheet.
 * @param {string} name folder name under the temp root
 * @param {string} code contents of the entry chunk
 * @param {boolean} [withScript=true] false leaves the module <script> out of index.html
 * @returns {string} the folder path
 */
function fakeBuild(name, code, withScript = true) {
  const dir = join(root, name);
  mkdirSync(join(dir, "assets"), { recursive: true });
  const script = withScript ? '<script type="module" src="/assets/index.js"></script>' : "";
  writeFileSync(join(dir, "index.html"), `<link rel="stylesheet" href="/assets/index.css">${script}`);
  writeFileSync(join(dir, "assets/index.js"), code);
  writeFileSync(join(dir, "assets/index.css"), "");
  return dir;
}

/** Runs the check on a folder; returns { status, out } with stdout and stderr joined. */
function check(dir) {
  const run = spawnSync(process.execPath, ["scripts/check-bundle.mjs", dir], { encoding: "utf8" });
  return { status: run.status, out: run.stdout + run.stderr };
}

describe("check-bundle Supabase marker", () => {
  it("passes when the Supabase client is in the entry chunk", () => {
    const { status, out } = check(fakeBuild("ok", "`sb-x-auth-token`"));
    expect(status).toBe(0);
    expect(out).toContain("check-bundle OK");
  });

  it("fails with a clear message when the client is missing", () => {
    const { status, out } = check(fakeBuild("empty", "console.log(1)"));
    expect(status).toBe(1);
    expect(out).toContain("without the Supabase variables");
  });

  it("fails when index.html has no module script", () => {
    const { status, out } = check(fakeBuild("noscript", "", false));
    expect(status).toBe(1);
    expect(out).toContain("no module <script>");
  });
});
