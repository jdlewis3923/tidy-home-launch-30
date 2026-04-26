import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  CUSTOMER_ACCOUNT_ENABLED,
  STRIPE_INTEGRATION_ENABLED,
} from "@/lib/dashboard-config";
import {
  STRIPE_FUNCTIONS,
  getBillingReturnUrl,
} from "@/lib/stripe-config";
import { supabase } from "@/integrations/supabase/client";

/**
 * /billing — Billing management entry point.
 *
 * Pre-launch (CUSTOMER_ACCOUNT_ENABLED = false): redirects to homepage.
 * Post-launch + Stripe enabled: invokes the create-portal-session edge
 * function and redirects the authenticated user into Stripe's Billing
 * Portal. The portal return URL is centralized in stripe-config.ts so
 * we can later swap to a branded domain without code changes.
 */
export default function Billing() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!CUSTOMER_ACCOUNT_ENABLED || !STRIPE_INTEGRATION_ENABLED) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          STRIPE_FUNCTIONS.CREATE_PORTAL_SESSION,
          { body: { return_url: getBillingReturnUrl() } }
        );
        if (cancelled) return;
        if (fnError) throw fnError;
        if (data?.url) {
          window.location.href = data.url;
        } else {
          setError("Could not start billing session.");
        }
      } catch (e) {
        if (!cancelled) setError("Billing is temporarily unavailable.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!CUSTOMER_ACCOUNT_ENABLED) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-cream text-ink flex items-center justify-center px-5">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(36_60%_94%)_0%,hsl(36_27%_96%)_55%,hsl(35_22%_92%)_100%)]" />
      </div>
      <div className="max-w-lg w-full text-center space-y-3 py-16 animate-calm-rise">
        <h1 className="text-3xl font-bold text-ink lowercase tracking-tight" style={{ letterSpacing: "-0.025em" }}>
          {error ? "billing unavailable." : "opening billing…"}
        </h1>
        <p className="text-sm text-ink-faint lowercase">
          {error ?? "redirecting you in a moment."}
        </p>
      </div>
    </div>
  );
}
