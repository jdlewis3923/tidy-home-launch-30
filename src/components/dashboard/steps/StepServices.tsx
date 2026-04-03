import { ConfigState, ServiceType } from '@/lib/dashboard-pricing';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const services: { id: ServiceType; name: string; icon: string; anchor: string; gradient: string }[] = [
  { id: 'cleaning', name: 'House Cleaning', icon: '🏠', anchor: 'Most popular · members pair with lawn care', gradient: 'from-[#1d4ed8] to-[#60a5fa]' },
  { id: 'lawn', name: 'Lawn Care', icon: '🌿', anchor: 'Best value · pairs perfectly with cleaning', gradient: 'from-[#16a34a] to-[#4ade80]' },
  { id: 'detailing', name: 'Car Detailing', icon: '🚗', anchor: 'We come to your driveway · no drop-off needed', gradient: 'from-[#7c3aed] to-[#c084fc]' },
];

export default function StepServices({ state, onChange }: Props) {
  const toggle = (id: ServiceType) => {
    const has = state.services.includes(id);
    const next = has ? state.services.filter(s => s !== id) : [...state.services, id];
    const freqs = { ...state.frequencies };
    if (!has) {
      freqs[id] = id === 'lawn' ? 'monthly' : 'biweekly';
    } else {
      delete freqs[id];
    }
    onChange({ ...state, services: next, frequencies: freqs });
  };

  const count = state.services.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {services.map(svc => {
          const selected = state.services.includes(svc.id);
          return (
            <button
              key={svc.id}
              type="button"
              onClick={() => toggle(svc.id)}
              className={`relative overflow-hidden rounded-xl border-[1.5px] bg-card text-left transition-all duration-200 hover:shadow-lg ${
                selected
                  ? 'border-primary shadow-[0_0_0_1px_hsl(var(--primary))] bg-secondary'
                  : 'border-border hover:border-primary/30'
              }`}
            >
              <div className={`h-1 w-full bg-gradient-to-r ${svc.gradient}`} />
              <div className="p-5">
                <div className="text-3xl mb-2">{svc.icon}</div>
                <h3 className="text-lg font-bold text-foreground">{svc.name}</h3>
                <p className="text-sm italic text-muted-foreground mt-1">{svc.anchor}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    {selected ? 'Selected' : 'Add this'}
                  </span>
                  <div className={`w-11 h-6 rounded-full transition-colors ${selected ? 'bg-primary' : 'bg-border'} relative`}>
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform ${selected ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground">
          💡 Select 2 services for 15% off · All 3 for 20% off — applied automatically
        </div>
      </div>

      {count === 0 && (
        <p className="text-center text-sm text-destructive">
          Pick at least one service to continue — you've got to start somewhere! 😄
        </p>
      )}
    </div>
  );
}
