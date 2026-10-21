// Guards a route: redirects logged-out users to /login, preserving where
// they were headed so login can send them back. While the initial session
// check is still in flight it shows the page-shaped loading skeleton (CAR-74;
// it used to render nothing, so the footer painted at the top of an empty page
// and then jumped), never the protected page and never a redirect.

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import RouteLoading from "./RouteLoading.jsx";

/**
 * Renders `children` only when a user is logged in; otherwise redirects to /login.
 * @param {{ children: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <RouteLoading />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default ProtectedRoute;
