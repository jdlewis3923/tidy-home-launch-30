import { ConfigState, calculatePricing } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  currentStep: number;
}

/**
 * Calm sticky footer summary. Cream/ink, hairline divider, no shouty
 * accents — matches the Apple-calm checkout shell.
 */
export default function StickyPriceBar({ state, currentStep }: Props) {
  if (currentStep < 1 || state.services.length === 0) return null;

  const pricing = calculatePricing(state);
  const hasFullPricing = pricing.subtotal > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-hairline bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto max-w-2xl flex items-center justify-between px-5 py-3.5">
        <div>
          {hasFullPricing ? (
            <>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">
                monthly
              </p>
              <p className="text-lg font-bold text-ink tabular-nums">
                ${pricing.ongoing.toFixed(2)}
                <span className="text-xs font-normal text-ink-faint">/mo</span>
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-soft">
              {state.services.length} service{state.services.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>
        <p className="text-[11px] text-ink-faint">
          {pricing.discountPercent > 0
            ? `${Math.round(pricing.discountPercent * 100)}% bundle saving applied`
            : state.services.length >= 2 && !hasFullPricing
              ? 'bundle saving will apply'
              : 'cancel anytime'}
        </p>
      </div>
    </div>
  );
}
