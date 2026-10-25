// A "Scan odometer" button for a km field outside the Fuel Log (Maintenance's Mark as
// done form and its item form): reads a photo of the odometer through the same
// backend reader and shared daily camera cap as the Fuel Log's scan
// (POST /fuel-log/scan-odometer), and hands the reading to `onReading` so the page
// FILLS the field for the user to review. It never saves anything. The photo is
// resized in the browser first (lib/scanPhoto.js), read for that one request, and
// kept by nobody. The Google free-tier notice sits right under the button.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { describeApiFetchError } from "../lib/limits.js";
import { GEMINI_PRIVACY_NOTICE } from "../lib/geminiPrivacyNotice.js";
import { getPhotoFileError } from "../lib/photoReencode.js";
import { scanPhoto } from "../lib/scanPhoto.js";

const UNREADABLE = "Couldn't read that as an odometer display. Try a clearer photo, or enter it manually.";

/**
 * @param {{ id: string, label?: string, onReading: (km: string) => void }} props
 *   `id` is unique per button on the page; `label` names what the reading is for
 *   (used in the control's accessible name); `onReading` gets the km as raw digits.
 * @returns {JSX.Element}
 */
function OdometerScanButton({ id, label = "", onReading }) {
  const { session } = useAuth();
  const inputRef = useRef(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;

    setError("");
    const clientError = getPhotoFileError(file);
    if (clientError) {
      setError(clientError);
      return;
    }

    setLoading(true);
    try {
      const result = await scanPhoto("/fuel-log/scan-odometer", file, session?.access_token);
      if (!mountedRef.current) return;
      if (!result.readable || result.odometer_km == null) {
        setError(UNREADABLE);
        return;
      }
      onReading(String(result.odometer_km));
    } catch (caught) {
      if (mountedRef.current) setError(describeApiFetchError(caught));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <div className="odometer-scan">
      <label className="maintenance-link-btn odometer-scan__btn" htmlFor={id}>
        {loading ? "Reading..." : "Scan odometer"}
      </label>
      <input
        id={id}
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={loading}
        aria-label={`Scan the odometer${label ? ` for ${label}` : ""}`}
        onChange={handleFile}
      />
      {loading && (
        <p role="status" className="form-hint">
          Reading odometer photo...
        </p>
      )}
      {error && (
        <p role="alert" className="auth-form__error">
          {error}
        </p>
      )}
      <p className="camera-privacy-note odometer-scan__note">{GEMINI_PRIVACY_NOTICE}</p>
    </div>
  );
}

export default OdometerScanButton;
