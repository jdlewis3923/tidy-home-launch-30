import { Navigate, useLocation } from "react-router-dom";

/**
 * Pure passthrough: /signup → /login (or /dashboard/plan once authed) with
 * the entire query string preserved. This carries:
 *   - service / plan        → preselect in the dashboard builder
 *   - bundle / services     → bundle preselect
 *   - custom                → route to custom-quote flow
 *   - utm_*, gclid, promo   → forwarded into Stripe metadata at checkout
 *
 * We intentionally do NOT strip or rename any params here. All consumers
 * downstream read what they need from window.location.search.
 */
const SignupRedirect = () => {
  const location = useLocation();
  const to = "/login" + location.search;
  return <Navigate to={to} replace />;
};

export default SignupRedirect;
