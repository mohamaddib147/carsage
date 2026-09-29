// Tests for apiFetch (CAR-25, error handling): what a user ends up reading when
// the backend can't be reached, crashes, rejects the input or refuses the call.
// The one rule: only a plain-text message the backend itself wrote is ever
// shown; browser/network wording, server crashes and validation lists become a
// fixed friendly sentence. `fetch` is stubbed, so no network is used.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./apiClient.js";
import { COLD_START_THRESHOLD_MS, onColdStartChange } from "./coldStart.js";
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

  it("CAR-57: sends a FormData body as-is, without JSON-stringifying it or setting Content-Type", async () => {
    fetch.mockResolvedValue(fakeResponse({ ok: true, body: { readable: true } }));
    const formData = new FormData();
    formData.append("file", new Blob(["fake-image"], { type: "image/jpeg" }), "registration.jpg");

    const data = await apiFetch("/cars/scan-registration", {
      method: "POST",
      body: formData,
      accessToken: "tok-123",
    });

    expect(data).toEqual({ readable: true });
    const [, options] = fetch.mock.calls[0];
    expect(options.body).toBe(formData);
    expect(options.headers["Content-Type"]).toBeUndefined();
    expect(options.headers.Authorization).toBe("Bearer tok-123");
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

describe("apiFetch — cold-start tracking (professional-polish pass, no Jira task)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a slow request to lib/coldStart.js once it outlives the threshold, and clears it once the request settles", async () => {
    const listener = vi.fn();
    const unsubscribe = onColdStartChange(listener);

    let resolveFetch;
    fetch.mockReturnValue(new Promise((resolve) => (resolveFetch = resolve)));

    const promise = apiFetch("/health");
    await vi.advanceTimersByTimeAsync(COLD_START_THRESHOLD_MS);
    expect(listener).toHaveBeenCalledWith(true);

    resolveFetch(fakeResponse({ ok: true, body: { ok: 1 } }));
    await promise;

    expect(listener).toHaveBeenLastCalledWith(false);
    unsubscribe();
  });

  it("never reports a request that resolves before the threshold", async () => {
    const listener = vi.fn();
    const unsubscribe = onColdStartChange(listener);
    fetch.mockResolvedValue(fakeResponse({ ok: true, body: { ok: 1 } }));

    await apiFetch("/health");

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
