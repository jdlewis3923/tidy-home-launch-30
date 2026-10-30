import { useEffect, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAddonCatalog } from '@/hooks/useAddonCatalog';
import { addonQuote } from '@/lib/deep-clean';
import { GROUP_NAME, GROUP_SCOPES, txt, useServiceScope, type ScopeGroup } from '@/lib/serviceScope';

export interface ReviewProps {
  groups: ScopeGroup[]; checked: Partial<Record<ScopeGroup, boolean>>;
  onChange: (next: Partial<Record<ScopeGroup, boolean>>) => void;
  cleaningSize?: number | null; selectedAddons?: string[];
  onAddonsChange?: (keys: string[]) => void;
}
function ReviewCard({ group, checked, onCheck, cleaningSize, selectedAddons = [], onAddonsChange }: {
  group: ScopeGroup; checked: boolean; onCheck: (v: boolean) => void;
  cleaningSize?: number | null; selectedAddons?: string[]; onAddonsChange?: (keys: string[]) => void;
}) {
  const { language } = useLanguage(); const es = language === 'es';
  const scope = useServiceScope(); const catalog = useAddonCatalog();
  const ref = useRef<HTMLDivElement>(null); const [unlocked, setUnlocked] = useState(false);
  const scopes = GROUP_SCOPES[group].filter(s => s !== 'cleaning_deep_clean');
  const rows = (scope.data ?? []).filter(r => scopes.some(s => s === r.service));
  const name = GROUP_NAME[group][es ? 1 : 0];
  useEffect(() => {
    setUnlocked(false);
    const el = ref.current; if (!el || !rows.length || scope.isFetching) return;
    let visible = false; let elapsed = 0;
    const observer = new IntersectionObserver(entries => { visible = entries.some(e => e.isIntersecting); }, { threshold: 0.8 });
    observer.observe(el);
    const timer = window.setInterval(() => {
      if (!visible || document.visibilityState !== 'visible' || el.scrollHeight > el.clientHeight + 2) { elapsed = 0; return; }
      elapsed += 250; if (elapsed >= 6000) setUnlocked(true);
    }, 250);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [group, scope.data, scope.isFetching]);
  const service = group === 'cleaning' ? 'cleaning' : group === 'lawn' ? 'lawn' : 'detail';
  const addons = (catalog.data ?? []).filter(a => a.services.includes(service))
    .map(a => ({ a, q: addonQuote(a, cleaningSize ?? null) })).filter(x => x.q);
  const deep = addons.find(x => x.a.addon_key === 'deep_clean');
  const deepRows = (scope.data ?? []).filter(r => r.addon_key === 'deep_clean' && r.active);
  const toggle = (key: string) => onAddonsChange?.(selectedAddons.includes(key) ? selectedAddons.filter(k => k !== key) : [...selectedAddons, key]);
  return <article className="rounded-lg border border-border bg-card p-4">
    <h3 className="mb-3 text-lg font-bold text-foreground">{name}</h3>
    <div ref={ref} tabIndex={0} aria-label={name} className="max-h-[460px] space-y-5 overflow-y-auto pr-2"
      onScroll={e => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) setUnlocked(true); }}>
      {scope.isError ? <p role="alert" className="text-destructive">{es ? 'No se pudo cargar el alcance.' : 'Could not load what is included.'}</p> : !rows.length ? <p>{es ? 'Cargando…' : 'Loading…'}</p> : <>
        {(['included', 'not_included'] as const).map(section => <section key={section} className="space-y-2">
          <h4 className="font-semibold text-foreground">{section === 'included' ? es ? 'Cada visita incluye' : 'Every visit includes' : es ? 'No incluido' : 'Not included'}</h4>
          <ul className="space-y-2">{rows.filter(r => r.section === section).map(r => <li key={r.id} className="flex gap-2 text-sm text-foreground">
            {section === 'included' ? <Check className="mt-1 h-4 w-4 shrink-0 text-success" /> : <X className="mt-1 h-4 w-4 shrink-0 text-destructive" />}{txt(r, language)}
          </li>)}</ul>
        </section>)}
        {group === 'cleaning' && <aside className="space-y-3 border-l-4 border-primary bg-primary/5 p-3 text-sm text-foreground">
          <p>{es ? 'Tu plan es una limpieza de mantenimiento que mantiene tu hogar limpio, visita tras visita. No es una limpieza profunda.' : 'Your plan is a maintenance clean that keeps your home consistently clean, visit after visit. It is not a deep clean.'}</p>
          <p>{deep?.q ? es ? `¿Quieres una? Añade una Limpieza profunda ($${deep.q.cents / 100} para tu hogar) a cualquier visita:` : `Want one? Add a Deep Clean ($${deep.q.cents / 100} for your home) to any visit:` : es ? 'La Limpieza profunda se cotiza según el tamaño verificado de tu hogar.' : 'Deep Clean is quoted for your verified home size.'} {deepRows.map(r => txt(r, language)).join(' · ')}.</p>
          <p>{es ? 'Los planes semanales también incluyen una limpieza profunda trimestral cada 13 semanas.' : 'Weekly plans also include a quarterly deep clean every 13th week.'}</p>
          {deep?.q && onAddonsChange && <label className="flex items-center justify-between gap-3">
            <span>{es ? `Empezar con una Limpieza profunda en mi primera visita (+$${deep.q.cents / 100})` : `Start with a Deep Clean on my first visit (+$${deep.q.cents / 100})`}</span>
            <Switch checked={selectedAddons.includes('deep_clean')} onCheckedChange={() => toggle('deep_clean')} />
          </label>}
        </aside>}
        {onAddonsChange && <section className="space-y-2"><h4 className="font-semibold">{es ? 'Servicios adicionales' : 'Add-ons'}</h4>
          {addons.map(({ a, q }) => <div key={a.addon_key} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm">
            <span>{es ? a.display_name_es ?? a.display_name : a.display_name} · ${((q?.cents ?? 0) / 100).toFixed(2)}</span>
            <Button size="sm" variant={selectedAddons.includes(a.addon_key) ? 'secondary' : 'outline'} onClick={() => toggle(a.addon_key)}><Plus className="mr-1 h-3 w-3" />{selectedAddons.includes(a.addon_key) ? es ? 'Añadido' : 'Added' : es ? 'Añadir' : 'Add'}</Button>
          </div>)}
        </section>}
      </>}
    </div>
    {!unlocked && <p className="mt-3 text-xs text-muted-foreground">{es ? 'Desplázate para leer todo y continuar.' : 'Scroll to read everything to continue.'}</p>}
    <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-foreground"><Checkbox className="mt-1 shrink-0" disabled={!unlocked || scope.isError} checked={checked} onCheckedChange={v => onCheck(v === true)} /><span>{es ? `He leído lo que incluye y no incluye mi plan de ${name}.` : `I've read what my ${name} plan includes and doesn't include.`}</span></label>
  </article>;
}
export default function BeforeYouBook({ groups, checked, onChange, ...props }: ReviewProps) {
  const { language } = useLanguage(); const es = language === 'es'; const [terms, setTerms] = useState(false);
  const [serviceChecks, setServiceChecks] = useState<Partial<Record<ScopeGroup, boolean>>>({});
  const groupKey = groups.join(',');
  useEffect(() => { setTerms(false); setServiceChecks({}); onChange({}); }, [groupKey]);
  const commit = (next: Partial<Record<ScopeGroup, boolean>>, agreed: boolean) => onChange(Object.fromEntries(groups.map(g => [g, agreed && next[g] === true])));
  return <section className="space-y-4" data-before-you-book>
    <h2 className="text-xl font-bold text-foreground">{es ? 'Antes de reservar' : 'Before you book'}</h2>
    {groups.map(g => <ReviewCard key={g} group={g} checked={serviceChecks[g] === true} onCheck={v => { const next = { ...serviceChecks, [g]: v }; setServiceChecks(next); commit(next, terms); }} {...props} />)}
    <label className="flex min-h-11 items-start gap-3 text-sm text-foreground"><Checkbox className="mt-1 shrink-0" checked={terms} onCheckedChange={v => { setTerms(v === true); commit(serviceChecks, v === true); }} /><span>{es ? 'Acepto los ' : 'I agree to the '}<a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline">{es ? 'Términos de Servicio de Tidy.' : 'Tidy Terms of Service.'}</a></span></label>
  </section>;
}