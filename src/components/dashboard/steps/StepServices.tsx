import { ConfigState, ServiceType } from '@/lib/dashboard-pricing';
import { SERVICE_WAITLIST_NOTE, isServiceAvailable as baseAvailable } from '@/lib/service-availability';
import { useFoundingCounts, isZipFull } from '@/hooks/useFoundingCounts';
import { useLanguage } from '@/contexts/LanguageContext';
import { Home, Leaf, Car, ChevronRight, Check } from 'lucide-react';
import cleaningImg from '@/assets/svc-cleaning-hd.webp';
import lawnImg from '@/assets/svc-lawn-hd.webp';
import carImg from '@/assets/svc-car-hd.webp';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
  /** Reservations: every service can be picked. */
  allowAll?: boolean;
}

const services: { id: ServiceType; Icon: typeof Home; img: string; en: string; es: string; subEn: string; subEs: string }[] = [
  { id: 'cleaning', Icon: Home, img: cleaningImg, en: 'House Cleaning', es: 'Limpieza del Hogar', subEn: 'A fresh, spotless home.', subEs: 'Un hogar fresco y reluciente.' },
  { id: 'lawn', Icon: Leaf, img: lawnImg, en: 'Lawn Care', es: 'Cuidado del Césped', subEn: 'A clean, healthy lawn.', subEs: 'Un césped limpio y sano.' },
  { id: 'detailing', Icon: Car, img: carImg, en: 'Car Care', es: 'Cuidado del Auto', subEn: 'A showroom clean, at home.', subEs: 'Como de agencia, en tu casa.' },
];

export default function StepServices({ state, onChange, allowAll = false }: Props) {
  const isServiceAvailable = (id: ServiceType) => allowAll || baseAvailable(id);
  const { data: counts } = useFoundingCounts();
  const { language } = useLanguage();
  const es = language === 'es';
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
    <div className="space-y-4">
      {services.map((svc) => {
        const selected = state.services.includes(svc.id);
        const available = isServiceAvailable(svc.id);
        const note = !available ? SERVICE_WAITLIST_NOTE : allowAll && isZipFull(counts, state.zip)
          ? (es ? 'Grupo fundador lleno — únete a la lista' : 'Founding group full — join the waitlist') : (es ? svc.subEs : svc.subEn);
        return (
          <button key={svc.id} type="button" disabled={!available} aria-pressed={selected} onClick={() => toggle(svc.id)}
            className={`svc-card group block w-full overflow-hidden rounded-2xl text-left transition-all ${selected ? 'svc-card-on' : ''} ${!available ? 'opacity-60 cursor-not-allowed' : ''}`}>
            <span className="relative block aspect-[16/6] overflow-hidden">
              <img src={svc.img} alt="" loading="lazy" decoding="async" width={1920} height={1088} className="h-full w-full object-cover" />
              <span className={`svc-check absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full ${selected ? 'svc-check-on' : ''}`}>
                {selected && <Check className="h-5 w-5" strokeWidth={3} />}
              </span>
            </span>
            <span className="flex items-center gap-4 px-4 py-3.5">
              <svc.Icon className="svc-icon h-8 w-8 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="svc-title block text-lg font-bold">{es ? svc.es : svc.en}</span>
                <span className="svc-sub block text-sm font-normal">{note}</span>
              </span>
              <ChevronRight className="svc-sub h-5 w-5 shrink-0" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
