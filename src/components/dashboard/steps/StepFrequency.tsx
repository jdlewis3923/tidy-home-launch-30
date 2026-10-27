import {
  ConfigState,
  ServiceType,
  Frequency,
  frequencyLabels,
  frequencyVisitCopy,
  serviceLabels,
  serviceIcons,
  sizeFor,
  getServicePrice,
  formatPlanCardDetail,
  serviceUnits,
  formatMonthly,
} from '@/lib/dashboard-pricing';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { cleaningAnnualCents, type CleaningSize } from '@/lib/pricing-canon';


interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

// Cadence no longer changes the price, so every service offers all three.
const freqOptions: Record<ServiceType, Frequency[]> = {
  cleaning: ['monthly', 'biweekly', 'weekly'],
  lawn:     ['monthly', 'biweekly', 'weekly'],
  detailing:['monthly', 'biweekly', 'weekly'],
};

const popularBy: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn:     'biweekly',
  detailing:'biweekly',
};

export default function StepFrequency({ state, onChange }: Props) {
  const { language } = useLanguage();
  const setFreq = (service: ServiceType, freq: Frequency) => {
    onChange({ ...state, frequencies: { ...state.frequencies, [service]: freq } });
  };

  return (
    <div className="space-y-7">
      {state.services.map((svc, idx) => (
        <div
          key={svc}
          className="space-y-3 animate-calm-in"
          style={{ animationDelay: `${idx * 70}ms` }}
        >
          <h3 className="text-sm font-semibold text-ink-soft flex items-center gap-2">
            <span>{serviceIcons[svc]}</span>
            <span className="lowercase">{serviceLabels[svc]}</span>
          </h3>

          {serviceUnits[svc] === 'per_month' ? (
            <p className="text-[11px] text-ink-faint">
              car care is a flat monthly price — 3 maintenance washes a month plus 2 full details a year.
            </p>
          ) : (
          <div className="grid grid-cols-3 gap-2">
            {freqOptions[svc].map(freq => {
              const selected = state.frequencies[svc] === freq;
              const popular = freq === popularBy[svc];
              return (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setFreq(svc, freq)}
                  className={`relative rounded-xl border-2 px-3 py-3.5 text-sm transition-all ${
                    selected
                      ? 'border-ink bg-ink text-white shadow-[0_8px_22px_-10px_hsl(var(--ink)/0.45)]'
                      : 'border-hairline bg-white text-ink-soft hover:border-ink/40 hover:bg-cream-deep/40'
                  }`}
                >
                  <span className="font-semibold lowercase block">{frequencyLabels[freq]}</span>
                  <span className={`block text-[10px] mt-0.5 lowercase ${selected ? 'text-white/70' : 'text-ink-faint'}`}>
                    {frequencyVisitCopy[freq]}
                  </span>
                  {popular && selected && (
                    <span className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-white animate-calm-in" />
                  )}
                </button>
              );
            })}
          </div>
          )}

          {(() => {
            const size = sizeFor(state, svc);
            if (!size || size === 'quote') return null;
            const monthly = getServicePrice(state, svc);
            return (
              <p className="text-[11px] text-ink-faint animate-calm-in">
                {serviceUnits[svc] === 'per_month'
                  ? `${formatMonthly(monthly)} — the same every month.`
                  : `${formatMonthly(monthly)} — ${formatPlanCardDetail(state, svc)}.`}
              </p>
            );
          })()}
        </div>
      ))}

      <p className="text-xs text-ink-faint">
        coming more often lowers the price per visit — biweekly is 8% less a visit than monthly, weekly is 18% less. you are always billed monthly, and you can change it anytime.
      </p>
      {state.services.includes('cleaning') && <div className="space-y-2">
        <div className="flex gap-2" role="group" aria-label={language==='es'?'Pago de limpieza':'Cleaning payment period'}>{(['monthly','yearly'] as const).map(period=><Button key={period} variant={(state.billingPeriod??'monthly')===period?'default':'outline'} aria-pressed={(state.billingPeriod??'monthly')===period} onClick={()=>onChange({...state,billingPeriod:period})}>{period==='yearly'?(language==='es'?'Anual · ahorra 10%':'Yearly · save 10%'):(language==='es'?'Mensual':'Monthly')}</Button>)}</div>
        {state.billingPeriod==='yearly' && typeof sizeFor(state,'cleaning')==='number' && <p className="font-bold">${(cleaningAnnualCents(sizeFor(state,'cleaning') as CleaningSize,state.frequencies.cleaning??'monthly')/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} {language==='es'?'por año · mismas visitas':'per year · same visits'}</p>}
      </div>}

    </div>
  );
}
