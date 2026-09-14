// Sign Up / Log In screen — combined auth entry point per the wireframes.
// Real Supabase Auth wiring (form handling, validation, session) is a
// separate later task; this is routing + layout only.

import { useLocation } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";

/**
 * Placeholder for the combined Sign Up / Log In screen.
 * @returns {JSX.Element}
 */
function AuthPage() {
  const location = useLocation();
  const mode = location.pathname === "/signup" ? "Sign Up" : "Log In";

  return (
    <PageShell
      title={mode}
      description="Authentication form will go here (Supabase Auth)."
    />
  );
}

export default AuthPage;
