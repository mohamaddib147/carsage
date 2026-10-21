// The AI Advisor's camera: a "Scan a warning light" button that reads a photo of a
// dashboard warning light (POST /ai-advisor/scan-warning-light) and hands ONE fixed
// sentence (e.g. "The brake warning light is on.") to `onSentence`, which puts it in
// the Advisor's input box for the user to edit. It never sends anything: the user
// presses Send, and the normal Advisor (with its recall check) takes it from there.
//
// The photo is resized in the browser first (lib/scanPhoto.js), read by Google's
// free-tier Gemini for that one request, and kept by nobody. The server only ever
// returns a key from a fixed list or "unknown", so the sentence is our own text,
// never words from the photo. Three notices sit under the button: photograph only
// the light, the photo goes to Google's free tier and CarSage doesn't keep it, and
// the result is a guess to edit.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { describeApiFetchError } from "../lib/limits.js";
import { GEMINI_PRIVACY_NOTICE } from "../lib/geminiPrivacyNotice.js";
import { getPhotoFileError } from "../lib/photoReencode.js";
import { scanPhoto } from "../lib/scanPhoto.js";

export const WARNING_LIGHT_HINT = "Photograph only the warning light: no people, license plates, VINs or documents.";
export const WARNING_LIGHT_GUESS_NOTE = "The result is a guess. Edit it before you send.";
const UNKNOWN_LIGHT = "Couldn't tell which light that is. Describe it in words instead.";

/**
 * @param {{ onSentence: (sentence: string) => void, disabled?: boolean }} props
 * @returns {JSX.Element}
 */
function WarningLightScan({ onSentence, disabled = false }) {
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
      const result = await scanPhoto("/ai-advisor/scan-warning-light", file, session?.access_token);
      if (!mountedRef.current) return;
      if (!result.sentence) {
        setError(UNKNOWN_LIGHT);
        return;
      }
      onSentence(result.sentence);
    } catch (caught) {
      if (mountedRef.current) setError(describeApiFetchError(caught));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  const unavailable = disabled || loading;
  return (
    <div className="advisor-scan">
      <label
        className={`btn-secondary advisor-scan__btn${unavailable ? " advisor-scan__btn--disabled" : ""}`}
        htmlFor="scanWarningLightFile"
      >
        {loading ? "Reading..." : "Scan a warning light"}
      </label>
      <input
        id="scanWarningLightFile"
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        disabled={unavailable}
        onChange={handleFile}
      />
      {loading && (
        <p role="status" className="form-hint">
          Reading the warning light...
        </p>
      )}
      {error && (
        <p role="alert" className="auth-form__error">
          {error}
        </p>
      )}
      <p className="advisor-scan__note">{WARNING_LIGHT_HINT}</p>
      <p className="camera-privacy-note advisor-scan__note">{GEMINI_PRIVACY_NOTICE}</p>
      <p className="advisor-scan__note">{WARNING_LIGHT_GUESS_NOTE}</p>
    </div>
  );
}

export default WarningLightScan;
