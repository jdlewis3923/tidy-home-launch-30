import { Navigate, useLocation } from "react-router-dom";

/**
 * Pure passthrough: /signup → /login with query string preserved.
 * Allows legacy/external links to /signup?promo=CODE to land on
 * /login?promo=CODE so the promo capture hook fires on the destination.
 */
const SignupRedirect = () => {
  const location = useLocation();
  const to = "/login" + location.search;
  return <Navigate to={to} replace />;
};

export default SignupRedirect;
