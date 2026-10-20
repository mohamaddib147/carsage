// Step 3: the photos of one maintenance completion (up to 3) or one expense (a
// receipt). Collapsed by default: nothing is fetched and no image loads until
// the user opens it, so a long history or expense list never pulls full-size
// photos. Each photo is shown in an <img> from a signed URL that expires after
// about 5 minutes (lib/recordPhotos.js); a row whose file is missing shows a
// "Photo missing" placeholder. Photos are stored only, never sent anywhere else.

import { useEffect, useRef, useState } from "react";
import {
  addPhoto,
  deletePhoto,
  firstFreeSlot,
  getPhotoUrl,
  getRecordPhotoError,
  listPhotos,
  MAX_MAINTENANCE_PHOTOS,
  PHOTO_ERRORS,
} from "../lib/recordPhotos.js";

/**
 * @param {{ kind: "maintenance" | "receipt", parentId: string, userId: string, label: string }} props
 *   `label` names what the photos belong to, for the buttons' accessible names.
 * @returns {JSX.Element}
 */
function RecordPhotos({ kind, parentId, userId, label }) {
  const isReceipt = kind === "receipt";
  const max = isReceipt ? 1 : MAX_MAINTENANCE_PHOTOS;
  const noun = isReceipt ? "Receipt" : "Photos";

  const [open, setOpen] = useState(false);
  // null = not loaded yet.
  const [photos, setPhotos] = useState(null);
  const [urls, setUrls] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const inputId = `photo-${kind}-${parentId}`;

  useEffect(() => {
    if (!open || photos !== null) return undefined;
    let cancelled = false;
    listPhotos(kind, parentId)
      .then((rows) => {
        if (!cancelled) setPhotos(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setPhotos([]);
          setError("Could not load the photos. Please try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, photos, kind, parentId]);

  useEffect(() => {
    if (!photos) return undefined;
    let cancelled = false;
    for (const photo of photos) {
      if (photo.id in urls) continue;
      getPhotoUrl(photo.storage_path).then((url) => {
        if (!cancelled) setUrls((previous) => ({ ...previous, [photo.id]: url }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [photos, urls]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    setError("");
    const clientError = getRecordPhotoError(file);
    if (clientError) {
      setError(clientError);
      return;
    }
    setBusy(true);
    try {
      const slot = isReceipt ? undefined : firstFreeSlot(photos ?? []);
      const added = await addPhoto(kind, { userId, parentId, slot, file });
      setPhotos((previous) => [...(previous ?? []), added]);
    } catch (caught) {
      const known = Object.values(PHOTO_ERRORS).includes(caught?.message);
      setError(known ? caught.message : PHOTO_ERRORS.failed);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(photo) {
    setError("");
    setBusy(true);
    try {
      await deletePhoto(kind, photo);
      setPhotos((previous) => previous.filter((row) => row.id !== photo.id));
    } catch {
      setError("Could not remove the photo. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const count = photos?.length ?? 0;
  return (
    <div className="attached-photos">
      <button
        type="button"
        className="maintenance-link-btn"
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} ${noun.toLowerCase()} for ${label}`}
        onClick={() => setOpen((previous) => !previous)}
      >
        {open ? `Hide ${noun.toLowerCase()}` : noun}
      </button>
      {open && (
        <div className="attached-photos__panel">
          {photos === null ? (
            <p className="form-hint">Loading...</p>
          ) : (
            <>
              {count === 0 && <p className="form-hint">{isReceipt ? "No receipt attached." : "No photos yet."}</p>}
              <ul className="attached-photos__list">
                {photos.map((photo, index) => (
                  <li key={photo.id} className="attached-photos__item">
                    {photo.id in urls && urls[photo.id] === null ? (
                      <span className="attached-photos__missing" role="img" aria-label="Photo missing">
                        Photo missing
                      </span>
                    ) : urls[photo.id] ? (
                      <img
                        className="attached-photos__img"
                        src={urls[photo.id]}
                        alt={isReceipt ? `Receipt for ${label}` : `Photo ${index + 1} for ${label}`}
                        onError={() => setUrls((previous) => ({ ...previous, [photo.id]: null }))}
                      />
                    ) : (
                      <span className="attached-photos__missing">Loading...</span>
                    )}
                    <button
                      type="button"
                      className="maintenance-link-btn maintenance-link-btn--danger"
                      disabled={busy}
                      aria-label={isReceipt ? `Remove the receipt for ${label}` : `Remove photo ${index + 1} for ${label}`}
                      onClick={() => handleRemove(photo)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {count < max && (
                <>
                  <label className="maintenance-link-btn attached-photos__add" htmlFor={inputId}>
                    {busy ? "Saving..." : isReceipt ? "Attach a receipt" : "Add a photo"}
                  </label>
                  <input
                    id={inputId}
                    ref={inputRef}
                    className="sr-only"
                    type="file"
                    accept="image/*"
                    disabled={busy}
                    aria-label={isReceipt ? `Attach a receipt for ${label}` : `Add a photo for ${label}`}
                    onChange={handleFile}
                  />
                </>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="auth-form__error">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default RecordPhotos;
