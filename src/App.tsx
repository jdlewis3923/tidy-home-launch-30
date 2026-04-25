import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { capturePromoFromUrl } from "@/lib/promo";
import { captureUtmFromUrl } from "@/lib/utm";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import Index from "./pages/Index.tsx";
import HouseCleaning from "./pages/HouseCleaning.tsx";
import LawnCare from "./pages/LawnCare.tsx";
import CarDetailing from "./pages/CarDetailing.tsx";
import Bundle from "./pages/Bundle.tsx";
import ThankYou from "./pages/ThankYou.tsx";
import Terms from "./pages/Terms.tsx";
import Privacy from "./pages/Privacy.tsx";
import NotFound from "./pages/NotFound.tsx";
import CustomerLogin from "./pages/CustomerLogin.tsx";
import ForgotPassword from "./pages/ForgotPassword.tsx";
import ResetPassword from "./pages/ResetPassword.tsx";
import DashboardIndex from "./pages/DashboardIndex.tsx";
import DashboardPlan from "./pages/DashboardPlan.tsx";
import DashboardConfirmation from "./pages/DashboardConfirmation.tsx";
import Account from "./pages/Account.tsx";
import Billing from "./pages/Billing.tsx";
import CheckoutSuccess from "./pages/CheckoutSuccess.tsx";
import CheckoutCanceled from "./pages/CheckoutCanceled.tsx";
import SignupRedirect from "./pages/SignupRedirect.tsx";
import ReferralRedirect from "./pages/ReferralRedirect.tsx";
import Refer from "./pages/Refer.tsx";

const queryClient = new QueryClient();

// Captures `?promo=CODE` (first-wins) and UTM/gclid params on every route change.
const PromoCaptureWatcher = () => {
  const location = useLocation();
  useEffect(() => {
    capturePromoFromUrl();
    captureUtmFromUrl();
  }, [location.pathname, location.search]);
  return null;
};

// Query-preserving redirect used for short-slug aliases like /cleaning → /house-cleaning.
// React Router's <Navigate to=...> drops the search string by default; we forward it
// verbatim so attribution params (?promo, utm_*, gclid) survive the redirect.
const QueryPreservingRedirect = ({ to }: { to: string }) => {
  const location = useLocation();
  return <Navigate to={to + location.search} replace />;
};

// Single source of truth for SPA page_view dataLayer events.
// Mounted once inside <BrowserRouter> so every route change (incl. initial load)
// pushes one and only one page_view to GTM. Replaces per-page duplicates.
const RouteTracker = ({ children }: { children: React.ReactNode }) => {
  usePageViewTracking();
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <PromoCaptureWatcher />
            <RouteTracker>
              <Routes>
                <Route path="/" element={<Index />} />
                {/* Google Ads landing pages — same project, same domain. */}
                <Route path="/house-cleaning" element={<HouseCleaning />} />
                <Route path="/lawn-care" element={<LawnCare />} />
                <Route path="/car-detailing" element={<CarDetailing />} />
                <Route path="/bundle" element={<Bundle />} />

                {/* Short-slug aliases → canonical landing pages. SPA <Navigate replace>
                    keeps the query string and emits a single history entry; combined
                    with our SPA fallback this behaves as a permanent redirect for
                    crawlers (no soft-404, canonical tag on target page does the rest). */}
                <Route path="/cleaning" element={<QueryPreservingRedirect to="/house-cleaning" />} />
                <Route path="/lawn" element={<QueryPreservingRedirect to="/lawn-care" />} />
                <Route path="/detail" element={<QueryPreservingRedirect to="/car-detailing" />} />

                <Route path="/signup" element={<SignupRedirect />} />
                {/* /referral remains a query-preserving passthrough to homepage so
                    legacy ?promo=... links keep working. /refer is the new public
                    marketing page for the existing referral coupon. */}
                <Route path="/referral" element={<ReferralRedirect />} />
                <Route path="/refer" element={<Refer />} />
                <Route path="/thank-you" element={<ThankYou />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacy />} />

                {/* Customer Dashboard System — controlled by CUSTOMER_DASHBOARD_ENABLED */}
                <Route
                  path="/login"
                  element={CUSTOMER_DASHBOARD_ENABLED ? <CustomerLogin /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/forgot-password"
                  element={CUSTOMER_DASHBOARD_ENABLED ? <ForgotPassword /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/reset-password"
                  element={CUSTOMER_DASHBOARD_ENABLED ? <ResetPassword /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/dashboard"
                  element={CUSTOMER_DASHBOARD_ENABLED ? <DashboardIndex /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/dashboard/plan"
                  element={CUSTOMER_DASHBOARD_ENABLED ? <DashboardPlan /> : <Navigate to="/" replace />}
                />
                <Route
                  path="/dashboard/confirmation"
                  element={CUSTOMER_DASHBOARD_ENABLED ? <DashboardConfirmation /> : <Navigate to="/" replace />}
                />

                {/* Stripe / customer account scaffolding —
                    gated internally by CUSTOMER_ACCOUNT_ENABLED + STRIPE_INTEGRATION_ENABLED.
                    Pre-launch: /account and /billing self-redirect to /.
                    Checkout success/cancel pages are always reachable so Stripe
                    returns never 404. */}
                <Route path="/account" element={<Account />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/checkout/success" element={<CheckoutSuccess />} />
                <Route path="/checkout/canceled" element={<CheckoutCanceled />} />

                <Route path="*" element={<NotFound />} />
              </Routes>
            </RouteTracker>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
