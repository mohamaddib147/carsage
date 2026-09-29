// Sign Up / Log In screen — combined auth entry point per the wireframes.
// Handles both modes with one form, wired to Supabase Auth via useAuth().
// Layout matches docs/stitch_carsage_landing_page/carsage_sign_up_authentication:
// centered card, segmented Sign Up/Log In tab switcher, filled rounded
// inputs. Out-of-scope elements from that reference (VIN quick-add,
// marketing/trust footer) are intentionally omitted.
// Mentor feedback (no Jira task): adds a "Continue with Google" option —
// Apple/"Sign in with Apple" is left out for now, since it needs a paid
// Apple Developer account and extra setup before it can even work.

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { LIMITS, describeAuthError } from "../lib/limits.js";

/** The standard multi-color Google "G" mark, per Google's own Sign In
 * branding guidelines (developers.google.com/identity/branding-guidelines)
 * — required to be used as-is for a "Sign in with Google" button, unlike
 * a car manufacturer's logo (see theme/BrandBadge.jsx's own note), which
 * Google doesn't authorize third parties to use as their own branding. */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

/**
 * Combined Sign Up / Log In screen. Mode is determined by the route
 * (/signup vs /login); submitting calls Supabase Auth and either
 * redirects on success or shows a clear error message.
 * @returns {JSX.Element}
 */
function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signUp, signIn, signInWithGoogle, resetPasswordForEmail } = useAuth();

  const isSignUp = location.pathname === "/signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  // "auth" is the normal Sign Up / Log In form; "forgot" swaps in a
  // one-field "email a reset link" form (login mode only).
  const [mode, setMode] = useState("auth");

  /** Starts the Google redirect. Works the same for both Sign Up and Log
   * In — Supabase creates the account on first sign-in, same as any other
   * new user, so there's nothing mode-specific to do here. */
  async function handleGoogleClick() {
    setError("");
    setGoogleSubmitting(true);
    try {
      const { error: authError } = await signInWithGoogle();
      if (authError) {
        setError(describeAuthError(authError));
        setGoogleSubmitting(false);
      }
      // On success the page is about to navigate away to Google, so
      // there's nothing left to reset here.
    } catch {
      setError("Could not start Google sign-in. Please try again.");
      setGoogleSubmitting(false);
    }
  }

  /** @param {import('react').FormEvent} event */
  async function handleForgotPasswordSubmit(event) {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (!email.trim()) {
      setError("Enter your email address.");
      return;
    }

    setSubmitting(true);
    try {
      const { error: authError } = await resetPasswordForEmail(email.trim());
      if (authError) {
        setError(describeAuthError(authError));
        return;
      }
      // Never confirms whether the address has an account (GoTrue itself
      // doesn't reveal this), so the message is deliberately non-committal.
      setInfoMessage("If that email has an account, a reset link is on its way.");
    } finally {
      setSubmitting(false);
    }
  }

  /** @param {import('react').FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setInfoMessage("");

    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    // Supabase Auth enforces the same minimum on the server; catching it here
    // just saves a round trip. (Not applied to Log In: an existing account
    // must always be able to try its own password.)
    if (isSignUp && password.length < LIMITS.PASSWORD_MIN) {
      setError(`Password must be at least ${LIMITS.PASSWORD_MIN} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: authError } = isSignUp
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);

      if (authError) {
        // Supabase's raw wording can be technical (e.g. "Database error
        // saving new user"), so only known user-meant messages are passed on.
        setError(describeAuthError(authError));
        return;
      }

      if (isSignUp && !data.session) {
        // Email confirmation is required before the account can log in.
        setInfoMessage(
          "Account created. Check your email to confirm it before logging in.",
        );
        return;
      }

      const redirectTo = location.state?.from?.pathname ?? "/dashboard";
      navigate(redirectTo, { replace: true });
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

        <div className="auth-tabs">
          <Link
            to="/signup"
            className={`auth-tabs__tab${isSignUp ? " active" : ""}`}
            onClick={() => {
              setMode("auth");
              setError("");
              setInfoMessage("");
            }}
          >
            Sign Up
          </Link>
          <Link
            to="/login"
            className={`auth-tabs__tab${!isSignUp ? " active" : ""}`}
            onClick={() => {
              setMode("auth");
              setError("");
              setInfoMessage("");
            }}
          >
            Log In
          </Link>
        </div>

        {mode === "forgot" ? (
          <>
            <h1 className="auth-card__title">Reset your password</h1>
            <p className="auth-card__subtitle">
              Enter your account email and we&apos;ll send you a link to set a new password.
            </p>

            <form onSubmit={handleForgotPasswordSubmit} noValidate className="auth-card__form">
              <div className="form-field">
                <label htmlFor="forgotEmail">Email</label>
                <input
                  id="forgotEmail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={LIMITS.EMAIL}
                  placeholder="e.g. you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              {error && (
                <p role="alert" className="auth-form__error">
                  {error}
                </p>
              )}
              {infoMessage && (
                <p role="status" className="auth-form__info">
                  {infoMessage}
                </p>
              )}

              <button className="btn-primary auth-card__submit" type="submit" disabled={submitting}>
                Send reset link
                <span aria-hidden="true">→</span>
              </button>
            </form>

            <p className="auth-card__switch">
              <button
                type="button"
                className="auth-card__link-btn"
                onClick={() => {
                  setMode("auth");
                  setError("");
                  setInfoMessage("");
                }}
              >
                Back to Log In
              </button>
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-card__title">{isSignUp ? "Sign Up" : "Log In"}</h1>
            <p className="auth-card__subtitle">
              {isSignUp
                ? "Create an account to start tracking your cars."
                : "Log in to access your dashboard."}
            </p>

            <button
              type="button"
              className="auth-card__google-btn"
              onClick={handleGoogleClick}
              disabled={googleSubmitting || submitting}
            >
              <GoogleLogo />
              {googleSubmitting ? "Redirecting..." : `Continue with Google`}
            </button>

            <div className="auth-card__divider">
              <span>or</span>
            </div>

            <form onSubmit={handleSubmit} noValidate className="auth-card__form">
              <div className="form-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={LIMITS.EMAIL}
                  placeholder="e.g. you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <div className="form-field">
                <div className="form-field__label-row">
                  <label htmlFor="password">Password</label>
                  {!isSignUp && (
                    <button
                      type="button"
                      className="auth-card__link-btn"
                      onClick={() => {
                        setMode("forgot");
                        setError("");
                        setInfoMessage("");
                      }}
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="auth-card__password-row">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={isSignUp ? "new-password" : "current-password"}
                    placeholder={isSignUp ? `At least ${LIMITS.PASSWORD_MIN} characters` : "Your password"}
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

              {error && (
                <p role="alert" className="auth-form__error">
                  {error}
                </p>
              )}
              {infoMessage && (
                <p role="status" className="auth-form__info">
                  {infoMessage}
                </p>
              )}

              <button className="btn-primary auth-card__submit" type="submit" disabled={submitting}>
                {isSignUp ? "Sign Up" : "Log In"}
                <span aria-hidden="true">→</span>
              </button>
            </form>

            <p className="auth-card__switch">
              {isSignUp ? (
                <>
                  Already have an account? <Link to="/login">Log In</Link>
                </>
              ) : (
                <>
                  Need an account? <Link to="/signup">Sign Up</Link>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default AuthPage;
