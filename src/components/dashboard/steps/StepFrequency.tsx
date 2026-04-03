import { ConfigState, ServiceType, Frequency, frequencyLabels, serviceLabels, serviceIcons } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const freqOptions: Record<ServiceType, Frequency[]> = {
  cleaning: ['monthly', 'biweekly', 'weekly'],
  lawn: ['monthly', 'biweekly', 'weekly'],
  detailing: ['monthly', 'biweekly'],
};

export default function StepFrequency({ state, onChange }: Props) {
  const setFreq = (service: ServiceType, freq: Frequency) => {
    onChange({ ...state, frequencies: { ...state.frequencies, [service]: freq } });
  };

  return (
    <div className="space-y-8">
      {state.services.map(svc => (
        <div key={svc} className="space-y-3">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span>{serviceIcons[svc]}</span> {serviceLabels[svc]}
          </h3>
          <div className="flex flex-wrap gap-3">
            {freqOptions[svc].map(freq => {
              const selected = state.frequencies[svc] === freq;
              return (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setFreq(svc, freq)}
                  className={`rounded-lg border-[1.5px] px-5 py-3 text-sm font-semibold transition-all ${
                    selected
                      ? 'border-primary bg-primary text-primary-foreground shadow-md'
                      : 'border-border bg-card text-foreground hover:border-primary/40'
                  }`}
                >
                  {frequencyLabels[freq]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Exact price shown after you enter your home details</p>
        </div>
      ))}

      <p className="text-xs text-muted-foreground/70">You can skip, reschedule, or modify your service anytime.</p>

      <div className="flex gap-4">
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => {/* skip logic placeholder */}}
        >
          Skip next service
        </button>
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={() => {/* reschedule logic placeholder */}}
        >
          Reschedule
        </button>
      </div>
    </div>
  );
}
