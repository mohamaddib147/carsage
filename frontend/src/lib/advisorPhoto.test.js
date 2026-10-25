// Tests lib/advisorPhoto.js: merging flags keeps the MORE cautious one (free text beats a
// listed key, the lower confidence wins) and remembers every scanned sentence; a flag
// stays while the scanned sentence is still (mostly) in the box, however it is edited,
// and is cleared when the box is emptied or the text replaced entirely; and the request
// flag has exactly the shape the backend accepts.

import { describe, expect, it } from "vitest";
import { isStillFromPhoto, mergeFlag, toRequestFlag } from "./advisorPhoto.js";

const LISTED = { kind: "listed", confidence: "high", sentence: "A headlight is not working." };
const OTHER = { kind: "other", confidence: "medium", sentence: "From a photo (AI guess, may be wrong): Rust hole in the rear fender" };

describe("mergeFlag", () => {
  it("starts a flag from the first scan", () => {
    expect(mergeFlag(null, LISTED)).toEqual({ kind: "listed", confidence: "high", sentences: [LISTED.sentence] });
  });

  it("keeps the more cautious kind and the lower confidence, and remembers both sentences", () => {
    const first = mergeFlag(null, LISTED);
    expect(mergeFlag(first, OTHER)).toEqual({ kind: "other", confidence: "medium", sentences: [LISTED.sentence, OTHER.sentence] });
    const second = mergeFlag(mergeFlag(null, OTHER), { ...LISTED, confidence: "low" });
    expect(second).toMatchObject({ kind: "other", confidence: "low" });
  });

  it("never becomes less cautious", () => {
    const strict = mergeFlag(null, { kind: "other", confidence: "low", sentence: "x one two" });
    const merged = mergeFlag(strict, { kind: "listed", confidence: "high", sentence: "y three four" });
    expect(merged).toMatchObject({ kind: "other", confidence: "low" });
  });
});

describe("isStillFromPhoto", () => {
  const sentences = [OTHER.sentence];

  it("stays while the sentence is edited: words added, changed or removed from the end", () => {
    expect(isStillFromPhoto(OTHER.sentence, sentences)).toBe(true);
    expect(isStillFromPhoto(`${OTHER.sentence} It happened after a car wash.`, sentences)).toBe(true);
    expect(isStillFromPhoto("From a photo (AI guess, may be wrong): Rust hole in the rear wheel arch", sentences)).toBe(true);
    expect(isStillFromPhoto("Rust hole in the rear fender", sentences)).toBe(true);
  });

  it("is cleared when the box is empty or only whitespace", () => {
    expect(isStillFromPhoto("", sentences)).toBe(false);
    expect(isStillFromPhoto("   ", sentences)).toBe(false);
  });

  it("is cleared when the text is replaced entirely", () => {
    expect(isStillFromPhoto("Engine knocking loudly when cold", sentences)).toBe(false);
    expect(isStillFromPhoto("Steering feels loose on bumps", ["A headlight is not working."])).toBe(false);
  });

  it("stays if any one of several scanned sentences is still there", () => {
    expect(isStillFromPhoto("A headlight is not working. Also my engine knocks loudly", [OTHER.sentence, "A headlight is not working."])).toBe(true);
  });

  it("is false with no sentences", () => {
    expect(isStillFromPhoto("anything", [])).toBe(false);
  });
});

describe("toRequestFlag", () => {
  it("is exactly {source, confidence, kind}: no sentences, no extras", () => {
    expect(toRequestFlag({ kind: "other", confidence: "low", sentences: ["x"] })).toEqual({ source: "photo", confidence: "low", kind: "other" });
  });

  it("is undefined when there is no flag", () => {
    expect(toRequestFlag(null)).toBeUndefined();
  });
});
