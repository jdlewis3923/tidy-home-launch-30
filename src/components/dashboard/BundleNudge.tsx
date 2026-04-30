import { ConfigState, ServiceType } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const ADD_LABEL: Record<ServiceType, { name: string; price: string; saving: string }> = {
  cleaning:  { name: 'House Cleaning', price: '$135/mo', saving: '$13.50/mo' },
  lawn:      { name: 'Lawn Care',      price: '$90/mo',  saving: '$22.50/mo' },
  detailing: { name: 'Car Detailing',  price: '$120/mo', saving: '$21.00/mo' },
};

/**
 * Single-service users see a one-tap nudge to add a second service for
 * the bundle discount. Calm cream surface, gold accent — no shouting.
 */
export default function BundleNudge({ state, onChange }: Props) {
  if (state.services.length !== 1) return null;

  const current = state.services[0];
  // Suggest lawn if not selected, else detailing, else cleaning.
  const candidates: ServiceType[] = ['lawn', 'detailing', 'cleaning'];
  const suggest = candidates.find((s) => s !== current)!;
  const meta = ADD_LABEL[suggest];

  const addBundle = () => {
    const nextServices = [...state.services, suggest];
    const nextFreqs = { ...state.frequencies };
    nextFreqs[suggest] = suggest === 'lawn' ? 'monthly' : 'biweekly';
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
          Save 10% on your bundle — {meta.saving} discount
        </p>
      </div>
      <span className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white transition-transform group-hover:translate-x-0.5">
        + Add
      </span>
    </button>
  );
}
