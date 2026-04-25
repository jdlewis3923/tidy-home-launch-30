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
  // Send users straight into the START MY PLAN builder. No login wall.
  // Query string (promo, utm_*, gclid, service, plan, bundle, services, custom)
  // is preserved verbatim — PromoCaptureWatcher + DashboardPlan's preselect
  // effect read from it, and captured promo/UTM forward into Stripe metadata.
  const to = "/dashboard/plan" + location.search;
  return <Navigate to={to} replace />;
};

export default SignupRedirect;
