import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
type Metrics = {estate_homes:number;estate_plus_homes:number;covered_cost:number;walkthrough_requests:number};
export default function EstateMetrics() {
  const { language } = useLanguage(); const es = language === 'es';
  const [data,setData] = useState<Metrics|null>(null);
  useEffect(() => { void supabase.rpc('admin_estate_metrics').then(({data:result,error}) => {if(!error && result && typeof result === 'object' && !Array.isArray(result))setData(result as Metrics);}); }, []);
  return <section className="mx-auto max-w-7xl border-y border-border px-6 py-5"><h2 className="font-bold">{es?'Primeras visitas Estate':'Estate first visits'}</h2><div className="mt-3 grid gap-4 sm:grid-cols-3"><div><p className="text-sm text-muted-foreground">{es?'Costo cubierto por Tidy':'Cost covered by Tidy'}</p><strong className="text-2xl">{data?`$${data.covered_cost}`:'—'}</strong><p className="text-xs text-muted-foreground">Estate $85 · Estate Plus $119</p></div><div><p className="text-sm">Estate: {data?.estate_homes ?? '—'} · Estate Plus: {data?.estate_plus_homes ?? '—'}</p></div><div><p className="text-sm text-muted-foreground">{es?'Solicitudes de visita para cotizar más de 7,000 pies²':'Walkthrough requests above 7,000 sq ft'}</p><strong className="text-2xl">{data?.walkthrough_requests ?? '—'}</strong></div></div></section>;
}