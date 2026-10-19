import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, FlaskConical, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { fillLifecycleCopy, type SimulationResult } from '@/lib/lifecycle-simulation';
export default function LifecycleSimulator() {
 const { language } = useLanguage(); const es = language === 'es';
 const [contacts, setContacts] = useState<Array<{ id: string; first_name: string | null; lifecycle_stage: string }>>([]);
 const [rules, setRules] = useState<Array<{ event: string; label_en: string; label_es: string }>>([]);
 const [contact, setContact] = useState(''); const [event, setEvent] = useState('PRICE_SEEN');
 const [busy, setBusy] = useState(false); const [error, setError] = useState('');
 const [result, setResult] = useState<SimulationResult | null>(null);
 useEffect(() => { void Promise.all([
 supabase.from('contacts').select('id,first_name,lifecycle_stage').eq('is_test', true).order('first_name'),
 supabase.from('lifecycle_event_rules').select('event,label_en,label_es').order('event'),
 ]).then(([c, r]) => { if (c.error || r.error) { setError(c.error?.message ?? r.error?.message ?? ''); return; } setContacts(c.data ?? []); setRules(r.data ?? []); setContact(c.data?.[0]?.id ?? ''); }); }, []);
 async function fire(journey: boolean) {
 setBusy(true); setError('');
 const { data, error: err } = await supabase.rpc('lifecycle_simulate', { _contact_id: contact, _event: event, _journey: journey, _tokens: { first: 'Test member', pro_name: 'Test Pro', service: es ? 'limpieza' : 'cleaning', time_window: es ? 'por la mañana' : 'morning', visit_date: '2026-11-23', convert_date: '2026-11-16', launch: '2026-11-23', founding_number: 'TEST', zip_name: 'Test neighborhood', plan: 'Test plan', price_month: 'Sample', reason: 'Test reason', eta: '15 min', addon_name: 'Test add-on', deadline: '2026-11-30', link: 'https://jointidy.co/account', pay_link: 'https://jointidy.co/billing', rating_link: 'https://jointidy.co/rate', referral_link: 'https://jointidy.co/refer', review_link: 'https://jointidy.co/refer' } });
 setBusy(false); if (err) { setError(err.message); return; } setResult(data as unknown as SimulationResult);
 }
 return <main className="relative z-10 space-y-6 p-4">
 <Button variant="ghost" asChild><Link to="/admin/messages"><ArrowLeft className="mr-2 h-4 w-4" />{es ? 'Mensajes' : 'Messages'}</Link></Button>
 <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold flex items-center gap-2"><FlaskConical className="h-6 w-6" />{es ? 'Simulador de mensajes' : 'Message simulator'}</h1><Badge variant="secondary">{es ? 'Prueba · sin envíos' : 'Shadow · no sends'}</Badge></header>
 <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><label className="text-sm font-medium">{es ? 'Contacto de prueba' : 'Test contact'}</label><Select value={contact} onValueChange={setContact}><SelectTrigger aria-label="Test contact"><SelectValue /></SelectTrigger><SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.first_name ?? 'Test'} · {c.lifecycle_stage}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><label className="text-sm font-medium">{es ? 'Evento' : 'Event'}</label><Select value={event} onValueChange={setEvent}><SelectTrigger aria-label="Event"><SelectValue /></SelectTrigger><SelectContent>{rules.map(r => <SelectItem key={r.event} value={r.event}>{es ? r.label_es : r.label_en}</SelectItem>)}</SelectContent></Select></div></div>
 <div className="flex flex-wrap gap-3"><Button disabled={busy || !contact} onClick={() => fire(false)}><Play className="mr-2 h-4 w-4" />{es ? 'Activar evento' : 'Fire'}</Button><Button variant="outline" disabled={busy || !contact} onClick={() => fire(true)}><FlaskConical className="mr-2 h-4 w-4" />{es ? 'Recorrido completo' : 'Run full journey'}</Button></div>
 {error && <p role="alert" className="text-destructive">{error}</p>}
 {result && <><div role="status" className="flex flex-wrap gap-3 border-y py-4 text-sm"><span>{result.messages} {es ? 'mensajes' : 'messages'}</span><span>{result.orphans} {es ? 'sin próximo mensaje' : 'orphans'}</span><span>{es ? 'Duplicados bloqueados' : 'Duplicates blocked'}: {result.duplicate_protection ? 'PASS' : 'FAIL'}</span></div><ol className="space-y-6">{result.timeline.map((step, i) => <li key={`${result.simulation_id}-${i}`} className="border-l-2 border-primary pl-4"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{i + 1}. {step.event}</h2><Badge variant="outline">{step.prior_stage} → {step.stage}</Badge></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{step.messages.map(m => <article key={m.id} className="rounded-lg border bg-card p-4"><div className="flex items-center justify-between gap-2 text-xs text-muted-foreground"><Badge variant="secondary">{m.channel}</Badge><time>{new Date(m.send_at).toLocaleString(es ? 'es-US' : 'en-US', { timeZone: 'America/New_York' })} ET</time></div>{m.subject && <h3 className="mt-3 font-semibold">{fillLifecycleCopy(m.subject, m.tokens)}</h3>}<p className="mt-2 whitespace-pre-wrap text-sm">{fillLifecycleCopy(m.body ?? m.template_key, m.tokens)}</p></article>)}</div></li>)}</ol></>}
 </main>;
}
