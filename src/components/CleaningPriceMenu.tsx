import { useState } from 'react';
import { CLEANING_BANDS, CLEANING_MONTHLY, CLEANING_PER_VISIT, CADENCES, cleaningAnnualCents, type CanonCadence } from '@/lib/pricing-canon';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CleaningPriceMenu() {
  const { language } = useLanguage();
  const es = language === 'es';
  const [cadence,setCadence] = useState<CanonCadence>('biweekly');
  const [yearly,setYearly] = useState(false);
  return <div className="mt-8 space-y-4">
    <h3 className="text-center text-xl font-bold">{es ? 'Limpieza desde $139 al mes' : 'Cleaning from $139 a month'}</h3>
    <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={es?'Frecuencia de limpieza':'Cleaning frequency'}>
      {CADENCES.map(c=><Button key={c} variant={cadence===c?'default':'outline'} aria-pressed={cadence===c} onClick={()=>setCadence(c)}>{c==='monthly'?(es?'Una vez al mes':'Once a month'):c==='biweekly'?(es?'Cada 2 semanas':'Every 2 weeks'):(es?'Semanal':'Weekly')}</Button>)}
    </div>
    <div className="flex justify-center gap-2" role="group" aria-label={es?'Periodo de pago':'Payment period'}>{[false,true].map(y=><Button key={String(y)} variant={yearly===y?'default':'outline'} aria-pressed={yearly===y} onClick={()=>setYearly(y)}>{y?(es?'Anual · ahorra 10%':'Yearly · save 10%'):(es?'Mensual':'Monthly')}</Button>)}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{CLEANING_BANDS.map(b=><article key={b.size} className="rounded-lg border border-border bg-card p-4">
      <h4 className="font-bold">{es?b.name.replace('Size','Tamaño').replace('Estate Plus','Residencia Plus').replace('Estate','Residencia'):b.name}</h4>
      <p className="text-xs text-muted-foreground">{es?b.range.replace('Up to','Hasta').replace('sq ft','pies²'):b.range}</p>
      <p className="mt-2 text-xl font-bold">${(yearly?cleaningAnnualCents(b.size,cadence)/100:CLEANING_MONTHLY[b.size][cadence]).toLocaleString(es?'es-US':'en-US',{minimumFractionDigits:yearly?2:0,maximumFractionDigits:yearly?2:0})}<span className="text-sm font-normal">{yearly?(es?'/año':'/year'):(es?'/mes':'/mo')}</span></p>
      <p className="mt-1 text-xs text-muted-foreground">${CLEANING_PER_VISIT[b.size][cadence]} {es?'por visita':'per visit'} · {es?'hasta':'up to'} {b.baths} {es?'baños':'baths'}</p>
    </article>)}</div>
    <p className="text-center text-sm text-muted-foreground">{es?'Más de 7,000 pies²: programemos una visita breve.':'Over 7,000 sq ft: let’s schedule a quick walkthrough.'}</p>
  </div>;
}