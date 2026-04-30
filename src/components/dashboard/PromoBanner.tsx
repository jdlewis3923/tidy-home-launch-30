import { CheckCircle2, X } from 'lucide-react';
import { usePromoState } from '@/hooks/usePromoCapture';
import { dismissPromoBanner } from '@/lib/promo';

/**
 * Referral confirmation banner. Green surface when a code is present,
 * matching the prompt: "Your friend's referral applied — 50% off your
 * first month, locked in."
 */
export default function PromoBanner() {
  const { code, dismissed } = usePromoState();
  if (!code || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300/60 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="text-[12.5px] leading-snug">
          <span className="font-semibold">Your friend's referral applied</span>
          <span className="mx-1.5 text-emerald-700/70">·</span>
          50% off your first month, locked in.
        </span>
      </div>
      <button
        type="button"
        onClick={dismissPromoBanner}
        aria-label="Dismiss promo banner"
        className="shrink-0 rounded p-1 text-emerald-700/60 transition-colors hover:bg-emerald-100 hover:text-emerald-900"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
