// Small "i in a circle" info icon that reveals a short explanatory
// tooltip (CAR-45). Works on both input types: on desktop it shows on
// hover and keyboard focus; on touch devices (no hover) a tap toggles it
// open until the user taps elsewhere, presses Escape, or taps it again.

import { useEffect, useId, useRef, useState } from "react";

/**
 * @param {{ label: string, children: import('react').ReactNode }} props
 *   `label` is the accessible name for the icon button (e.g. "About this
 *   estimate"); `children` is the tooltip text.
 * @returns {JSX.Element}
 */
function InfoTip({ label, children }) {
  const tooltipId = useId();
  const wrapperRef = useRef(null);
  // Two independent reasons the tooltip can be visible: the pointer/
  // focus is on it (transient), or it was tapped/clicked open (pinned).
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);

  const visible = hovered || pinned;

  useEffect(() => {
    if (!pinned) return undefined;

    /** Dismisses a pinned tooltip on a tap/click outside it or Escape. */
    function handleOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setPinned(false);
      }
    }
    function handleKey(event) {
      if (event.key === "Escape") setPinned(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pinned]);

  return (
    <span
      ref={wrapperRef}
      className="info-tip"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="info-tip__button"
        aria-label={label}
        aria-expanded={visible}
        aria-describedby={visible ? tooltipId : undefined}
        onClick={() => setPinned((previous) => !previous)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {visible && (
        <span role="tooltip" id={tooltipId} className="info-tip__bubble">
          {children}
        </span>
      )}
    </span>
  );
}

export default InfoTip;
