// Holds the current Supabase auth session in React context so any
// component can read who's logged in, and exposes sign up / log in /
// log out actions. Session persistence across page refresh is handled by
// supabase-js itself (it stores the session in localStorage); this
// context just re-hydrates from it on mount via getSession().

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

  async function signOut() {
    return supabase.auth.signOut();
  }

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signUp,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

/**
 * Reads the current auth context. Must be used within an <AuthProvider>.
 * @returns {{ session: object|null, user: object|null, loading: boolean, signUp: Function, signIn: Function, signOut: Function }}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
