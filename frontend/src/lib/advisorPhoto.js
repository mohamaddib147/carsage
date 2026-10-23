// The Advisor's photo flag: when the text in the Advisor's input came from a photo scan
// (POST /ai-advisor/scan-photo), the page sends {source: "photo", confidence, kind}
// with the message so the backend can be MORE cautious about it (free-text or
// low-confidence photo text is never answered DIY). The backend only accepts exact
// values and the recall check still runs first.
//
// The flag stays attached while the user edits the scanned sentence; it is cleared only
// when the box is emptied or the text is replaced entirely (see isStillFromPhoto).

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

/**
 * Combines the flag already on the box with a new scan: the MORE cautious of the two
 * (free text beats a listed key, a lower confidence beats a higher one), and every
 * scanned sentence is remembered so edits can be recognised.
 * @param {{ kind: string, confidence: string, sentences: string[] } | null} previous
 * @param {{ kind: "listed" | "other", confidence: "low" | "medium" | "high", sentence: string }} finding
 * @returns {{ kind: string, confidence: string, sentences: string[] }}
 */
export function mergeFlag(previous, finding) {
  if (!previous) return { kind: finding.kind, confidence: finding.confidence, sentences: [finding.sentence] };
  return {
    kind: previous.kind === "other" || finding.kind === "other" ? "other" : "listed",
    confidence:
      CONFIDENCE_RANK[previous.confidence] <= CONFIDENCE_RANK[finding.confidence] ? previous.confidence : finding.confidence,
    sentences: [...previous.sentences, finding.sentence],
  };
}

function words(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length >= 3);
}

/**
 * Whether the box still holds (an edited form of) at least one scanned sentence: at
 * least half of that sentence's words are still in the text. Adding words, fixing a
 * word or changing the description keeps it; emptying the box or typing something
 * else entirely does not.
 * @param {string} text - what is in the input now.
 * @param {string[]} sentences - the scanned sentences that were put in the box.
 * @returns {boolean}
 */
export function isStillFromPhoto(text, sentences) {
  if (!String(text).trim()) return false;
  const present = new Set(words(text));
  return sentences.some((sentence) => {
    const wanted = words(sentence);
    if (wanted.length === 0) return false;
    return wanted.filter((word) => present.has(word)).length * 2 >= wanted.length;
  });
}

/** The flag in the exact shape the backend accepts, or undefined for no flag. */
export function toRequestFlag(flag) {
  return flag ? { source: "photo", confidence: flag.confidence, kind: flag.kind } : undefined;
}
