import { ConfigState, addOnData } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

export default function StepAddOns({ state, onChange }: Props) {
  const relevantAddOns = Object.entries(addOnData).filter(([, a]) => state.services.includes(a.service));

  const toggleAddOn = (id: string) => {
    const has = state.addOns.includes(id);
    onChange({
      ...state,
      addOns: has ? state.addOns.filter(a => a !== id) : [...state.addOns, id],
    });
  };

  const grouped = state.services.map(svc => ({
    service: svc,
    addOns: relevantAddOns.filter(([, a]) => a.service === svc),
  }));

  const serviceLabels = { cleaning: '🏠 House Cleaning', lawn: '🌿 Lawn Care', detailing: '🚗 Car Detailing' };

  return (
    <div className="space-y-8">
      {grouped.map(group => (
        <div key={group.service} className="space-y-3">
          <h3 className="text-lg font-bold text-foreground">{serviceLabels[group.service]}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {group.addOns.map(([id, addon]) => {
              const selected = state.addOns.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleAddOn(id)}
                  className={`flex items-center justify-between rounded-xl border-[1.5px] p-4 text-left transition-all ${
                    selected
                      ? 'border-primary bg-secondary shadow-sm'
                      : 'border-border bg-card hover:border-primary/30'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-sm text-foreground">{addon.name}</p>
                    <p className="text-xs text-muted-foreground">{addon.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-sm font-bold text-foreground">${addon.price}</span>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selected ? 'bg-primary border-primary' : 'border-border'
                    }`}>
                      {selected && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
