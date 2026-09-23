// Injection / XSS regression guard (CAR-23, AC 3) for the frontend source: the
// browser may only talk to Supabase through the client's builder with literal
// table names and .eq()-style filters (values are sent as parameters), and no
// code may write HTML, run strings as code, or build javascript: URLs. A manual
// audit found this true today; these tests fail if someone adds such a call.
// They read the source files, so they need no browser or network.

import { describe, expect, it } from "vitest";

// Every non-test source file under src/, as raw text.
const modules = import.meta.glob("/src/**/*.{js,jsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});
const sources = Object.entries(modules).filter(([path]) => !/\.test\.jsx?$/.test(path));

function offenders(pattern) {
  return sources.flatMap(([path, text]) =>
    text
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
      .filter(({ line }) => pattern.test(line))
      .map(({ line, number }) => `${path}:${number}: ${line.trim()}`),
  );
}

describe("frontend source has no injection / XSS sinks", () => {
  it("scans the real source files", () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(sources.some(([path]) => path.endsWith("/pages/CarOnboardingPage.jsx"))).toBe(true);
  });

  it("never writes raw HTML or runs strings as code", () => {
    expect(offenders(/dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/)).toEqual([]);
  });

  it("never builds a javascript: or data: URL", () => {
    expect(offenders(/["'`]\s*(javascript|data|vbscript):/i)).toEqual([]);
  });

  it("never uses the Supabase client's raw-filter or stored-procedure helpers", () => {
    // .rpc() / .or() / .ilike() / .like() / .textSearch() take raw filter strings.
    expect(offenders(/\.(rpc|or|ilike|like|textSearch)\(/)).toEqual([]);
  });

  it("only queries Supabase tables by a string literal", () => {
    expect(offenders(/supabase\s*\.from\(\s*[^"'\s)]/)).toEqual([]);
    expect(offenders(/^\s*\.from\(\s*[^"'\s)]/)).toEqual([]);
  });

  it("never interpolates a value into a query filter", () => {
    expect(offenders(/\.(eq|neq|gt|gte|lt|lte|in|is|select|order)\([^)]*`/)).toEqual([]);
  });

  it("the scanner itself flags a violation (not vacuous)", () => {
    expect(/\.(rpc|or|ilike|like|textSearch)\(/.test('supabase.from("cars").ilike("make", x)')).toBe(true);
    expect(/dangerouslySetInnerHTML|\.innerHTML/.test("el.innerHTML = x")).toBe(true);
  });
});
