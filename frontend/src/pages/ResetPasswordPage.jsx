// Set New Password screen (professional-polish pass, no Jira task) —
// where a "forgot password" email link lands (AuthContext.resetPasswordForEmail's
// redirectTo). Supabase's detectSessionInUrl (on by default) reads the
// recovery token in the URL and signs the browser into a short-lived
// recovery session before this page even mounts, the same mechanism the
// Google OAuth redirect already relies on — so useAuth().user is already
// set here, and updatePassword() just needs to call supabase.auth.updateUser.
// Not wrapped in <ProtectedRoute>: on a slow connection the recovery
// session may still be hydrating on first render, and ProtectedRoute would
// redirect to /login before it finishes instead of waiting it out.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { LIMITS, describeAuthError } from "../lib/limits.js";

/**
 * Lets someone who followed a password-reset email link set a new password.
 * @returns {JSX.Element}
 */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading, updatePassword } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  /** @param {import('react').FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (password.length < LIMITS.PASSWORD_MIN) {
      setError(`Password must be at least ${LIMITS.PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await updatePassword(password);
      if (authError) {
        setError(describeAuthError(authError));
        return;
      }
      setDone(true);
      setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-card__badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 11.5 12 4l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="auth-card__title">Set a new password</h1>

        {loading ? (
          <p className="auth-card__subtitle">Loading...</p>
        ) : !user ? (
          <p className="auth-card__subtitle">
            This reset link has expired or was already used. Request a new one from the Log In page.
          </p>
        ) : done ? (
          <p role="status" className="auth-form__info">
            Password updated. Taking you to your dashboard...
          </p>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="auth-card__form">
            <div className="form-field">
              <label htmlFor="newPassword">New password</label>
              <div className="auth-card__password-row">
                <input
                  id="newPassword"
                  name="newPassword"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder={`At least ${LIMITS.PASSWORD_MIN} characters`}
                  maxLength={LIMITS.PASSWORD_MAX}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="auth-card__password-toggle"
                  onClick={() => setShowPassword((previous) => !previous)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="confirmPassword">Confirm new password</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                maxLength={LIMITS.PASSWORD_MAX}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>

            {error && (
              <p role="alert" className="auth-form__error">
                {error}
              </p>
            )}

            <button className="btn-primary auth-card__submit" type="submit" disabled={submitting}>
              Set new password
              <span aria-hidden="true">→</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
