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
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-4 py-16">
        <h1
          className="text-2xl md:text-3xl font-black tracking-tight text-foreground"
          style={{ letterSpacing: "-0.03em" }}
        >
          {error ? "Billing unavailable" : "Opening billing portal…"}
        </h1>
        <p className="text-muted-foreground">
          {error ?? "You'll be redirected to manage your subscription."}
        </p>
      </div>
    </div>
  );
}
