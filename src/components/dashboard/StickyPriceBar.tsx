import { ConfigState, calculatePricing } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  currentStep: number;
}

export default function StickyPriceBar({ state, currentStep }: Props) {
  if (currentStep < 1 || state.services.length === 0) return null;

  const pricing = calculatePricing(state);
  const hasFullPricing = pricing.subtotal > 0;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-md shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="mx-auto max-w-2xl flex items-center justify-between px-4 py-3">
        <div>
          {hasFullPricing ? (
            <>
              <p className="text-lg font-bold text-foreground">${pricing.ongoing.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              {pricing.discountPercent > 0 && (
                <p className="text-xs text-success font-semibold">
                  {Math.round(pricing.discountPercent * 100)}% bundle savings applied
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {state.services.length} service{state.services.length > 1 ? 's' : ''} selected
            </p>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {state.services.length >= 2 && !hasFullPricing && '✨ Bundle discount will apply'}
        </div>
      </div>
    </div>
  );
}
