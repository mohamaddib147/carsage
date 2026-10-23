// Shared browser-side photo preparation: every photo the app sends or stores (the
// Fuel Log and Maintenance camera scans, the Advisor's warning-light scan, and the
// maintenance/expense photos) is first re-encoded here, in the browser:
//   - drawn on a canvas at most MAX_EDGE_PX on its longest side, saved as a JPEG
//     under MAX_UPLOAD_BYTES, so a 48 MP phone photo is small before it leaves the
//     phone (and is never refused by the server's 40-megapixel ceiling);
//   - a canvas keeps only pixels, so EXIF data, including GPS location, is dropped.
// This module only touches the photo itself: no network, no storage.

export const MAX_EDGE_PX = 1600;
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
// Before re-encoding: a generous cap so a huge file is refused without decoding it.
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const JPEG_QUALITIES = [0.85, 0.75, 0.6, 0.45];

export const PHOTO_FILE_ERRORS = {
  notImage: "Please choose a photo (JPEG, PNG, WEBP or HEIC).",
  tooBig: "That file is too large. Please choose a photo under 25 MB.",
  unreadable: "Couldn't read that photo. Please try another one.",
};

/**
 * Client-side pre-check before decoding.
 * @param {File} file
 * @returns {string} an error message, or "".
 */
export function getPhotoFileError(file) {
  if (!String(file.type).startsWith("image/")) return PHOTO_FILE_ERRORS.notImage;
  if (file.size === 0) return PHOTO_FILE_ERRORS.unreadable;
  if (file.size > MAX_SOURCE_BYTES) return PHOTO_FILE_ERRORS.tooBig;
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
 * @throws {Error} with PHOTO_FILE_ERRORS.unreadable if the browser can't decode it.
 */
export async function reencodeToJpeg(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(PHOTO_FILE_ERRORS.unreadable);
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
  throw new Error(PHOTO_FILE_ERRORS.unreadable);
}
