import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import { pushEvent, trackPurchase } from "@/lib/tracking";
import { clearPromo } from "@/lib/promo";
import {
  CUSTOMER_ACCOUNT_ENABLED,
} from "@/lib/dashboard-config";

/**
 * /checkout/success — Post-checkout confirmation page.
 *
 * Always available (works pre- and post-launch) so external Stripe
 * Checkout returns never 404. Pre-launch the CTA points home;
 * post-launch it routes the customer into their account dashboard.
 *
 * Stripe appends ?session_id=... — captured here for analytics and
 * future server-side fulfillment confirmation.
 */
export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const firedRef = useRef(false);

  useEffect(() => {
    pushEvent("checkout_success", {
      session_id: sessionId ?? null,
      page: "/checkout/success",
    });

    // purchase — fires once per Stripe session. Value comes from the amount the
    // wizard displayed (stashed at begin_checkout), never from a URL param, so
    // it cannot be inflated by a crafted link. A refresh never re-fires.
    if (sessionId && !firedRef.current) {
      const key = `tidy_purchase_${sessionId}`;
      let alreadySent = false;
      let value = 0;
      try {
        alreadySent = sessionStorage.getItem(key) === "1";
        value = Number(sessionStorage.getItem("tidy_checkout_value") ?? 0) || 0;
        if (!alreadySent) sessionStorage.setItem(key, "1");
      } catch {
        /* storage unavailable — the ref guard still blocks the double fire */
      }
      if (!alreadySent) {
        firedRef.current = true;
        trackPurchase(value, sessionId);
        window.fbq?.("track", "Purchase", { value, currency: "USD" });
      }
    }

    // Defense-in-depth: also clear any lingering promo state on the
    // success landing (the redirect helper already clears, but if the
    // user lands here directly we want a clean slate).
    clearPromo();
  }, [sessionId]);


  const ctaTo = CUSTOMER_ACCOUNT_ENABLED ? "/account" : "/";
  const ctaLabel = CUSTOMER_ACCOUNT_ENABLED
    ? "Go to your account →"
    : "Back to home →";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-xl w-full text-center space-y-6 py-16">
        <div className="text-6xl">✅</div>
        <h1
          className="text-3xl md:text-4xl font-black tracking-tight text-foreground"
          style={{ letterSpacing: "-0.03em" }}
        >
          Payment confirmed
        </h1>
        <p className="text-muted-foreground">
          Thanks — your subscription is active. A receipt is on its way to your inbox.
        </p>
        <Link
          to={ctaTo}
          className="inline-block rounded-lg bg-gradient-to-br from-primary-deep to-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-lg hover:shadow-xl hover:scale-[1.01] transition-all"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
