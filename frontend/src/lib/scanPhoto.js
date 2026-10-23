// Sends one photo to a camera-scan endpoint (POST /fuel-log/scan-pump,
// /fuel-log/scan-odometer, /ai-advisor/scan-warning-light): the photo is re-encoded
// in the browser first (lib/photoReencode.js: at most 1600 px, a JPEG under 2 MB,
// no location data), then sent as a multipart upload. The backend reads it for that
// one request and keeps nothing; the caller fills a form for the user to review and
// never saves anything from a scan on its own.

import { apiFetch } from "./apiClient.js";
import { reencodeToJpeg } from "./photoReencode.js";

/**
 * @param {string} path - the scan endpoint, e.g. "/fuel-log/scan-odometer".
 * @param {File} file - the photo the user picked.
 * @param {string | undefined} accessToken
 * @param {{ encode?: (file: Blob) => Promise<Blob> }} [options]
 * @returns {Promise<object>} the endpoint's JSON reply.
 * @throws {Error} with a plain message (an unreadable photo, or the backend's own).
 */
export async function scanPhoto(path, file, accessToken, { encode = reencodeToJpeg } = {}) {
  const jpeg = await encode(file);
  const formData = new FormData();
  formData.append("file", jpeg, "photo.jpg");
  return apiFetch(path, { method: "POST", body: formData, accessToken });
}
