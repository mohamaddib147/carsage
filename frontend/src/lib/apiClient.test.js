// Tests for apiFetch (CAR-25, error handling): what a user ends up reading when
// the backend can't be reached, crashes, rejects the input or refuses the call.
// The one rule: only a plain-text message the backend itself wrote is ever
// shown; browser/network wording, server crashes and validation lists become a
// fixed friendly sentence. `fetch` is stubbed, so no network is used.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiClient.js";
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from "./limits.js";

/** A minimal fetch Response: ok flag plus a json() that resolves or rejects. */
function fakeResponse({ ok, body, jsonThrows = false }) {
  return {
    ok,
    json: jsonThrows ? () => Promise.reject(new SyntaxError("Unexpected token I")) : () => Promise.resolve(body),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch — success", () => {
  it("returns the parsed JSON body and sends the session token", async () => {
    fetch.mockResolvedValue(fakeResponse({ ok: true, body: { ok: 1 } }));

    const data = await apiFetch("/health", { accessToken: "tok-123" });

    expect(data).toEqual({ ok: 1 });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer tok-123");
  });
});

describe("apiFetch — errors are always plain language", () => {
  it("shows the backend's own plain-text message (e.g. 'Car not found.')", async () => {
    fetch.mockResolvedValue(fakeResponse({ ok: false, body: { detail: "Car not found." } }));

    await expect(apiFetch("/trip-planner/estimate")).rejects.toThrow("Car not found.");
  });

  it.each(["Failed to fetch", "Load failed", "NetworkError when attempting to fetch resource."])(
    "replaces the browser's own network wording (%j) with a plain sentence",
    async (browserMessage) => {
      fetch.mockRejectedValue(new TypeError(browserMessage));

      const error = await apiFetch("/health").catch((caught) => caught);

      expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
      expect(error.message).not.toContain(browserMessage);
    },
  );

  it("does not show a request-validation list (a 422's `detail` is an array)", async () => {
    fetch.mockResolvedValue(
      fakeResponse({ ok: false, body: { detail: [{ loc: ["body", "destination"], msg: "String too short", type: "x" }] } }),
    );

    const error = await apiFetch("/trip-planner/estimate", { method: "POST", body: {} }).catch((caught) => caught);

    expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("shows a generic sentence when a server crash returns plain text instead of JSON", async () => {
    // FastAPI's unhandled-error reply is the text "Internal Server Error", not JSON.
    fetch.mockResolvedValue(fakeResponse({ ok: false, jsonThrows: true }));

    const error = await apiFetch("/health").catch((caught) => caught);

    expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("shows a generic sentence when an error reply has no detail at all", async () => {
    fetch.mockResolvedValue(fakeResponse({ ok: false, body: {} }));

    await expect(apiFetch("/health")).rejects.toThrow(GENERIC_ERROR_MESSAGE);
  });
});
