import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CUSTOMER_DASHBOARD_ENABLED } from "@/lib/dashboard-config";
import Index from "./pages/Index.tsx";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
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

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
