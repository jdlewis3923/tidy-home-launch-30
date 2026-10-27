import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CalendarPlus } from 'lucide-react';

export default function CleaningWalkthroughCalendar() {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [slots, setSlots] = useState<{id:string; starts_at:string; status:string}[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const r = await supabase.from('cleaning_walkthrough_slots').select('id,starts_at,status').gte('starts_at',new Date().toISOString()).order('starts_at');
    if (r.error) setError(r.error.message); else setSlots(r.data ?? []);
  };
  useEffect(() => { void load(); }, []);
  const add = async () => {
    if (!start || !end) return;
    const a = new Date(start), b = new Date(end);
    if (a <= new Date() || b <= a) { setError('Choose a future start and a later end.'); return; }
    setBusy(true); setError('');
    const { error } = await supabase.from('cleaning_walkthrough_slots').insert({ starts_at:a.toISOString(), ends_at:b.toISOString() });
    setBusy(false);
    if (error) setError(error.message); else { setStart(''); setEnd(''); await load(); }
  };
  return <section className="space-y-3 border-t border-border pt-5">
    <h2 className="text-lg font-bold">Cleaning walkthroughs</h2>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Start · your local time<input aria-label="Walkthrough start" type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} className="mt-1 block rounded-md border bg-background p-2 text-foreground" /></label>
      <label className="text-sm">End · your local time<input aria-label="Walkthrough end" type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 block rounded-md border bg-background p-2 text-foreground" /></label>
      <Button onClick={add} disabled={!start || !end || busy}><CalendarPlus /> Add time</Button>
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <ul className="divide-y divide-border">{slots.map(slot=><li key={slot.id} className="flex items-center justify-between gap-3 py-2 text-sm">
      <span>{new Date(slot.starts_at).toLocaleString('en-US',{timeZone:'America/New_York'})} ET · {slot.status}</span>
      {slot.status==='open' && <Button variant="ghost" size="sm" onClick={async()=>{const {error}=await supabase.from('cleaning_walkthrough_slots').update({status:'canceled'}).eq('id',slot.id).eq('status','open');if(error)setError(error.message);else await load();}}>Remove time</Button>}
    </li>)}</ul>
  </section>;
}