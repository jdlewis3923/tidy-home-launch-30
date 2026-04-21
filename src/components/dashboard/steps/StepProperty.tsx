import { ConfigState, SizeTier, ServiceType, sizeTierCopy } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const tiers: SizeTier[] = ['standard', 'xl', 'custom'];

function SizeTierGroup({
  service,
  value,
  onSelect,
  heading,
}: {
  service: ServiceType;
  value: SizeTier | null;
  onSelect: (v: SizeTier) => void;
  heading: string;
}) {
  const copy = sizeTierCopy[service];
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-foreground">{heading}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {tiers.map(tier => {
          const selected = value === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onSelect(tier)}
              className={`text-left rounded-xl border-[1.5px] p-4 transition-all ${
                selected
                  ? 'border-primary bg-secondary shadow-sm'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              <p className="text-sm font-bold text-foreground">{copy[tier].label}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">{copy[tier].helper}</p>
            </button>
          );
        })}
      </div>
      {value === 'custom' && (
        <p className="text-xs text-primary font-medium">
          We'll reach out within one business day with a personal quote — no payment today.
        </p>
      )}
    </div>
  );
}

function SelectField({ label, value, options, onSelect }: { label: string; value: string | null; options: { value: string; label: string }[]; onSelect: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</label>
      <select
        value={value || ''}
        onChange={e => onSelect(e.target.value)}
        className="w-full rounded-lg border-[1.5px] border-border bg-card px-4 py-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Select...</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function StepProperty({ state, onChange }: Props) {
  const hasCleaning = state.services.includes('cleaning');
  const hasLawn = state.services.includes('lawn');
  const hasDetailing = state.services.includes('detailing');

  return (
    <div className="space-y-8">
      {hasCleaning && (
        <div className="space-y-4">
          <SizeTierGroup
            service="cleaning"
            value={state.homeSize}
            onSelect={v => onChange({ ...state, homeSize: v })}
            heading="🏠 Home size"
          />
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Bedrooms"
              value={state.bedrooms}
              options={['1', '2', '3', '4', '5+'].map(v => ({ value: v, label: v }))}
              onSelect={v => onChange({ ...state, bedrooms: v })}
            />
            <SelectField
              label="Bathrooms"
              value={state.bathrooms}
              options={['1', '1.5', '2', '2.5', '3', '3.5', '4+'].map(v => ({ value: v, label: v }))}
              onSelect={v => onChange({ ...state, bathrooms: v })}
            />
          </div>
        </div>
      )}

      {hasLawn && (
        <SizeTierGroup
          service="lawn"
          value={state.yardSize}
          onSelect={v => onChange({ ...state, yardSize: v })}
          heading="🌿 Yard size"
        />
      )}

      {hasDetailing && (
        <div className="space-y-4">
          <SizeTierGroup
            service="detailing"
            value={state.vehicleSize}
            onSelect={v => onChange({ ...state, vehicleSize: v })}
            heading="🚗 Vehicle size"
          />
          <div className="max-w-xs">
            <SelectField
              label="Number of vehicles"
              value={String(state.vehicleCount)}
              options={[1, 2, 3].map(v => ({ value: String(v), label: String(v) }))}
              onSelect={v => onChange({ ...state, vehicleCount: parseInt(v) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
