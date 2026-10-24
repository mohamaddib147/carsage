// QA fix: on a phone the submit button is far below the messages a form shows (field errors, "Save anyway"
// warnings, a failed save), so tapping it looked like it did nothing. This is the same approach as the Fuel Log's
// "Skip the odometer?" prompt (commit cf12cc3): the first message is scrolled to the middle of the screen ONCE,
// right after it appears. Instant (no smooth scroll, so no motion to reduce), JS only, and focus is not moved.

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Returns `scrollToAlert(container?)`. Call it in a submit handler at the point where the handler stops with a
 * message (or has just set one); after the render that shows the message, the first `[role="alert"]` inside
 * `container` (the whole page when omitted) is scrolled into view. Every call scrolls once, so tapping submit a
 * second time with the same mistake scrolls again.
 * @returns {(container?: Element | null) => void}
 */
export function useScrollToAlert() {
  const containerRef = useRef(null);
  const [requests, setRequests] = useState(0);

  useEffect(() => {
    if (requests === 0) return;
    const root = containerRef.current ?? document;
    // Optional call: jsdom has no scrollIntoView.
    root.querySelector('[role="alert"]')?.scrollIntoView?.({ block: "center" });
  }, [requests]);

  return useCallback((container) => {
    containerRef.current = container ?? null;
    setRequests((count) => count + 1);
  }, []);
}
