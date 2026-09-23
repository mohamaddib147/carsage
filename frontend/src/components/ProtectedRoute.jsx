// Guards a route: redirects logged-out users to /login, preserving where
// they were headed so login can send them back. Renders nothing while
// the initial session check is still in flight, to avoid a flash of the
// protected page before we know whether the user is authenticated.

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

/**
 * Renders `children` only when a user is logged in; otherwise redirects to /login.
 * @param {{ children: import('react').ReactNode }} props
 * @returns {JSX.Element|null}
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
