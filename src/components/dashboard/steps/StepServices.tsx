import { ConfigState, ServiceType } from '@/lib/dashboard-pricing';
import { SERVICE_WAITLIST_NOTE, isServiceAvailable } from '@/lib/service-availability';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const services: { id: ServiceType; name: string; icon: string; whisper: string }[] = [
  { id: 'cleaning', name: 'cleaning', icon: '🏠', whisper: 'every room. every visit.' },
  { id: 'lawn',     name: 'lawn',     icon: '🌿', whisper: 'sharp lines. clean edges.' },
  { id: 'detailing',name: 'detailing',icon: '🚗', whisper: 'we come to your driveway.' },
];

export default function StepServices({ state, onChange }: Props) {
  const toggle = (id: ServiceType) => {
    if (!isServiceAvailable(id)) return;
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

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        {services.map((svc, idx) => {
          const selected = state.services.includes(svc.id);
          const available = isServiceAvailable(svc.id);
          return (
            <button
              key={svc.id}
              type="button"
              disabled={!available}
              aria-disabled={!available}
              onClick={() => toggle(svc.id)}
              style={{ animationDelay: `${idx * 60}ms` }}
              className={`group relative w-full overflow-hidden rounded-2xl border-2 text-left transition-all duration-300 animate-calm-in ${
                !available
                  ? 'border-hairline bg-cream-deep/40 text-ink cursor-not-allowed opacity-60'
                  : selected
                  ? 'border-ink bg-ink text-white shadow-[0_12px_32px_-12px_hsl(var(--ink)/0.45)]'
                  : 'border-hairline bg-white text-ink hover:border-ink/40 hover:shadow-[0_6px_18px_-12px_hsl(var(--ink)/0.18)]'
              }`}
            >
              <div className="flex items-center gap-4 p-5">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl transition-colors ${
                  selected ? 'bg-white/15 text-white' : 'bg-cream-deep'
                }`}>
                  {svc.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className={`text-lg font-semibold lowercase ${selected ? 'text-white' : 'text-ink'}`}>{svc.name}</h3>
                  <p className={`text-xs mt-0.5 ${selected && available ? 'text-white/70' : 'text-ink-faint'}`}>
                    {available ? svc.whisper : SERVICE_WAITLIST_NOTE}
                  </p>
                </div>
                {available ? (
                  <div className={`relative h-6 w-11 rounded-full transition-colors ${selected ? 'bg-white/25' : 'bg-hairline'}`}>
                    <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${selected ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </div>
                ) : (
                  <span className="shrink-0 rounded-full border border-hairline px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                    Soon
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink-faint">
        you can change this anytime.
      </p>
    </div>
  );
}
