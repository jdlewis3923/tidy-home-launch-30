import { X } from 'lucide-react';
import { usePromoState } from '@/hooks/usePromoCapture';
import { dismissPromoBanner } from '@/lib/promo';

/**
 * Quiet referral confirmation banner — calm cream surface, no exclamation.
 */
export default function PromoBanner() {
  const { code, dismissed } = usePromoState();
  if (!code || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-white/70 px-4 py-2.5 text-sm text-ink-soft backdrop-blur"
    >
      <span className="text-xs">
        $50 off your first month — applied at checkout.
      </span>
      <button
        type="button"
        onClick={dismissPromoBanner}
        aria-label="Dismiss promo banner"
        className="shrink-0 rounded p-1 text-ink-faint transition-colors hover:bg-hairline/50 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
