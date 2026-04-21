import { X } from 'lucide-react';
import { usePromoState } from '@/hooks/usePromoCapture';
import { dismissPromoBanner } from '@/lib/promo';

/**
 * Small banner shown above the service builder and cart/review screen
 * when a promo code is captured. Dismissable (× button hides for the
 * session but keeps the code applied at checkout).
 */
export default function PromoBanner() {
  const { code, dismissed } = usePromoState();
  if (!code || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
    >
      <span>
        Promo code applied: <span className="font-bold">{code}</span> — $50 off your first month
      </span>
      <button
        type="button"
        onClick={dismissPromoBanner}
        aria-label="Dismiss promo banner"
        className="shrink-0 rounded p-1 text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
