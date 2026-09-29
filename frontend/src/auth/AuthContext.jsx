// Holds the current Supabase auth session in React context so any
// component can read who's logged in, and exposes sign up / log in /
// Google sign-in / log out actions. Session persistence across page
// refresh is handled by supabase-js itself (it stores the session in
// localStorage); this context just re-hydrates from it on mount via
// getSession() — including after Google's OAuth redirect back to the
// app, which supabase-js also picks up automatically (detectSessionInUrl,
// on by default) and surfaces through this same onAuthStateChange
// listener, no separate handling needed here.

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";

const AuthContext = createContext(undefined);

/**
 * Provides auth state (session, user, loading) and auth actions
 * (signUp, signIn, signOut) to the component tree below it.
 * @param {{ children: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  /**
   * Creates a new account. The `profiles` row is auto-created by the
   * `on_auth_user_created` DB trigger — nothing to do here beyond signUp.
   * @param {string} email
   * @param {string} password
   */
  async function signUp(email, password) {
    return supabase.auth.signUp({ email, password });
  }

  /** @param {string} email @param {string} password */
  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
  }

  /**
   * Starts the Google OAuth sign-in/sign-up flow (mentor feedback, no Jira
   * task). Supabase redirects the whole page to Google and back — there's
   * no local session to return here, just the redirect itself; the caller
   * (AuthPage) only needs to surface an error if the redirect couldn't
   * even start (e.g. Google isn't configured as a provider yet). A first-
   * time Google sign-in still gets its `profiles` row from the same
   * `on_auth_user_created` trigger signUp() relies on — it reads
   * `auth.users.email`/`raw_user_meta_data`, which Supabase populates the
   * same way for an OAuth identity as for an email/password one.
   */
  async function signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });
  }

  async function signOut() {
    return supabase.auth.signOut();
  }

  /**
   * Sends a password-reset email (professional-polish pass, no Jira task).
   * Supabase's GoTrue never reveals whether the address has an account —
   * this resolves the same way either way, so the caller can't be used to
   * enumerate registered emails.
   * @param {string} email
   */
  async function resetPasswordForEmail(email) {
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
  }

  /**
   * Sets a new password for the signed-in user. Only meaningful right after
   * following a reset-password email link, which signs the browser into a
   * short-lived recovery session (supabase-js's detectSessionInUrl picks
   * this up the same way it does a Google OAuth redirect).
   * @param {string} password
   */
  async function updatePassword(password) {
    return supabase.auth.updateUser({ password });
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPasswordForEmail,
    updatePassword,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

/**
 * The single "who is looking at this page?" check for UI that changes with
 * sign-in state (header controls, nav links, landing-page CTAs). Derived
 * from the real Supabase session held by <AuthProvider>. `status` is
 * "loading" until the first getSession() call resolves — callers must not
 * treat that as logged out, or a signed-in visitor would briefly see the
 * logged-out UI on every page load.
 * @returns {{ status: "loading" | "signedIn" | "signedOut", user: object|null, signOut: Function }}
 */
export function useAuthStatus() {
  const { user, loading, signOut } = useAuth();
  const status = loading ? "loading" : user ? "signedIn" : "signedOut";
  return { status, user, signOut };
}

/**
 * Reads the current auth context. Must be used within an <AuthProvider>.
 * @returns {{ session: object|null, user: object|null, loading: boolean, signUp: Function, signIn: Function, signInWithGoogle: Function, signOut: Function, resetPasswordForEmail: Function, updatePassword: Function }}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
