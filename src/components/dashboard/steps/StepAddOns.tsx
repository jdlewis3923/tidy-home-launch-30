import { ConfigState, addOnData } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const serviceLabels = { cleaning: 'cleaning', lawn: 'lawn', detailing: 'detailing' };
const serviceIcons  = { cleaning: '🏠', lawn: '🌿', detailing: '🚗' };

export default function StepAddOns({ state, onChange }: Props) {
  const relevant = Object.entries(addOnData).filter(([, a]) => state.services.includes(a.service));

  const toggleAddOn = (id: string) => {
    const has = state.addOns.includes(id);
    onChange({
      ...state,
      addOns: has ? state.addOns.filter(a => a !== id) : [...state.addOns, id],
    });
  };

  const grouped = state.services.map(svc => ({
    service: svc,
    addOns: relevant.filter(([, a]) => a.service === svc),
  }));

  return (
    <div className="space-y-7">
      {grouped.map((group, gi) => (
        <div key={group.service} className="space-y-3 animate-calm-in" style={{ animationDelay: `${gi * 70}ms` }}>
          <h3 className="text-sm font-semibold text-ink-soft flex items-center gap-2">
            <span>{serviceIcons[group.service]}</span>
            <span className="lowercase">{serviceLabels[group.service]}</span>
          </h3>
          <div className="space-y-2">
            {group.addOns.map(([id, addon]) => {
              const selected = state.addOns.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAddOn(id)}
                  className={`w-full flex items-center justify-between rounded-xl border-2 p-4 text-left transition-all ${
                    selected
                      ? 'border-ink bg-ink text-white shadow-[0_8px_22px_-10px_hsl(var(--ink)/0.4)]'
                      : 'border-hairline bg-white hover:border-ink/40 hover:bg-cream-deep/40'
                  }`}
                >
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${selected ? 'text-white' : 'text-ink'}`}>{addon.name}</p>
                    <p className={`text-[11px] mt-0.5 ${selected ? 'text-white/70' : 'text-ink-faint'}`}>{addon.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className={`text-sm font-semibold tabular-nums ${selected ? 'text-white' : 'text-ink'}`}>${addon.price}</span>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      selected ? 'bg-white border-white' : 'border-hairline'
                    }`}>
                      {selected && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="hsl(var(--ink))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <p className="text-[11px] text-ink-faint">one-time. only for this first visit.</p>
    </div>
  );
}
