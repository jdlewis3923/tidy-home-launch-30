import { ConfigState, ServiceType, Frequency, frequencyLabels, serviceLabels, serviceIcons } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const freqOptions: Record<ServiceType, Frequency[]> = {
  cleaning: ['monthly', 'biweekly', 'weekly'],
  lawn:     ['monthly', 'biweekly', 'weekly'],
  detailing:['monthly', 'biweekly'],
};

const popularBy: Record<ServiceType, Frequency> = {
  cleaning: 'biweekly',
  lawn:     'biweekly',
  detailing:'biweekly',
};

export default function StepFrequency({ state, onChange }: Props) {
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

          <div className="grid grid-cols-3 gap-2">
            {freqOptions[svc].map(freq => {
              const selected = state.frequencies[svc] === freq;
              const popular = freq === popularBy[svc];
              return (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setFreq(svc, freq)}
                  className={`relative rounded-xl border bg-white px-3 py-3.5 text-sm transition-all ${
                    selected
                      ? 'border-ink text-ink shadow-[0_6px_18px_-10px_hsl(var(--ink)/0.3)]'
                      : 'border-hairline text-ink-soft hover:border-ink/40'
                  }`}
                >
                  <span className="font-semibold lowercase block">{frequencyLabels[freq]}</span>
                  {popular && selected && (
                    <span className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-ink animate-calm-in" />
                  )}
                </button>
              );
            })}
          </div>

          {state.frequencies[svc] === popularBy[svc] && (
            <p className="text-[11px] text-ink-faint animate-calm-in">
              most members choose biweekly.
            </p>
          )}
        </div>
      ))}

      <p className="text-xs text-ink-faint">change anytime — no lock-in.</p>
    </div>
  );
}
