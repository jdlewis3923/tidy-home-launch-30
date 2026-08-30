import {
  ConfigState,
  LawnChoice,
  ServiceType,
  SizeSelection,
  formatMonthly,
  formatPerVisit,
  getSizePrice,
  lawnChoiceHelpers,
  lawnChoiceLabels,
  serviceUnits,
  sizeFor,
  sizeHelpers,
  sizeLabels,
  vehicleClassLabels,
} from '@/lib/dashboard-pricing';
import { LAWN_GUESS_NOTE, QUOTE_COPY, QUOTE_PHONE, type VehicleClass } from '@/lib/pricing-canon';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

/** Live size + price readout, shown as soon as we can work the size out. */
function SizeReadout({ service, size }: { service: ServiceType; size: SizeSelection | null }) {
  if (!size) return null;
  if (size === 'quote') {
    return (
      <p className="text-[11px] text-ink-soft">
        {QUOTE_COPY.toLowerCase()} give us a ring on {QUOTE_PHONE} — no payment today.
      </p>
    );
  }
  const price = getSizePrice(service, size);
  return (
    <div className="rounded-xl border border-hairline bg-cream-deep/40 px-4 py-3 animate-calm-in">
      <p className="text-sm font-semibold text-ink lowercase">
        {sizeLabels[service][size].toLowerCase()} —{' '}
        {serviceUnits[service] === 'per_month' ? formatMonthly(price) : formatPerVisit(price)}
      </p>
      <p className="text-[11px] text-ink-faint mt-0.5">
        {sizeHelpers[service][size]}.{' '}
        {serviceUnits[service] === 'per_month'
          ? 'the same every month.'
          : 'the price per visit stays the same however often we come.'}
      </p>
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

function OptionCard({ selected, title, helper, onClick }: {
  selected: boolean; title: string; helper?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl border-2 p-4 transition-all ${
        selected
          ? 'border-ink bg-ink text-white shadow-[0_8px_22px_-10px_hsl(var(--ink)/0.45)]'
          : 'border-hairline bg-white hover:border-ink/40 hover:bg-cream-deep/40'
      }`}
    >
      <p className={`text-sm font-semibold lowercase ${selected ? 'text-white' : 'text-ink'}`}>{title}</p>
      {helper && (
        <p className={`text-[11px] mt-1 leading-snug ${selected ? 'text-white/70' : 'text-ink-faint'}`}>{helper}</p>
      )}
    </button>
  );
}

const lawnOptions: LawnChoice[] = ['small', 'standard', 'large', 'over'];

const vehicleOptions: VehicleClass[] = ['sedan', 'coupe', 'crossover', 'suv', 'suv3row', 'truck', 'van'];

export default function StepProperty({ state, onChange }: Props) {
  const hasCleaning = state.services.includes('cleaning');
  const hasLawn = state.services.includes('lawn');
  const hasDetailing = state.services.includes('detailing');

  return (
    <div className="space-y-10">
      {hasCleaning && (
        <div className="space-y-4 animate-calm-in">
          <h3 className="text-sm font-semibold text-ink-soft lowercase">how many bedrooms and bathrooms?</h3>
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
          <p className="text-[11px] text-ink-faint">
            more bathrooms than your size allows moves the home up one size — bathrooms drive the
            length of a visit more than anything else.
          </p>
          <SizeReadout service="cleaning" size={sizeFor(state, 'cleaning')} />
        </div>
      )}

      {hasLawn && (
        <div className="space-y-4 animate-calm-in" style={{ animationDelay: '60ms' }}>
          <h3 className="text-sm font-semibold text-ink-soft lowercase">roughly how big is your lawn?</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {lawnOptions.map(choice => (
              <OptionCard
                key={choice}
                selected={state.lawnChoice === choice}
                title={lawnChoiceLabels[choice]}
                helper={lawnChoiceHelpers[choice]}
                onClick={() => onChange({ ...state, lawnChoice: choice })}
              />
            ))}
          </div>

          <p className="text-[11px] text-ink-faint">{LAWN_GUESS_NOTE}</p>

          <SizeReadout service="lawn" size={sizeFor(state, 'lawn')} />
        </div>
      )}

      {hasDetailing && (
        <div className="space-y-4 animate-calm-in" style={{ animationDelay: '120ms' }}>
          <h3 className="text-sm font-semibold text-ink-soft lowercase">what do you drive?</h3>
          <div className="grid gap-2 md:grid-cols-3">
            {vehicleOptions.map(vc => (
              <OptionCard
                key={vc}
                selected={state.vehicleClass === vc}
                title={vehicleClassLabels[vc]}
                onClick={() => onChange({ ...state, vehicleClass: vc })}
              />
            ))}
          </div>
          <p className="text-[11px] text-ink-faint">
            pet hair, sand and smoke are add-ons, never a bigger size.
          </p>
          <SizeReadout service="detailing" size={sizeFor(state, 'detailing')} />
        </div>
      )}
    </div>
  );
}
