// Tests for fetchPlaceSuggestions (CAR-47): parsing Places API (New)
// suggestions into plain text, the request shape (POST, key header,
// session token), and every failure/no-result path returning [] instead
// of throwing. fetch is stubbed — no real network calls.

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPlaceSuggestions } from "./placesAutocomplete.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchPlaceSuggestions", () => {
  it("returns the full suggestion texts (normal case)", async () => {
    const fetchMock = stubFetch({
      ok: true,
      json: async () => ({
        suggestions: [
          { placePrediction: { text: { text: "Tripoli, Lebanon" } } },
          { placePrediction: { text: { text: "Tripoli Souks, Tripoli, Lebanon" } } },
        ],
      }),
    });

    const results = await fetchPlaceSuggestions("Trip", {
      apiKey: "test-key",
      sessionToken: "token-1",
    });

    expect(results).toEqual(["Tripoli, Lebanon", "Tripoli Souks, Tripoli, Lebanon"]);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    expect(options.method).toBe("POST");
    expect(options.headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(JSON.parse(options.body)).toEqual({ input: "Trip", sessionToken: "token-1" });
  });

  it("returns [] when there are no suggestions (no-results case)", async () => {
    stubFetch({ ok: true, json: async () => ({}) });

    expect(await fetchPlaceSuggestions("zzzzqqq", { apiKey: "k" })).toEqual([]);
  });

  it("skips malformed suggestion entries", async () => {
    stubFetch({
      ok: true,
      json: async () => ({
        suggestions: [
          { queryPrediction: { text: { text: "a query, not a place" } } },
          { placePrediction: { text: { text: "Byblos, Lebanon" } } },
        ],
      }),
    });

    expect(await fetchPlaceSuggestions("Byb", { apiKey: "k" })).toEqual(["Byblos, Lebanon"]);
  });

  it("returns [] without calling the network when there is no key or no input", async () => {
    const fetchMock = stubFetch({ ok: true, json: async () => ({}) });

    expect(await fetchPlaceSuggestions("Tripoli", { apiKey: "" })).toEqual([]);
    expect(await fetchPlaceSuggestions("   ", { apiKey: "k" })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns [] on an HTTP error such as a bad key or exhausted quota", async () => {
    stubFetch({ ok: false, json: async () => ({ error: "quota" }) });

    expect(await fetchPlaceSuggestions("Tripoli", { apiKey: "k" })).toEqual([]);
  });

  it("returns [] on a network failure or abort instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await fetchPlaceSuggestions("Tripoli", { apiKey: "k" })).toEqual([]);
  });
});
