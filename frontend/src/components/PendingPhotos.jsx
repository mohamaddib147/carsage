// "Photos or receipt (optional)" on the Mark as done form: the user picks up to `max`
// photos, sees small previews and can remove any, but NOTHING is uploaded here. The
// page holds the chosen files and attaches them after the completion itself is saved
// (lib/recordPhotos.js: row first, then file, resized in the browser). They are kept
// in the user's private storage and are never sent to Google or anywhere else.

import { useEffect, useMemo, useRef, useState } from "react";
import { getPhotoFileError } from "../lib/photoReencode.js";

/**
 * @param {{ id: string, label: string, files: File[], max: number, disabled?: boolean,
 *   onChange: (files: File[]) => void }} props
 *   `id` is unique per form; `label` names what the photos are for (accessible names).
 * @returns {JSX.Element}
 */
function PendingPhotos({ id, label, files, max, disabled = false, onChange }) {
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  // Preview URLs for the chosen files; revoked when the files change or the form closes.
  const urls = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls]);

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const clientError = getPhotoFileError(file);
    if (clientError) {
      setError(clientError);
      return;
    }
    setError("");
    onChange([...files, file].slice(0, max));
  }

  function handleRemove(index) {
    setError("");
    onChange(files.filter((_, position) => position !== index));
  }

  return (
    <div className="pending-photos">
      <p className="pending-photos__label" id={`${id}-label`}>
        Photos or receipt (optional, up to {max})
      </p>
      {files.length > 0 && (
        <ul className="attached-photos__list" aria-labelledby={`${id}-label`}>
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="attached-photos__item">
              {urls[index] && <img className="attached-photos__img" src={urls[index]} alt={`Photo ${index + 1} to attach to ${label}`} />}
              <button
                type="button"
                className="maintenance-link-btn maintenance-link-btn--danger"
                disabled={disabled}
                aria-label={`Remove photo ${index + 1} for ${label}`}
                onClick={() => handleRemove(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <>
          <label className="maintenance-link-btn attached-photos__add" htmlFor={id}>
            {files.length === 0 ? "Add a photo" : "Add another photo"}
          </label>
          <input
            id={id}
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            disabled={disabled}
            aria-label={`Add a photo for ${label}`}
            onChange={handleFile}
          />
        </>
      )}
      <p className="form-hint">Kept in your private storage with this completion. Never sent to Google.</p>
      {error && (
        <p role="alert" className="auth-form__error">
          {error}
        </p>
      )}
    </div>
  );
}

export default PendingPhotos;
