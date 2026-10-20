// Step 3: photos attached to a maintenance completion (up to 3) or an expense
// (one receipt). STORED ONLY: they go to the private `record-photos` bucket and
// are never sent to the backend, Gemini or any other service — this module only
// talks to Supabase Storage and the two photo tables, and a source-scan test
// (recordPhotos.test.js) fails if it ever imports the API client or calls fetch.
//
// - Every photo is re-encoded in the browser first: drawn on a canvas at most
//   MAX_EDGE_PX on its longest side and saved as a JPEG under MAX_UPLOAD_BYTES.
//   A canvas keeps only pixels, so EXIF data, including GPS location, is dropped.
// - Row first, then file (the bucket only accepts a file whose row already
//   exists, docs/db_migrations/2026-10-21_record_photos_storage.sql); if the
//   upload fails, the row is deleted again.
// - A photo is shown only through a signed URL that expires after
//   SIGNED_URL_TTL_SECONDS, never a permanent link to the file.
// - Deleting removes the row, then the file. If the file delete fails, the
//   database has already queued the path and the backend removes it later.

import { supabase } from "./supabaseClient.js";

export const MAX_EDGE_PX = 1600;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 300;
export const MAX_MAINTENANCE_PHOTOS = 3;
// Before re-encoding: a generous cap so a huge file is refused without decoding it.
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const JPEG_QUALITIES = [0.85, 0.75, 0.6, 0.45];

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
  notImage: "Please choose a photo (JPEG, PNG, WEBP or HEIC).",
  tooBig: "That file is too large. Please choose a photo under 25 MB.",
  unreadable: "Couldn't read that photo. Please try another one.",
  limit: "You've reached the limit of 100 photos. Remove one to add another.",
  failed: "Could not save the photo. Please try again.",
};

/**
 * Client-side pre-check before decoding.
 * @param {File} file
 * @returns {string} an error message, or "".
 */
export function getRecordPhotoError(file) {
  if (!String(file.type).startsWith("image/")) return PHOTO_ERRORS.notImage;
  if (file.size === 0) return PHOTO_ERRORS.unreadable;
  if (file.size > MAX_SOURCE_BYTES) return PHOTO_ERRORS.tooBig;
  return "";
}

/** Width and height scaled so the longest side is at most `maxEdge`. */
export function fitWithin(width, height, maxEdge = MAX_EDGE_PX) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Re-encodes a photo to a JPEG at most MAX_EDGE_PX on its longest side and under
 * MAX_UPLOAD_BYTES, lowering the quality (then the size) until it fits. The
 * output has no EXIF, so no location data.
 * @param {Blob} file
 * @returns {Promise<Blob>}
 * @throws {Error} with PHOTO_ERRORS.unreadable if the browser can't decode it.
 */
export async function reencodeToJpeg(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(PHOTO_ERRORS.unreadable);
  }
  try {
    for (const edge of [MAX_EDGE_PX, 1200]) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
      }
    }
  } finally {
    bitmap.close?.();
  }
  throw new Error(PHOTO_ERRORS.unreadable);
}

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
