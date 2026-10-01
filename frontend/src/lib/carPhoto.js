// CAR-58 car photo helpers: upload/read/delete a car's photo against the
// private `car-photos` Supabase Storage bucket (docs/db_migrations/2026-10-01_*).
// No backend endpoint — like `cars` itself, this goes straight through
// supabase-js, RLS-protected (storage policies, not table policies: a user
// may only read/write/replace/delete objects inside their own `{user_id}/`
// folder). The bucket is private, so a photo is never reachable by a bare
// URL — every read goes through a short-lived signed URL instead.

import { supabase } from "./supabaseClient.js";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

// Mirrors backend/app/validation.py's MAX_REGISTRATION_IMAGE_BYTES /
// ALLOWED_REGISTRATION_IMAGE_TYPES (CAR-57) — same bound, own named
// constants here since this isn't registration-scan-specific. The bucket
// itself also enforces this server-side (file_size_limit/allowed_mime_types
// on the `car-photos` bucket) as defense-in-depth.
export const MAX_CAR_PHOTO_BYTES = 8 * 1024 * 1024;
export const ALLOWED_CAR_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const EXTENSION_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

/**
 * Client-side pre-check for a car photo, before it's uploaded. Mirrors
 * `getRegistrationImageError` (lib/limits.js) — the backend/bucket's own
 * checks still apply regardless; this is just fast, friendly feedback.
 * @param {File} file
 * @returns {string} an error message, or "" if the file looks fine.
 */
export function getCarPhotoError(file) {
  if (!ALLOWED_CAR_PHOTO_TYPES.has(file.type)) {
    return "Please choose a JPEG, PNG, WEBP or HEIC photo.";
  }
  if (file.size > MAX_CAR_PHOTO_BYTES) {
    return "That image is too large. Please use a photo under 8 MB.";
  }
  if (file.size === 0) {
    return "That image appears to be empty. Please try again.";
  }
  return "";
}

/**
 * Uploads a car photo to the caller's own folder in the `car-photos`
 * bucket. Always a new object (never overwrites), so the caller is
 * responsible for deleting the old one (via `deleteCarPhoto`) when
 * replacing a photo, keeping Storage from accumulating orphans.
 * @param {string} userId
 * @param {string} carId
 * @param {File} file
 * @returns {Promise<{ path: string|null, error: Error|null }>}
 */
export async function uploadCarPhoto(userId, carId, file) {
  const extension = EXTENSION_BY_TYPE[file.type] ?? "jpg";
  const path = `${userId}/${carId}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from("car-photos").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  return { path: error ? null : path, error };
}

/**
 * A short-lived signed URL for a stored car photo, or null for a null/
 * empty path (no photo set) or if the signed URL couldn't be created
 * (e.g. the object was already deleted) — callers treat either the same
 * as "no photo" rather than showing a broken image.
 * @param {string | null | undefined} path
 * @returns {Promise<string | null>}
 */
export async function getCarPhotoUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("car-photos")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return error ? null : data.signedUrl;
}

/**
 * Deletes a stored car photo (called when replacing or removing one).
 * Best-effort: a failure here just leaves an orphaned object rather than
 * blocking whatever the caller is actually trying to do (save the new
 * photo, or finish removing the old one from the car's row).
 * @param {string | null | undefined} path
 */
export async function deleteCarPhoto(path) {
  if (!path) return;
  await supabase.storage.from("car-photos").remove([path]);
}
