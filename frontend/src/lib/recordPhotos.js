// Step 3: photos attached to a maintenance completion (up to 3) or an expense
// (one receipt). STORED ONLY: they go to the private `record-photos` bucket and
// are never sent to the backend, Gemini or any other service — this module only
// talks to Supabase Storage and the two photo tables, and a source-scan test
// (recordPhotos.test.js) fails if it ever imports the API client or calls fetch.
//
// - Every photo is re-encoded in the browser first (lib/photoReencode.js): at most
//   1600 px, a JPEG under 2 MB, with no EXIF and so no location data.
// - Row first, then file (the bucket only accepts a file whose row already
//   exists, docs/db_migrations/2026-10-21_record_photos_storage.sql); if the
//   upload fails, the row is deleted again.
// - A photo is shown only through a signed URL that expires after
//   SIGNED_URL_TTL_SECONDS, never a permanent link to the file.
// - Deleting removes the row, then the file. If the file delete fails, the
//   database has already queued the path and the backend removes it later.

import { PHOTO_FILE_ERRORS, reencodeToJpeg } from "./photoReencode.js";
import { supabase } from "./supabaseClient.js";

export const SIGNED_URL_TTL_SECONDS = 300;
export const MAX_MAINTENANCE_PHOTOS = 3;

export const KINDS = {
  maintenance: { parentColumn: "record_id", folder: "maintenance" },
  receipt: { parentColumn: "expense_id", folder: "receipts" },
};

/** The photo table of a kind (table names stay string literals, see noUnsafeSinks.test.js). */
function photoTable(kind) {
  return kind === "maintenance" ? supabase.from("maintenance_record_photos") : supabase.from("car_expense_receipts");
}

function bucket() {
  return supabase.storage.from("record-photos");
}

export const PHOTO_ERRORS = {
  ...PHOTO_FILE_ERRORS,
  limit: "You've reached the limit of 100 photos. Remove one to add another.",
  failed: "Could not save the photo. Please try again.",
};

/** The one path the database accepts for a photo row (lower-case uuids, .jpg). */
export function photoPath(kind, userId, parentId, photoId) {
  return `${userId}/${KINDS[kind].folder}/${parentId}/${photoId}.jpg`;
}

/**
 * The photo rows of one completion or expense, oldest slot first.
 * @returns {Promise<{ id: string, storage_path: string, slot?: number }[]>}
 */
export async function listPhotos(kind, parentId) {
  const { parentColumn } = KINDS[kind];
  const columns = kind === "maintenance" ? "id, storage_path, slot" : "id, storage_path";
  const { data, error } = await photoTable(kind).select(columns).eq(parentColumn, parentId);
  if (error) throw error;
  return [...(data ?? [])].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

/** The first free slot (1-3) of a completion, or null when it already has 3. */
export function firstFreeSlot(photos) {
  const used = new Set(photos.map((photo) => photo.slot));
  for (let slot = 1; slot <= MAX_MAINTENANCE_PHOTOS; slot += 1) if (!used.has(slot)) return slot;
  return null;
}

/**
 * Adds a photo: re-encodes it, inserts the row, then uploads the file; if the
 * upload fails the row is deleted again.
 * @param {"maintenance" | "receipt"} kind
 * @param {{ userId: string, parentId: string, slot?: number, file: Blob, encode?: (file: Blob) => Promise<Blob> }} args
 * @returns {Promise<{ id: string, storage_path: string, slot?: number }>}
 */
export async function addPhoto(kind, { userId, parentId, slot, file, encode = reencodeToJpeg }) {
  const jpeg = await encode(file);
  const { parentColumn } = KINDS[kind];
  const id = crypto.randomUUID();
  const path = photoPath(kind, userId, parentId, id);
  const row = { id, user_id: userId, [parentColumn]: parentId, storage_path: path };
  if (kind === "maintenance") row.slot = slot;

  const { error: insertError } = await photoTable(kind).insert(row);
  if (insertError) {
    // The insert policy's 100-photo cap shows up as an RLS refusal.
    throw new Error(insertError.code === "42501" ? PHOTO_ERRORS.limit : PHOTO_ERRORS.failed);
  }

  const { error: uploadError } = await bucket().upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (uploadError) {
    await photoTable(kind).delete().eq("id", id);
    throw new Error(PHOTO_ERRORS.failed);
  }
  return kind === "maintenance" ? { id, storage_path: path, slot } : { id, storage_path: path };
}

/**
 * A short-lived URL for showing one photo in an <img>, or null when the file is
 * missing (a row whose upload never finished shows a "photo missing" placeholder).
 * @returns {Promise<string | null>}
 */
export async function getPhotoUrl(path) {
  const { data, error } = await bucket().createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Deletes a photo: the row first (which queues the file in the database), then
 * the file. A failed file delete is left to the backend's cleanup.
 * @returns {Promise<void>}
 * @throws the row delete's error.
 */
export async function deletePhoto(kind, photo) {
  const { error } = await photoTable(kind).delete().eq("id", photo.id);
  if (error) throw error;
  await bucket().remove([photo.storage_path]);
}
