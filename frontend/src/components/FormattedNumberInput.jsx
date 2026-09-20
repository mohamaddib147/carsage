// A number input that shows thousand separators as you type ("140500" ->
// "140,500"), matching how every result number on the page is formatted.
// The parent keeps the RAW number as a plain string ("140500", "43.5") —
// commas exist only in what is displayed — so Number(value) and anything
// sent to the server are unaffected. It is a type="text" input (a native
// type="number" can't show commas) with inputMode set so phones still open
// a numeric keypad. Characters other than digits (and one "." when
// decimals are allowed) are dropped as they are typed or pasted, and the
// caret stays put when editing in the middle of a number.

import { useLayoutEffect, useRef, useState } from "react";

/**
 * Strips everything but digits (and, if allowed, the first ".") from text.
 * @param {string} text
 * @param {boolean} allowDecimal
 * @returns {string}
 */
export function sanitizeNumberString(text, allowDecimal) {
  const stripped = text.replace(allowDecimal ? /[^\d.]/g : /[^\d]/g, "");
  if (!allowDecimal) return stripped;
  const dot = stripped.indexOf(".");
  if (dot === -1) return stripped;
  return stripped.slice(0, dot + 1) + stripped.slice(dot + 1).replace(/\./g, "");
}

/**
 * Adds thousand separators to the integer part of a raw number string,
 * leaving any decimal part (and a trailing ".") exactly as typed.
 * @param {string} raw - e.g. "140500", "43.5", "1234."
 * @returns {string} e.g. "140,500", "43.5", "1,234."
 */
export function formatNumberString(raw) {
  if (!raw) return "";
  const [integerPart, ...rest] = raw.split(".");
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest.length > 0 ? `${grouped}.${rest.join("")}` : grouped;
}

/**
 * @param {{
 *   value: string,
 *   onChange: (raw: string) => void,
 *   allowDecimal?: boolean,
 * } & Omit<import('react').InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>} props
 *   value is the raw string (no commas); onChange receives the raw string.
 * @returns {JSX.Element}
 */
function FormattedNumberInput({ value, onChange, allowDecimal = false, ...inputProps }) {
  const inputRef = useRef(null);
  // How many real characters (digits / the dot) sat before the caret when
  // the user last typed — used to put the caret back after re-formatting.
  const caretTarget = useRef(null);
  // Forces a re-render even when the typed text was rejected, so the caret
  // is restored in that case too.
  const [, setTick] = useState(0);

  const display = formatNumberString(value);

  useLayoutEffect(() => {
    if (caretTarget.current == null || !inputRef.current) return;
    const wanted = caretTarget.current;
    caretTarget.current = null;

    let seen = 0;
    let position = 0;
    while (position < display.length && seen < wanted) {
      if (display[position] !== ",") seen += 1;
      position += 1;
    }
    inputRef.current.setSelectionRange(position, position);
  });

  /** @param {import('react').ChangeEvent<HTMLInputElement>} event */
  function handleChange(event) {
    const text = event.target.value;
    const caret = event.target.selectionStart ?? text.length;

    caretTarget.current = sanitizeNumberString(text.slice(0, caret), allowDecimal).length;
    onChange(sanitizeNumberString(text, allowDecimal));
    setTick((tick) => tick + 1);
  }

  return (
    <input
      {...inputProps}
      ref={inputRef}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      autoComplete="off"
      value={display}
      onChange={handleChange}
    />
  );
}

export default FormattedNumberInput;
