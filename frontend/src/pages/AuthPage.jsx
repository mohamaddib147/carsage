// Sign Up / Log In screen — combined auth entry point per the wireframes.
// Handles both modes with one form, wired to Supabase Auth via useAuth().
// Layout matches docs/stitch_carsage_landing_page/carsage_sign_up_authentication:
// centered card, segmented Sign Up/Log In tab switcher, filled rounded
// inputs. Out-of-scope elements from that reference (Google/Apple SSO,
// VIN quick-add, marketing/trust footer) are intentionally omitted.

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { LIMITS, describeAuthError } from "../lib/limits.js";

/**
 * Combined Sign Up / Log In screen. Mode is determined by the route
 * (/signup vs /login); submitting calls Supabase Auth and either
 * redirects on success or shows a clear error message.
 * @returns {JSX.Element}
 */
function AuthPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signUp, signIn } = useAuth();

  const isSignUp = location.pathname === "/signup";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
          >
            Sign Up
          </Link>
          <Link
            to="/login"
            className={`auth-tabs__tab${!isSignUp ? " active" : ""}`}
          >
            Log In
          </Link>
        </div>

        <h1 className="auth-card__title">{isSignUp ? "Sign Up" : "Log In"}</h1>
        <p className="auth-card__subtitle">
          {isSignUp
            ? "Create an account to start tracking your cars."
            : "Log in to access your dashboard."}
        </p>

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
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              placeholder={isSignUp ? `At least ${LIMITS.PASSWORD_MIN} characters` : "Your password"}
              maxLength={LIMITS.PASSWORD_MAX}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
      </div>
    </div>
  );
}

export default AuthPage;
