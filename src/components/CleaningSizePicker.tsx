import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { CLEANING_BANDS, type SizeSelection } from '@/lib/pricing-canon';

export default function CleaningSizePicker({ value, onChange }: {
  value: SizeSelection | null; onChange: (size: SizeSelection) => void;
}) {
  const { language } = useLanguage();
  const es = language === 'es';
  return <fieldset className="space-y-3">
    <legend className="text-sm font-bold text-foreground">{es ? '¿Qué tamaño tiene tu casa?' : 'How big is your home?'}</legend>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {CLEANING_BANDS.map(band => <Button key={band.size} type="button" variant="outline"
        aria-pressed={value === band.size} onClick={() => onChange(band.size)}
        className={`h-auto min-h-24 flex-col items-start whitespace-normal rounded-lg p-3 text-left ${value === band.size ? 'border-gold bg-gold/15 text-foreground' : 'text-foreground'}`}>
        <strong>{es ? band.name.replace('Size', 'Tamaño').replace('Estate Plus', 'Residencia Plus').replace('Estate', 'Residencia') : band.name}</strong>
        <span className="text-xs font-normal">{es ? band.range.replace('Up to', 'Hasta').replace('sq ft', 'pies²') : band.range}</span>
        {band.hint && <span className="text-xs font-normal text-muted-foreground">{es ? band.hint.replace('Usually', 'Generalmente').replace('bedrooms', 'habitaciones') : band.hint}</span>}
      </Button>)}
      <Button type="button" variant="outline" aria-pressed={value === 'quote'} onClick={() => onChange('quote')}
        className={`h-auto min-h-24 flex-col items-start whitespace-normal rounded-lg border-dashed p-3 text-left ${value === 'quote' ? 'border-gold bg-gold/15' : ''}`}>
        <strong>{es ? 'Más de 7,000 pies²' : 'Over 7,000 sq ft'}</strong>
        <span className="text-xs font-normal">{es ? 'Programemos una visita breve' : "Let's schedule a quick walkthrough"}</span>
      </Button>
    </div>
  </fieldset>;
}