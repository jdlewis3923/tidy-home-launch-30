import { Navigate, useLocation } from "react-router-dom";

/**
 * Pure passthrough: /referral → / (homepage) with query string preserved.
 * Allows external referral links like /referral?promo=TESTA-X1Y2 to land
 * on the homepage with the promo code captured.
 */
const ReferralRedirect = () => {
  const location = useLocation();
  const to = "/" + location.search;
  return <Navigate to={to} replace />;
};

export default ReferralRedirect;
