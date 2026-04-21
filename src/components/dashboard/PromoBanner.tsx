import { X } from 'lucide-react';
import { usePromoState } from '@/hooks/usePromoCapture';
import { dismissPromoBanner } from '@/lib/promo';

/**
 * Referral promo confirmation banner. Renders on every step of the
 * builder when a promo code is captured (URL ?promo= or sessionStorage
 * fallback). Dismissable — hides for the session but the code is still
 * applied at Stripe Checkout. No visible code is shown (per spec: the
 * ?promo= URL is the only entry point and we don't surface the raw code
 * in the UI).
 */
export default function PromoBanner() {
  const { code, dismissed } = usePromoState();
  if (!code || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm font-semibold text-success"
    >
      <span className="flex items-center gap-2">
        <span aria-hidden>🎉</span>
        <span>$50 off your first month — applied automatically at checkout</span>
      </span>
      <button
        type="button"
        onClick={dismissPromoBanner}
        aria-label="Dismiss promo banner"
        className="shrink-0 rounded p-1 text-success/70 transition-colors hover:bg-success/10 hover:text-success"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
