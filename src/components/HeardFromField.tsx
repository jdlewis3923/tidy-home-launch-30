import { useId } from 'react';
import { HEARD_FROM, HEARD_LABELS } from '@/lib/heard-from';
import { useLanguage } from '@/contexts/LanguageContext';
export default function HeardFromField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const { language } = useLanguage();
  return <div className="space-y-2"><label htmlFor={id} className="text-sm font-semibold text-foreground">{language === 'es' ? '¿Cómo nos conociste?' : 'How did you hear about us?'} *</label>
    <select id={id} required value={value} onChange={e => onChange(e.target.value)} className="min-h-[44px] w-full rounded-lg border border-border bg-background px-3 text-base text-foreground">
      <option value="">{language === 'es' ? 'Selecciona una opción' : 'Select one'}</option>
      {HEARD_FROM.map(key => <option key={key} value={key}>{HEARD_LABELS[key][language === 'es' ? 1 : 0]}</option>)}
    </select></div>;
}