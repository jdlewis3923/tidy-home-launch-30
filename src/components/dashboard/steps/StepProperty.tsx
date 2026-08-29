import {
  ConfigState,
  ServiceType,
  Band,
  BandSelection,
  LotChoice,
  bandCopy,
  bandLabels,
  bandForCleaning,
  bandForLawn,
  bandForDetailing,
  lotChoiceLabels,
  vehicleClassLabels,
  getPerVisitPrice,
  formatPerVisit,
} from '@/lib/dashboard-pricing';
import type { VehicleClass } from '@/lib/pricing-canon';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

/** Live band + price readout, shown as soon as we can work the band out. */
function BandReadout({ service, band }: { service: ServiceType; band: BandSelection | null }) {
  if (!band) return null;
  if (band === 'custom') {
    return (
      <p className="text-[11px] text-ink-soft">
        that one sits above our estate band, so we quote it by hand — we'll reach out within one
        business day. no payment today.
      </p>
    );
  }
  return (
    <div className="rounded-xl border border-hairline bg-cream-deep/40 px-4 py-3 animate-calm-in">
      <p className="text-sm font-semibold text-ink lowercase">
        {bandLabels[band as Band].toLowerCase()} — {formatPerVisit(getPerVisitPrice(service, band as Band))}
      </p>
      <p className="text-[11px] text-ink-faint mt-0.5">
        {bandCopy[service][band as Band]}. the price per visit stays the same however often we come.
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

const lotOptions: LotChoice[] = ['quarter', 'half', 'threeQuarter', 'acre', 'over', 'noLot'];

const vehicleOptions: VehicleClass[] = [
  'sedan', 'coupe', 'hatchback', 'crossover', 'suv2row', 'suv3row', 'pickup', 'minivan', 'suvFullSize', 'dually', 'eightSeat',
];

export default function StepProperty({ state, onChange }: Props) {
  const hasCleaning = state.services.includes('cleaning');
  const hasLawn = state.services.includes('lawn');
  const hasDetailing = state.services.includes('detailing');

  const setCleaning = (patch: Partial<ConfigState>) => {
    const next = { ...state, ...patch };
    onChange({ ...next, homeBand: bandForCleaning(next.bedrooms, next.bathrooms) });
  };

  const setLawn = (patch: Partial<ConfigState>) => {
    const next = { ...state, ...patch };
    onChange({ ...next, lawnBand: bandForLawn(next.lotChoice, next.cornerLot) });
  };

  const setVehicle = (patch: Partial<ConfigState>) => {
    const next = { ...state, ...patch };
    onChange({ ...next, vehicleBand: bandForDetailing(next.vehicleClass) });
  };

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
              onSelect={v => setCleaning({ bedrooms: v })}
            />
            <SelectField
              label="bathrooms"
              value={state.bathrooms}
              options={['1','1.5','2','2.5','3','3.5','4+'].map(v => ({ value: v, label: v }))}
              onSelect={v => setCleaning({ bathrooms: v })}
            />
          </div>
          <p className="text-[11px] text-ink-faint">
            a bedroom is a room with a door and a closet. a half bath counts as half — two half baths
            round up to one.
          </p>
          <BandReadout service="cleaning" band={state.homeBand} />
        </div>
      )}

      {hasLawn && (
        <div className="space-y-4 animate-calm-in" style={{ animationDelay: '60ms' }}>
          <h3 className="text-sm font-semibold text-ink-soft lowercase">roughly how big is your lot?</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {lotOptions.map(lot => (
              <OptionCard
                key={lot}
                selected={state.lotChoice === lot}
                title={lotChoiceLabels[lot]}
                onClick={() => setLawn({ lotChoice: lot })}
              />
            ))}
          </div>

          {state.lotChoice === 'noLot' && (
            <p className="text-[11px] text-ink-soft">
              lawn care needs a private lot, so condos and townhomes aren't eligible. remove lawn to
              carry on, or send us a note and we'll take a look.
            </p>
          )}

          {state.lotChoice && state.lotChoice !== 'noLot' && (
            <>
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input
                  type="checkbox"
                  checked={state.cornerLot}
                  onChange={e => setLawn({ cornerLot: e.target.checked })}
                  className="h-4 w-4 rounded border-hairline accent-[hsl(var(--ink))]"
                />
                <span className="lowercase">it's a corner lot</span>
              </label>
              <p className="text-[11px] text-ink-faint">
                corner lots have more edging and frontage, so they move up one band.
              </p>
            </>
          )}

          <BandReadout service="lawn" band={state.lawnBand} />
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
                onClick={() => setVehicle({ vehicleClass: vc })}
              />
            ))}
          </div>
          <div className="max-w-xs">
            <SelectField
              label="number of vehicles"
              value={String(state.vehicleCount)}
              options={[1,2,3].map(v => ({ value: String(v), label: String(v) }))}
              onSelect={v => onChange({ ...state, vehicleCount: parseInt(v) })}
            />
          </div>
          <p className="text-[11px] text-ink-faint">
            pet hair, sand and smoke are add-ons, not a bigger vehicle band.
          </p>
          <BandReadout service="detailing" band={state.vehicleBand} />
        </div>
      )}
    </div>
  );
}
