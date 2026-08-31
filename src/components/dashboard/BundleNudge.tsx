import {
  ConfigState,
  ServiceType,
  defaultBundleFrequency,
  formatSizePrice,
  getServiceStartingPrice,
  serviceLabels,
  serviceUnits,
} from '@/lib/dashboard-pricing';
import { SIZE_PRICES, hasFreeAddonEntitlement } from '@/lib/pricing-canon';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

/**
 * Single-service users see a one-tap nudge to add a second service. The bundle
 * is a gift, not a percentage: holding two or more services earns one free
 * premium add-on a month, and the customer picks which one.
 */
export default function BundleNudge({ state, onChange }: Props) {
  if (state.services.length !== 1) return null;

  const current = state.services[0];
  const candidates: ServiceType[] = ['lawn', 'detailing', 'cleaning'];
  const suggest = candidates.find((s) => s !== current)!;

  const suggestFreq = defaultBundleFrequency[suggest];
  const fromPrice = getServiceStartingPrice(suggest);
  const earnsFreeAddon = hasFreeAddonEntitlement(2);

  const priceCopy =
    serviceUnits[suggest] === 'per_month'
      ? `from $${SIZE_PRICES[suggest][1]}/mo`
      : `from ${formatSizePrice(suggest, 1)}`;

  const addBundle = () => {
    const nextFreqs = { ...state.frequencies, [suggest]: suggestFreq };
    onChange({ ...state, services: [...state.services, suggest], frequencies: nextFreqs });
  };

  return (
    <button
      type="button"
      onClick={addBundle}
      className="group flex w-full items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-left transition-all hover:bg-gold/15 hover:border-gold/60"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-ink leading-tight">
          Add {serviceLabels[suggest]}, {priceCopy}
        </p>
        <p className="text-[11px] text-ink-soft mt-0.5">
          {earnsFreeAddon ? 'You pick one free premium add-on every month' : 'Cancel anytime'}
        </p>
      </div>
      <span className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-transform group-hover:translate-x-0.5">
        + Add
      </span>
    </button>
  );
}
