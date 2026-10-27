import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CleaningWalkthroughSlots({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { language } = useLanguage();
  const [slots, setSlots] = useState<{ id: string; starts_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    supabase.from('cleaning_walkthrough_slots').select('id,starts_at,ends_at,status').eq('status','open').gt('starts_at',new Date().toISOString()).order('starts_at')
      .then(({ data }) => { if (active) { setSlots(data ?? []); setLoading(false); } });
    return () => { active = false; };
  }, []);
  const es = language === 'es';
  return <fieldset className="mt-3 space-y-2"><legend className="text-sm font-bold">{es ? 'Elige una visita para cotizar' : 'Choose a walkthrough time'}</legend>
    {loading ? <p className="text-sm text-muted-foreground">{es ? 'Cargando…' : 'Loading…'}</p> : slots.length ? slots.map(slot => <Button key={slot.id} type="button" variant={value === slot.id ? 'default' : 'outline'} aria-pressed={value === slot.id} onClick={() => onChange(slot.id)} className="h-auto min-h-11 w-full whitespace-normal">
      {new Date(slot.starts_at).toLocaleString(es ? 'es-US' : 'en-US',{ timeZone:'America/New_York', weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit' })} ET
    </Button>) : <p className="text-sm text-muted-foreground">{es ? 'No hay horarios disponibles todavía. Puedes reservar sin cargo mientras abrimos horarios.' : 'No walkthrough times are available yet. You can reserve without a charge while we open times.'}</p>}
  </fieldset>;
}