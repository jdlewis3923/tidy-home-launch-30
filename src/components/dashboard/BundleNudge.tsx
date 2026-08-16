import {
  ConfigState,
  ServiceType,
  defaultBundleFrequency,
  formatMonthly,
  getBasePrice,
  getBundleDiscount,
  serviceLabels,
} from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

/**
 * Single-service users see a one-tap nudge to add a second service for
 * the bundle discount. Calm cream surface, gold accent — no shouting.
 *
 * All figures are derived from dashboard-pricing.ts (the same source checkout
 * math uses) so labels can never drift from real pricing.
 */
export default function BundleNudge({ state, onChange }: Props) {
  if (state.services.length !== 1) return null;

  const current = state.services[0];
  // Suggest lawn if not selected, else detailing, else cleaning.
  const candidates: ServiceType[] = ['lawn', 'detailing', 'cleaning'];
  const suggest = candidates.find((s) => s !== current)!;

  const suggestFreq = defaultBundleFrequency[suggest];
  const addedPrice = getBasePrice(suggest, suggestFreq);

  // Discount the user unlocks by moving from 1 → 2 services, applied to the
  // combined subtotal of the current service + the suggested one.
  const currentFreq = state.frequencies[current] ?? defaultBundleFrequency[current];
  const bundleSubtotal = getBasePrice(current, currentFreq) + addedPrice;
  const discountPercent = getBundleDiscount(2);
  const savingAmount = bundleSubtotal * discountPercent;

  const meta = {
    name: serviceLabels[suggest],
    price: formatMonthly(addedPrice),
    saving: formatMonthly(Math.round(savingAmount * 100) / 100),
    percentLabel: `${Math.round(discountPercent * 100)}%`,
  };

  const addBundle = () => {
    const nextServices = [...state.services, suggest];
    const nextFreqs = { ...state.frequencies };
    nextFreqs[suggest] = suggestFreq;
    onChange({ ...state, services: nextServices, frequencies: nextFreqs });
  };


  return (
    <button
      type="button"
      onClick={addBundle}
      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-left transition-all hover:bg-gold/15 hover:border-gold/60"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink leading-tight">
          Add {meta.name} for {meta.price} more
        </p>
        <p className="text-[11px] text-ink-soft mt-0.5">
          Save {meta.percentLabel} on your bundle — {meta.saving} discount
        </p>
      </div>
      <span className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-transform group-hover:translate-x-0.5">
        + Add
      </span>
    </button>
  );
}
