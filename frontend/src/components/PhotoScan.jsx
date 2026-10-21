// The AI Advisor's camera: a "Scan a photo" button that looks at ONE photo of a dashboard
// light, a lamp or a visible car problem (POST /ai-advisor/scan-photo) and hands the
// result to `onFinding`, which puts ONE sentence in the Advisor's input box for the
// user to edit. It never sends anything: the user presses Send, and the normal Advisor
// (with its recall check) takes it from there.
//
// The photo is resized in the browser first (lib/scanPhoto.js), read by Google's
// free-tier Gemini for that one request, and kept by nobody. The server returns either
// a sentence (a listed key's own text, or a cleaned short description for something
// else) or a plain message (not a car problem, can't tell, or the photo shows people, a
// plate or a document, in which case nothing at all is used). Three notices sit under
// the button: photograph only the part, the photo goes to Google's free tier where
// human reviewers may read it and CarSage doesn't keep it, and the result is a guess.

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext.jsx";
import { describeApiFetchError } from "../lib/limits.js";
import { GEMINI_PRIVACY_NOTICE } from "../lib/geminiPrivacyNotice.js";
import { getPhotoFileError } from "../lib/photoReencode.js";
import { scanPhoto } from "../lib/scanPhoto.js";

export const PHOTO_SCAN_HINT = "Photograph only the part with the problem: no people, license plates, VINs or documents.";
export const PHOTO_SCAN_GUESS_NOTE = "The result is a guess. Edit it before you send.";
export const LOW_CONFIDENCE_NOTE = "Low confidence: check this sentence carefully before you send it.";

/**
 * @param {{ onFinding: (finding: { sentence: string, kind: "listed" | "other", confidence: "low" | "medium" | "high" }) => void,
 *   disabled?: boolean }} props
 * @returns {JSX.Element}
 */
function PhotoScan({ onFinding, disabled = false }) {
  const { session } = useAuth();
  const inputRef = useRef(null);
  const mountedRef = useRef(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // A plain message from the server (not a car problem, can't tell, retake) or a low-confidence note.
  const [note, setNote] = useState("");

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
    setNote("");
    const clientError = getPhotoFileError(file);
    if (clientError) {
      setError(clientError);
      return;
    }

    setLoading(true);
    try {
      const result = await scanPhoto("/ai-advisor/scan-photo", file, session?.access_token);
      if (!mountedRef.current) return;
      if ((result.kind === "listed" || result.kind === "other") && result.sentence) {
        onFinding({ sentence: result.sentence, kind: result.kind, confidence: result.confidence ?? "low" });
        if ((result.confidence ?? "low") === "low") setNote(LOW_CONFIDENCE_NOTE);
        return;
      }
      setNote(result.message || "Couldn't tell what that is. Describe it in words instead.");
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
        htmlFor="scanPhotoFile"
      >
        {loading ? "Reading..." : "Scan a photo"}
      </label>
      <input
        id="scanPhotoFile"
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
          Reading the photo...
        </p>
      )}
      {error && (
        <p role="alert" className="auth-form__error">
          {error}
        </p>
      )}
      {note && (
        <p role="status" className="form-hint">
          {note}
        </p>
      )}
      <p className="advisor-scan__note">{PHOTO_SCAN_HINT}</p>
      <p className="camera-privacy-note advisor-scan__note">{GEMINI_PRIVACY_NOTICE}</p>
      <p className="advisor-scan__note">{PHOTO_SCAN_GUESS_NOTE}</p>
    </div>
  );
}

export default PhotoScan;
