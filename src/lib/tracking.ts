// GTM dataLayer helper — pushes events without blocking UI
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export const pushEvent = (event: string, data?: Record<string, unknown>) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...data });
};

// ---------------------------------------------------------------------------
// Funnel taxonomy
// ---------------------------------------------------------------------------
// view_pricing · select_plan · begin_checkout · checkout_step · purchase ·
// generate_lead. NEVER put email, phone, name or address in a dataLayer push —
// raw PII in GA4 violates Google's terms. Use emailSha256() if a join key is
// needed.

export interface PlanEventParams {
  service: "cleaning" | "lawn" | "detailing" | "bundle";
  cadence?: string;
  size?: 1 | 2 | 3 | "quote";
  price?: number;
}

export const trackSelectPlan = (p: PlanEventParams) => pushEvent("select_plan", { ...p });
export const trackBeginCheckout = (p: PlanEventParams) => pushEvent("begin_checkout", { ...p });
export const trackCheckoutStep = (stepNumber: number, stepName: string) =>
  pushEvent("checkout_step", { step_number: stepNumber, step_name: stepName });
export const trackPurchase = (value: number, transactionId: string) =>
  pushEvent("purchase", { value, currency: "USD", transaction_id: transactionId });

/**
 * SHA-256 hex of a lowercased, trimmed email — safe to send as a join key.
 * Returns null when SubtleCrypto is unavailable (non-HTTPS contexts).
 */
export const emailSha256 = async (email: string): Promise<string | null> => {
  try {
    const data = new TextEncoder().encode(email.trim().toLowerCase());
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
};

/**
 * Fires `view_pricing` once per pageview when the returned ref scrolls into
 * view. Attach to the plan-cards / pricing-table wrapper.
 */
export const useViewPricingObserver = (params: Record<string, unknown> = {}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (firedRef.current) return;
        if (entries.some((e) => e.isIntersecting)) {
          firedRef.current = true;
          pushEvent("view_pricing", params);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
};

// Scroll depth observer — fires once at 50% and 75%
export const initScrollTracking = () => {
  const fired = { 50: false, 75: false };
  const handler = () => {
    const scrollPct = Math.round(
      (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100
    );
    if (scrollPct >= 50 && !fired[50]) {
      fired[50] = true;
      pushEvent("scroll_depth", { depth: 50 });
    }
    if (scrollPct >= 75 && !fired[75]) {
      fired[75] = true;
      pushEvent("scroll_depth", { depth: 75 });
    }
  };
  window.addEventListener("scroll", handler, { passive: true });
  return () => window.removeEventListener("scroll", handler);
};
