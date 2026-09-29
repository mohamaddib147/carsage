// Error-message regression guard (CAR-25, AC 3) for the frontend source: a page
// may not put a caught error's own `.message` on screen, because errors from
// Supabase carry technical wording (table/constraint names, "row-level security
// policy", "JWT expired"). Pages must go through describeSaveError /
// describeActionError / describeAuthError (src/lib/limits.js), which replace it
// with a plain sentence.
//
// The two exceptions are the Trip Planner and AI Advisor pages: their errors come
// only from apiFetch (src/lib/apiClient.js), which itself only ever throws a
// fixed sentence or a plain-text message the backend wrote — see
// apiClient.test.js. They read source files, so no browser or network is needed.

import { describe, expect, it } from "vitest";

const modules = import.meta.glob("/src/pages/*.jsx", { query: "?raw", import: "default", eager: true });
const pages = Object.entries(modules).filter(([path]) => !/\.test\.jsx$/.test(path));

// Files whose only error source is apiFetch (already sanitised). Matched
// case-insensitively (site-audit follow-up, no Jira task): on Windows'
// case-insensitive filesystem, import.meta.glob's reported key casing for
// AiAdvisorPage.jsx has been observed to vary between runs (a Vite glob-
// cache quirk, not a real rename), which made an exact-case string list
// here flaky — this filters by lowercased filename instead, so it holds
// regardless of which casing Vite happens to report.
const API_FETCH_ONLY_NAMES = ["tripplannerpage.jsx", "aiadvisorpage.jsx"];
const isApiFetchOnly = (path) => API_FETCH_ONLY_NAMES.includes(path.split("/").pop().toLowerCase());

// set...Error(<anything>.message) / set...Error(<anything>?.message ...)
const RAW_MESSAGE_INTO_STATE = /set\w*Error\(\s*[\w.?]+\??\.message\b/;

function offenders(entries) {
  return entries.flatMap(([path, text]) =>
    text
      .split("\n")
      .map((line, index) => ({ line, number: index + 1 }))
      .filter(({ line }) => RAW_MESSAGE_INTO_STATE.test(line))
      .map(({ line, number }) => `${path}:${number}: ${line.trim()}`),
  );
}

describe("pages never show a raw error message", () => {
  it("scans the real page files", () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
    expect(pages.some(([path]) => path.endsWith("/AuthPage.jsx"))).toBe(true);
  });

  it("no page except the apiFetch-only ones puts error.message into its error state", () => {
    const checked = pages.filter(([path]) => !isApiFetchOnly(path));

    expect(offenders(checked)).toEqual([]);
  });

  it("the apiFetch-only pages really do get their errors from apiFetch, not from Supabase", () => {
    const apiFetchOnlyEntries = pages.filter(([path]) => isApiFetchOnly(path));
    expect(apiFetchOnlyEntries).toHaveLength(API_FETCH_ONLY_NAMES.length);

    for (const [path, text] of apiFetchOnlyEntries) {
      expect(text, path).toContain("apiFetch(");
      // A Supabase call whose error is destructured and shown would break the exemption.
      expect(/\{\s*(data\s*,\s*)?error\s*\}\s*=\s*await\s+supabase/.test(text), path).toBe(false);
    }
  });

  it("the scanner itself flags a violation (not vacuous)", () => {
    expect(RAW_MESSAGE_INTO_STATE.test("setDeleteError(error.message);")).toBe(true);
    expect(RAW_MESSAGE_INTO_STATE.test("setError(authError.message);")).toBe(true);
    expect(RAW_MESSAGE_INTO_STATE.test("setError(describeAuthError(authError));")).toBe(false);
  });
});
