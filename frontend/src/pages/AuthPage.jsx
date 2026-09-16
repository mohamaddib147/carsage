// Sign Up / Log In screen — combined auth entry point per the wireframes.
// Handles both modes with one form, wired to Supabase Auth via useAuth().

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

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

    setSubmitting(true);
    try {
      const { data, error: authError } = isSignUp
        ? await signUp(email.trim(), password)
        : await signIn(email.trim(), password);

      if (authError) {
        setError(authError.message);
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
    <PageShell
      title={isSignUp ? "Sign Up" : "Log In"}
      description={
        isSignUp
          ? "Create an account to start tracking your cars."
          : "Log in to access your dashboard."
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
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

        <button className="btn-primary" type="submit" disabled={submitting}>
          {isSignUp ? "Sign Up" : "Log In"}
        </button>
      </form>

      {isSignUp ? (
        <p>
          Already have an account? <Link to="/login">Log In</Link>
        </p>
      ) : (
        <p>
          Need an account? <Link to="/signup">Sign Up</Link>
        </p>
      )}
    </PageShell>
  );
}

export default AuthPage;
