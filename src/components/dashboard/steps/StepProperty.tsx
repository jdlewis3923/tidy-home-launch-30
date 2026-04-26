import { ConfigState, SizeTier, ServiceType, sizeTierCopy } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const tiers: SizeTier[] = ['standard', 'xl', 'custom'];

function SizeTierGroup({
  service, value, onSelect, heading,
}: {
  service: ServiceType;
  value: SizeTier | null;
  onSelect: (v: SizeTier) => void;
  heading: string;
}) {
  const copy = sizeTierCopy[service];
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-ink-soft lowercase">{heading}</h3>
      <div className="grid gap-2 md:grid-cols-3">
        {tiers.map(tier => {
          const selected = value === tier;
          return (
            <button
              key={tier}
              type="button"
              onClick={() => onSelect(tier)}
              className={`text-left rounded-xl border bg-white p-4 transition-all ${
                selected
                  ? 'border-ink shadow-[0_6px_18px_-10px_hsl(var(--ink)/0.3)]'
                  : 'border-hairline hover:border-ink/40'
              }`}
            >
              <p className="text-sm font-semibold text-ink lowercase">{copy[tier].label}</p>
              <p className="text-[11px] text-ink-faint mt-1 leading-snug">{copy[tier].helper}</p>
            </button>
          );
        })}
      </div>
      {value === 'custom' && (
        <p className="text-[11px] text-ink-soft">
          we'll reach out within one business day with a personal quote — no payment today.
        </p>
      )}
    </div>
  );
}

function SelectField({ label, value, options, onSelect }: {
  label: string; value: string | null;
  options: { value: string; label: string }[];
  onSelect: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">{label}</label>
      <select
        value={value || ''}
        onChange={e => onSelect(e.target.value)}
        className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
      >
        <option value="">select…</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
        <div className="space-y-4 animate-calm-in">
          <SizeTierGroup
            service="cleaning"
            value={state.homeSize}
            onSelect={v => onChange({ ...state, homeSize: v })}
            heading="home size"
          />
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField
              label="bedrooms"
              value={state.bedrooms}
              options={['1','2','3','4','5+'].map(v => ({ value: v, label: v }))}
              onSelect={v => onChange({ ...state, bedrooms: v })}
            />
            <SelectField
              label="bathrooms"
              value={state.bathrooms}
              options={['1','1.5','2','2.5','3','3.5','4+'].map(v => ({ value: v, label: v }))}
              onSelect={v => onChange({ ...state, bathrooms: v })}
            />
          </div>
        </div>
      )}

      {hasLawn && (
        <div className="animate-calm-in" style={{ animationDelay: '60ms' }}>
          <SizeTierGroup
            service="lawn"
            value={state.yardSize}
            onSelect={v => onChange({ ...state, yardSize: v })}
            heading="yard size"
          />
        </div>
      )}

      {hasDetailing && (
        <div className="space-y-4 animate-calm-in" style={{ animationDelay: '120ms' }}>
          <SizeTierGroup
            service="detailing"
            value={state.vehicleSize}
            onSelect={v => onChange({ ...state, vehicleSize: v })}
            heading="vehicle size"
          />
          <div className="max-w-xs">
            <SelectField
              label="number of vehicles"
              value={String(state.vehicleCount)}
              options={[1,2,3].map(v => ({ value: String(v), label: String(v) }))}
              onSelect={v => onChange({ ...state, vehicleCount: parseInt(v) })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
