import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { useEffect, lazy, Suspense } from "react";
import { HelmetProvider } from "react-helmet-async";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import { capturePromoFromUrl } from "@/lib/promo";
import { captureUtmFromUrl } from "@/lib/utm";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import RouteFallback from "@/components/RouteFallback";
import { MetaPixel } from "@/components/marketing/MetaPixel";
import ChatbotMount from "@/components/chatbot/ChatbotMount";

// Eager: homepage, terms/privacy, NotFound (small + always-needed)
import Index from "./pages/Index.tsx";
import Terms from "./pages/Terms.tsx";
import Privacy from "./pages/Privacy.tsx";
import NotFound from "./pages/NotFound.tsx";
import SignupRedirect from "./pages/SignupRedirect.tsx";
import ReferralRedirect from "./pages/ReferralRedirect.tsx";
import ThankYou from "./pages/ThankYou.tsx";

// Lazy: landing pages, auth, dashboard, checkout flows
const HouseCleaning = lazy(() => import("./pages/HouseCleaning.tsx"));
const LawnCare = lazy(() => import("./pages/LawnCare.tsx"));
const CarDetailing = lazy(() => import("./pages/CarDetailing.tsx"));
const Bundle = lazy(() => import("./pages/Bundle.tsx"));
const Refer = lazy(() => import("./pages/Refer.tsx"));
const CustomerLogin = lazy(() => import("./pages/CustomerLogin.tsx"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const DashboardIndex = lazy(() => import("./pages/DashboardIndex.tsx"));
const DashboardPlan = lazy(() => import("./pages/DashboardPlan.tsx"));
const DashboardConfirmation = lazy(() => import("./pages/DashboardConfirmation.tsx"));
const Account = lazy(() => import("./pages/Account.tsx"));
const Billing = lazy(() => import("./pages/Billing.tsx"));
const Help = lazy(() => import("./pages/Help.tsx"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess.tsx"));
const CheckoutCanceled = lazy(() => import("./pages/CheckoutCanceled.tsx"));
const AdminSetupCatalog = lazy(() => import("./pages/AdminSetupCatalog.tsx"));
const AdminTestZapier = lazy(() => import("./pages/AdminTestZapier.tsx"));
const AdminHealth = lazy(() => import("./pages/AdminHealth.tsx"));
const AdminChatbotKnowledge = lazy(() => import("./pages/AdminChatbotKnowledge.tsx"));
const AdminInbox = lazy(() => import("./pages/AdminInbox.tsx"));
const AdminSchedule = lazy(() => import("./pages/AdminSchedule.tsx"));
const AdminKpis = lazy(() => import("./pages/AdminKpis.tsx"));

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
const QueryPreservingRedirect = ({ to }: { to: string }) => {
  const location = useLocation();
  return <Navigate to={to + location.search} replace />;
};

// Single source of truth for SPA page_view dataLayer events.
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
            <MetaPixel />
            <ChatbotMount />
            <RouteTracker>
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  {/* Google Ads landing pages */}
                  <Route path="/house-cleaning" element={<HouseCleaning />} />
                  <Route path="/lawn-care" element={<LawnCare />} />
                  <Route path="/car-detailing" element={<CarDetailing />} />
                  <Route path="/bundle" element={<Bundle />} />

                  {/* Short-slug aliases → canonical landing pages */}
                  <Route path="/cleaning" element={<QueryPreservingRedirect to="/house-cleaning" />} />
                  <Route path="/lawn" element={<QueryPreservingRedirect to="/lawn-care" />} />
                  <Route path="/detail" element={<QueryPreservingRedirect to="/car-detailing" />} />

                  <Route path="/signup" element={<SignupRedirect />} />
                  <Route path="/referral" element={<ReferralRedirect />} />
                  <Route path="/refer" element={<Refer />} />
                  <Route path="/thank-you" element={<ThankYou />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacy />} />

                  {/* Customer Dashboard System */}
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

                  <Route path="/account" element={<Account />} />
                  <Route path="/billing" element={<Billing />} />
                  <Route
                    path="/help"
                    element={CUSTOMER_DASHBOARD_ENABLED ? <Help /> : <Navigate to="/" replace />}
                  />
                  <Route path="/checkout/success" element={<CheckoutSuccess />} />
                  <Route path="/checkout/canceled" element={<CheckoutCanceled />} />

                  {/* Phase 2 one-time admin bootstrap. Remove after use. */}
                  <Route path="/admin/setup-catalog" element={<AdminSetupCatalog />} />
                  {/* Phase 6 Zapier event tester. Remove after wiring complete. */}
                  <Route path="/admin/test-zapier" element={<AdminTestZapier />} />
                  {/* Phase 8 integration health dashboard. */}
                  <Route path="/admin/health" element={<AdminHealth />} />
                  {/* Chatbot knowledge editor (admins only). */}
                  <Route path="/admin/chatbot-knowledge" element={<AdminChatbotKnowledge />} />
                  {/* Unified support inbox (SMS + web), admins only. */}
                  <Route path="/admin/inbox" element={<AdminInbox />} />
                  {/* Social media auto-poster (IG + FB), admins only. */}
                  <Route path="/admin/schedule" element={<AdminSchedule />} />
                  {/* Permanent KPI Command Center — admins only. */}
                  <Route path="/admin/kpis" element={<AdminKpis />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </RouteTracker>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
