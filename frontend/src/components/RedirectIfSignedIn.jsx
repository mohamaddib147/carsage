// Wraps /login and /signup only (CAR-71): a signed-in user who opens either
// is sent (replace, so Back doesn't loop) to the same place a successful
// log-in goes. Never used on /reset-password: a Supabase recovery link
// signs the browser in, and that user must still reach the reset form.
//
// While the first session check is still running nothing redirects, and the
// form stays mounted in place but invisible and inert: a signed-in user never
// sees a flash of the login form, and a signed-out one sees it appear without
// the layout moving.

import { Navigate, useLocation } from "react-router-dom";
import { useAuthStatus } from "../auth/AuthContext.jsx";
import { loginDestination } from "../auth/loginDestination.js";

/**
 * Renders `children` for signed-out visitors; redirects signed-in ones.
 * @param {{ children: import('react').ReactNode }} props
 * @returns {JSX.Element}
 */
function RedirectIfSignedIn({ children }) {
  const { status } = useAuthStatus();
  const location = useLocation();

  if (status === "signedIn") {
    return <Navigate to={loginDestination(location)} replace />;
  }

  // The same wrapper in both states, so the form isn't remounted when the check ends.
  const pending = status === "loading";
  return (
    <div style={{ display: "contents", visibility: pending ? "hidden" : undefined }} inert={pending}>
      {children}
    </div>
  );
}

export default RedirectIfSignedIn;
