import type { ReactNode } from 'react';
import {
  ConfigState,
  LawnChoice,
  ServiceType,
  SizeSelection,
  formatMonthly,
  formatPerVisit,
  getSizePrice,
  getPerVisitPrice,
  getServicePrice,
  surchargePerVisitFor,
  lawnChoiceHelpers,
  lawnChoiceLabels,
  serviceUnits,
  sizeFor,
  sizeHelpers,
  sizeLabels,
  vehicleClassLabels,
} from '@/lib/dashboard-pricing';
import { LAWN_GUESS_NOTE, QUOTE_COPY, QUOTE_PHONE, type VehicleClass } from '@/lib/pricing-canon';
import { carVariantAvailable, carWashEligible, setCarVariant } from '@/lib/dashboard-pricing';
import { trackCarVariantSelect } from '@/lib/tracking';
import { useLanguage } from '@/contexts/LanguageContext';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

/** Live size + price readout, shown as soon as we can work the size out. */
function SizeReadout({
  service,
  size,
  state,
}: { service: ServiceType; size: SizeSelection | null; state: ConfigState }) {
  if (!size) return null;
  if (size === 'quote') {
    return (
      <p className="text-[11px] text-ink-soft">
        {QUOTE_COPY.toLowerCase()} give us a ring on {QUOTE_PHONE} — no payment today.
      </p>
    );
  }
  const perMonth = serviceUnits[service] === 'per_month';
  // Per-visit price at the cadence they picked, plus any surcharge for the size
  // of the property — never the monthly-cadence figure at a weekly plan.
  const perVisit = getPerVisitPrice(state, service) + surchargePerVisitFor(state, service);
  return (
    <div className="rounded-xl border border-hairline bg-cream-deep/40 px-4 py-3 animate-calm-in">
      <p className="text-sm font-semibold text-ink lowercase">
        {sizeLabels[service][size].toLowerCase()} —{' '}
        {perMonth ? formatMonthly(getSizePrice(service, size)) : formatPerVisit(perVisit)}
      </p>
      <p className="text-[11px] text-ink-faint mt-0.5">
        {sizeHelpers[service][size]}.{' '}
        {perMonth
          ? 'the same every month.'
          : `${formatMonthly(getServicePrice(state, service))} at the plan you picked, billed monthly.`}
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

/** Square-footage question. Drives the surcharge and the quote cut-off. */
function SqFtField({
  label, helper, value, onChange, placeholder,
}: {
  label: string; helper: string; value: number | null;
  onChange: (v: number | null) => void; placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-ink-faint">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={50}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => {
          const raw = e.target.value.trim();
          onChange(raw === '' ? null : Math.max(0, Math.round(Number(raw))));
        }}
        className="w-full rounded-lg border border-hairline bg-white px-4 py-3 text-sm text-ink focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/10"
      />
      <p className="text-[11px] text-ink-faint">{helper}</p>
    </div>
  );
}

/** Shown the moment an answer lands outside what we can price online. */
function QuoteNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-hairline bg-cream-deep/40 px-4 py-3">
      <p className="text-sm font-semibold text-ink lowercase">{children}</p>
      <p className="text-[11px] text-ink-faint mt-0.5">
        {QUOTE_COPY.toLowerCase()} give us a ring on {QUOTE_PHONE} — no payment today.
      </p>
    </div>
  );
}


export default function StepProperty({ state, onChange }: Props) {
  const { t } = useLanguage();
  const hasCleaning = state.services.includes('cleaning');
  const hasLawn = state.services.includes('lawn');
  const hasDetailing = state.services.includes('detailing');
  const carEligible = carVariantAvailable(state);
  const washAllowed = carWashEligible(state);

  const chooseVariant = (variant: 'car_wash' | 'car_detail') => {
    if (variant === 'car_wash' && !washAllowed) return;
    onChange(setCarVariant(state, variant));
    trackCarVariantSelect(variant);
  };

  return (
    <div className="space-y-10">
      {hasCleaning && (
        <div className="space-y-4 animate-calm-in">
          <h3 className="text-sm font-semibold text-ink-soft lowercase">{t('how many bedrooms and bathrooms?')}</h3>
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
            {t('more bathrooms than your size allows moves the home up one size — bathrooms drive the length of a visit more than anything else.')}
          </p>
          <SqFtField
            label={t('home square footage')}
            placeholder="e.g. 1800"
            value={state.homeSqFt}
            onChange={v => onChange({ ...state, homeSqFt: v })}
            helper={t('interior living space. 2,501–4,000 sq ft adds $60 a visit. above 4,000 we quote by hand.')}
          />
          {(state.homeSqFt ?? 0) > 4000 && (
            <QuoteNotice>{t('a home over 4,000 sq ft is quoted by hand')}</QuoteNotice>
          )}
          <SizeReadout service="cleaning" size={sizeFor(state, 'cleaning')} state={state} />
        </div>
      )}


      {hasLawn && (
        <div className="space-y-4 animate-calm-in" style={{ animationDelay: '60ms' }}>
          <h3 className="text-sm font-semibold text-ink-soft lowercase">{t('roughly how big is your lawn?')}</h3>
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

          <SqFtField
            label={t('mowable turf square footage')}
            placeholder="e.g. 3500"
            value={state.turfSqFt}
            onChange={v => onChange({ ...state, turfSqFt: v })}
            helper={t('grass only, not the house or driveway. 4,001–7,500 sq ft adds $30 a visit. above 7,500 we quote by hand.')}
          />
          {(state.turfSqFt ?? 0) > 7500 && (
            <QuoteNotice>{t('turf over 7,500 sq ft is quoted by hand')}</QuoteNotice>
          )}


          <SizeReadout service="lawn" size={sizeFor(state, 'lawn')} state={state} />
        </div>
      )}


      {carEligible && (
        <div className="space-y-4 animate-calm-in">
          <h3 className="text-sm font-semibold text-ink-soft lowercase">{t('wash or detail?')}</h3>
          <div className="grid gap-3 md:grid-cols-2" role="radiogroup" aria-label={t('wash or detail?')}>
            <button
              type="button"
              role="radio"
              aria-checked={hasDetailing === false && !!state.carWashes}
              disabled={hasDetailing}
              onClick={() => chooseVariant('car_wash')}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                hasDetailing
                  ? 'cursor-not-allowed border-hairline bg-cream-deep/30 opacity-60'
                  : !hasDetailing && state.carWashes
                    ? 'border-ink bg-ink text-white shadow-[0_8px_22px_-10px_hsl(var(--ink)/0.45)]'
                    : 'border-hairline bg-white hover:border-ink/40 hover:bg-cream-deep/40'
              }`}
            >
              <p className={`text-sm font-semibold lowercase ${!hasDetailing && state.carWashes ? 'text-white' : 'text-ink'}`}>
                {t('Car Wash')}
              </p>
              <p className={`text-[11px] mt-1 leading-snug ${!hasDetailing && state.carWashes ? 'text-white/70' : 'text-ink-faint'}`}>
                {hasDetailing
                  ? t('Included — a detail starts with a full exterior wash.')
                  : t('A thorough exterior wash — about an hour.')}
              </p>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={hasDetailing}
              onClick={() => chooseVariant('car_detail')}
              className={`text-left rounded-xl border-2 p-4 transition-all ${
                hasDetailing
                  ? 'border-ink bg-ink text-white shadow-[0_8px_22px_-10px_hsl(var(--ink)/0.45)]'
                  : 'border-hairline bg-white hover:border-ink/40 hover:bg-cream-deep/40'
              }`}
            >
              <p className={`text-sm font-semibold lowercase ${hasDetailing ? 'text-white' : 'text-ink'}`}>
                {t('Car Detail')}
              </p>
              <p className={`text-[11px] mt-1 leading-snug ${hasDetailing ? 'text-white/70' : 'text-ink-faint'}`}>
                {t('Full interior + exterior detail — about 3.5 hours.')}
              </p>
            </button>
          </div>
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
          <SizeReadout service="detailing" size={sizeFor(state, 'detailing')} state={state} />
        </div>
      )}
    </div>
  );
}
