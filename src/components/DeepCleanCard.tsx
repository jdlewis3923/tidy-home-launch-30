import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAddonCatalog } from '@/hooks/useAddonCatalog';
import { useServiceScope, txt } from '@/lib/serviceScope';
import { addonQuote } from '@/lib/deep-clean';
export default function DeepCleanCard() {
  const { language } = useLanguage(); const es = language === 'es';
  const catalog = useAddonCatalog(); const scope = useServiceScope();
  const addon = catalog.data?.find(a => a.addon_key === 'deep_clean');
  if (!addon) return null;
  return <section className="mt-8 border-y border-border py-8 text-left">
    <h2 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Sparkles className="text-primary" />{es ? 'Limpieza profunda' : 'Deep Clean'}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{es ? addon.description_es : addon.description_en}</p>
    <ul className="my-4 grid gap-2 text-sm text-foreground sm:grid-cols-2">{(scope.data ?? []).filter(r => r.addon_key === 'deep_clean').map(r => <li key={r.id}>✓ {txt(r, language)}</li>)}</ul>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[1, 2, 3, 4, 5].map(size => { const q = addonQuote(addon, size); return <div key={size}><dt className="text-xs text-muted-foreground">{size < 4 ? `${es ? 'Tamaño' : 'Size'} ${size}` : size === 4 ? 'Estate' : 'Estate Plus'}</dt><dd className="font-bold text-foreground">{q?`$${q.cents/100}`:es?'Cotización':'Quote'}</dd></div>; })}</dl>
    <p className="mt-4 text-sm text-muted-foreground">{es ? 'Estate: el detalle extra de zócalos, persianas, ventiladores y paredes se reserva solo dentro de la Limpieza profunda. Más de 7,000 pies²: cotización por escrito en la visita de evaluación. Solo con un plan.' : 'Estate: extra baseboard, blind, fan and wall detail is booked only inside Deep Clean. Over 7,000 sq ft: written walkthrough quote. Only with a plan.'}</p>
    <Link to="/founding?service=cleaning" className="mt-4 inline-block font-semibold text-primary underline">{es ? 'Añádela a cualquier visita' : 'Add it to any visit'}</Link>
  </section>;
}