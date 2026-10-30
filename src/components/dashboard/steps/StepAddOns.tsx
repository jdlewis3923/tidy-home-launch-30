import { ConfigState, sizeFor } from '@/lib/dashboard-pricing';
import { useAddonCatalog } from '@/hooks/useAddonCatalog';
import { addonQuote } from '@/lib/deep-clean';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

interface Props {
  state: ConfigState;
  onChange: (s: ConfigState) => void;
}

const serviceLabels = { cleaning: 'cleaning', lawn: 'lawn', detailing: 'detailing' };
const serviceIcons  = { cleaning: '🏠', lawn: '🌿', detailing: '🚗' };

export default function StepAddOns({ state, onChange }: Props) {
  const { language } = useLanguage(); const es = language === 'es';
  const catalog = useAddonCatalog(); const size = sizeFor(state, 'cleaning');
  const relevant = (catalog.data ?? []).filter(a => state.services.includes((a.services[0] === 'detail' ? 'detailing' : a.services[0]) as 'cleaning' | 'lawn' | 'detailing'))
    .map(a => ({ a, q: addonQuote(a, typeof size === 'number' ? size : null) })).filter(x => x.q);

  const toggleAddOn = (id: string) => {
    const has = state.addOns.includes(id);
    onChange({
      ...state,
      addOns: has ? state.addOns.filter(a => a !== id) : [...state.addOns, id],
      addonPrices: Object.fromEntries(relevant.map(({a,q}) => [a.addon_key, (q?.cents ?? 0) / 100])),
    });
  };

  const grouped = state.services.map(svc => ({
    service: svc,
    addOns: relevant.filter(({ a }) => a.services.includes(svc === 'detailing' ? 'detail' : svc)),
  }));

  return (
    <div className="space-y-7">
      {grouped.map((group, gi) => (
        <div key={group.service} className="space-y-3 animate-calm-in" style={{ animationDelay: `${gi * 70}ms` }}>
          <h3 className="text-sm font-semibold text-ink-soft flex items-center gap-2">
            <span>{serviceIcons[group.service]}</span>
            <span>{es ? group.service === 'cleaning' ? 'Limpieza' : group.service === 'lawn' ? 'Césped' : 'Cuidado del Auto' : group.service === 'detailing' ? 'Car Care' : serviceLabels[group.service]}</span>
          </h3>
          <div className="space-y-2">
            {group.addOns.map(({ a: addon, q }) => {
              const id = addon.addon_key;
              const selected = state.addOns.includes(id);
              return (
                <Button
                  key={id}
                  type="button"
                  onClick={() => toggleAddOn(id)}
                  variant="outline"
                  className={`h-auto w-full flex items-center justify-between rounded-lg border-2 p-4 text-left whitespace-normal transition-all ${
                    selected
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-card text-foreground'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{es ? addon.display_name_es ?? addon.display_name : addon.display_name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{es ? addon.description_es : addon.description_en}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-sm font-semibold tabular-nums text-foreground">${(q?.cents ?? 0) / 100}</span>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                      selected ? 'bg-primary/10 border-primary' : 'border-border'
                    }`}>
                      {selected && (
                        <Check className="h-3 w-3 text-primary" />
                      )}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>
      ))}

      {catalog.isError && <p role="alert" className="text-destructive">{es ? 'No se pudieron cargar los adicionales.' : 'Could not load add-ons.'}</p>}
      <p className="text-xs text-muted-foreground">{es ? 'Solo para esta primera visita; requiere un plan.' : 'For this first visit only; a plan is required.'}</p>
    </div>
  );
}
