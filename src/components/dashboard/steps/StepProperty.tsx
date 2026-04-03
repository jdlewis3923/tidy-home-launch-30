import { ConfigState, HomeSize, YardSize, VehicleType, homeSizeLabels, yardSizeLabels, vehicleTypeLabels } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
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
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">🏠 Your home</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              label="Home size"
              value={state.homeSize}
              options={Object.entries(homeSizeLabels).map(([v, l]) => ({ value: v, label: l }))}
              onSelect={v => onChange({ ...state, homeSize: v as HomeSize })}
            />
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
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">🌿 Your yard</h3>
          <SelectField
            label="Yard size"
            value={state.yardSize}
            options={Object.entries(yardSizeLabels).map(([v, l]) => ({ value: v, label: l }))}
            onSelect={v => onChange({ ...state, yardSize: v as YardSize })}
          />
        </div>
      )}

      {hasDetailing && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">🚗 Your vehicle(s)</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Vehicle type"
              value={state.vehicleType}
              options={Object.entries(vehicleTypeLabels).map(([v, l]) => ({ value: v, label: l }))}
              onSelect={v => onChange({ ...state, vehicleType: v as VehicleType })}
            />
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
