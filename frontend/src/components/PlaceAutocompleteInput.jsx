// Text input with Google Places address suggestions (CAR-47). It is
// always a normal text input first: whatever the user types is passed up
// via onChange exactly as typed, suggestions are only an optional
// shortcut, and with no VITE_GOOGLE_MAPS_API_KEY (or if the lookup
// fails / finds nothing) it simply behaves as a plain field. Selecting a
// suggestion fills in its full formatted text. Accessible combobox:
// ArrowUp/Down to move, Enter to pick the highlighted one, Escape to
// close — and Enter with nothing highlighted is left alone so submitting
// a hand-typed address still works.

import { useEffect, useId, useRef, useState } from "react";
import {
  fetchPlaceSuggestions,
  getPlacesApiKey,
  newSessionToken,
} from "../lib/placesAutocomplete.js";

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

/**
 * @param {{ id: string, value: string, onChange: (text: string) => void,
 *   placeholder?: string, maxLength?: number }} props
 * @returns {JSX.Element}
 */
function PlaceAutocompleteInput({ id, value, onChange, placeholder, maxLength }) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sessionToken = useRef(newSessionToken());
  const skipNextLookup = useRef(false);

  useEffect(() => {
    const apiKey = getPlacesApiKey();

    // A value set by picking a suggestion shouldn't trigger a new lookup
    // for that same text.
    if (skipNextLookup.current) {
      skipNextLookup.current = false;
      return undefined;
    }
    if (!apiKey || value.trim().length < MIN_CHARS) {
      setSuggestions([]);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const results = await fetchPlaceSuggestions(value, {
        apiKey,
        sessionToken: sessionToken.current,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setSuggestions(results);
      setActiveIndex(-1);
      setOpen(results.length > 0);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  /** @param {string} text */
  function choose(text) {
    skipNextLookup.current = true;
    onChange(text);
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
    // A completed selection ends the billing session; start a new one.
    sessionToken.current = newSessionToken();
  }

  /** @param {import('react').KeyboardEvent} event */
  function handleKeyDown(event) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      choose(suggestions[activeIndex]);
    }
  }

  return (
    <>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        autoComplete="off"
        placeholder={placeholder}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        onFocus={() => setOpen(suggestions.length > 0)}
      />
      {open && (
        <ul id={listId} role="listbox" className="place-suggestions">
          {suggestions.map((text, index) => (
            <li
              key={text}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`place-suggestions__item${
                index === activeIndex ? " place-suggestions__item--active" : ""
              }`}
              // mousedown (not click) so it fires before the input's blur
              // closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(text);
              }}
            >
              {text}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default PlaceAutocompleteInput;
