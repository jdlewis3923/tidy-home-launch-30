import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Search, Send, MessageSquare, Clock, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import ApplicationChannels from '@/components/admin/ApplicationChannels';
import { useApplicationChannels } from '@/hooks/useApplicationChannels';
import { useCandidateTextOrganizer } from '@/hooks/useCandidateTextOrganizer';
import { textAttention, type TextAttention } from '@/lib/candidate-texts';

export default function CandidateTextOrganizer() {
  const {language}=useLanguage(); const es=language==='es'; const t=(en:string,sp:string)=>es?sp:en;
  const {rows,error,loading,load}=useCandidateTextOrganizer();
  const channels=useApplicationChannels(rows.map(r=>r.id));
  const [query,setQuery]=useState(''); const [filter,setFilter]=useState('all'); const [archive,setArchive]=useState(false);
  const [selected,setSelected]=useState<string|null>(null); const [draft,setDraft]=useState(''); const [busy,setBusy]=useState(false);
  const labels:Record<TextAttention,string>={reply:t('Needs your reply','Necesita tu respuesta'),failed:t('Text failed','Mensaje fallido'),reminder:t('Reminder due','Recordatorio pendiente'),submitted:t('Submitted','Enviada'),waiting:t('Waiting','En espera'),not_sent:t('Not texted','Sin mensaje')};
  const fmt=(iso:string|null)=>iso ? `${new Date(iso).toLocaleString(es?'es-US':'en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} ET` : '—';
  const pool=rows.filter(r=>archive || !r.archived);
  const status=(r:typeof rows[number])=>textAttention(r.messages,!!r.submitted,r.nudge,r.nudged);
  const visible=useMemo(()=>pool.filter(r=>(filter==='all'||status(r)===filter) && `${r.first_name} ${r.last_name} ${r.phone} ${r.messages.map(m=>m.body ?? '').join(' ')}`.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>{
    const priority=(r:typeof rows[number])=>status(r)==='reply'?0:status(r)==='failed'?1:status(r)==='reminder'?2:3;
    return priority(a)-priority(b) || (b.messages.at(-1)?.at ?? '').localeCompare(a.messages.at(-1)?.at ?? '');
  }),[rows,query,filter,archive]);
  const active=rows.find(r=>r.id===selected);
  const select=(id:string)=>{setSelected(id);setDraft('');};
  const send=async()=>{
    if(!active || !draft.trim()) return;
    setBusy(true);
    try { const {data,error}=await supabase.functions.invoke('candidate-text',{body:{applicant_id:active.id,body:draft.trim()}}); if(error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'send_failed'); toast.success(data.queued?t('Queued for the next sending window','En cola para el próximo horario'):t('Accepted for sending','Aceptado para envío'));setDraft('');await load(); }
    catch {toast.error(t('Text did not send. Your draft is saved here.','El mensaje no se envió. Tu borrador sigue aquí.'));}
    finally{setBusy(false);}
  };
  const reminder=()=>{if(!active) return; const link=active.messages.flatMap(m=>m.body?.match(/https:\/\/jointidy\.co\/apply[^\s]+/g) ?? []).at(-1)?.replace(/[.,]$/,''); const name=active.first_name ?? '';setDraft(active.preferred_language==='es'?`Hola ${name}, soy Justin de Tidy. ¿Sigues interesado/a? Tu solicitud todavía no está enviada.${link?` Puedes continuar aquí: ${link}`:''} Si tienes alguna pregunta, respóndeme.`:`Hi ${name}, it's Justin from Tidy. Are you still interested? Your application hasn't been submitted yet.${link?` You can continue here: ${link}`:''} Reply if you have any questions.`);};
  return <main className="mx-auto max-w-7xl px-4 py-6 text-foreground">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">{t('Candidate texts','Mensajes de candidatos')}</h1><p className="text-sm text-muted-foreground">{t('Messages · Applications · Follow-up','Mensajes · Solicitudes · Seguimiento')}</p></div><Button variant="outline" size="icon" title={t('Refresh','Actualizar')} aria-label={t('Refresh','Actualizar')} onClick={()=>void load()}><RefreshCw className="h-4 w-4"/></Button></header>
    <div className="mb-4 flex flex-wrap gap-2">{(['all','reply','reminder','failed','submitted','waiting','not_sent'] as const).map(f=><Button key={f} variant={filter===f?'default':'outline'} size="sm" onClick={()=>{setFilter(f);setSelected(null);}}>{f==='all'?t('All','Todos'):labels[f]} <span className="ml-2 tabular-nums">{f==='all'?pool.length:pool.filter(r=>status(r)===f).length}</span></Button>)}</div>
    <div className="mb-5 flex flex-wrap items-center gap-4"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label={t('Search candidate texts','Buscar mensajes de candidatos')} placeholder={t('Search name, phone or message','Buscar nombre, teléfono o mensaje')} value={query} onChange={e=>setQuery(e.target.value)} className="pl-9"/></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={archive} onChange={e=>setArchive(e.target.checked)}/>{t('Include archived','Incluir archivados')}</label></div>
    {error && <p role="alert" className="mb-4 text-destructive">{t('Could not load text history.','No se pudo cargar el historial.')} {error}</p>}
    {loading ? <p>{t('Loading…','Cargando…')}</p> : <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className={`${active?'hidden lg:block':''} min-w-0`} aria-label={t('Candidate list','Lista de candidatos')}>
        {visible.length===0 && <p className="py-8 text-muted-foreground">{t('No matching candidates.','No hay candidatos que coincidan.')}</p>}
        {visible.map(r=>{const last=r.messages.at(-1);const out=r.messages.filter(m=>m.direction==='outbound').at(-1);return <article key={r.id} className={`mb-3 min-w-0 rounded-lg border p-4 ${selected===r.id?'border-primary bg-primary/5':'border-border bg-card'}`}>
          <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 font-semibold">{r.first_name} {r.last_name}<ApplicationChannels c={channels.get(r.id)}/></h2><Button variant="ghost" size="icon" aria-label={`${t('Open texts for','Abrir mensajes de')} ${r.first_name} ${r.last_name}`} title={t('Open conversation','Abrir conversación')} onClick={()=>select(r.id)}><MessageSquare className="h-5 w-5"/></Button></div>
          <p className={`mt-3 text-sm font-semibold ${['reply','failed','reminder'].includes(status(r))?'text-destructive':'text-primary'}`}>{labels[status(r)]}{r.archived?` · ${t('Archived','Archivado')}`:''}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs"><dt className="text-muted-foreground">{t('Last text sent','Último mensaje enviado')}</dt><dd>{fmt(out?.at ?? null)}</dd><dt className="text-muted-foreground">{t('Indeed application','Solicitud en Indeed')}</dt><dd>{r.applied_on ?? '—'}</dd><dt className="text-muted-foreground">{t('Tidy submitted','Enviada en Tidy')}</dt><dd>{fmt(r.submitted)}</dd><dt className="text-muted-foreground">{t('Application deadline','Fecha límite')}</dt><dd>{r.submitted?'—':fmt(r.deadline)}</dd></dl>
          {last && <p className="mt-3 line-clamp-2 break-words text-sm"><span className="text-muted-foreground">{last.direction==='inbound'?t('Their reply: ','Su respuesta: '):t('Tidy: ','Tidy: ')}</span>{last.body ?? t('Exact wording was not saved for this older text.','No se guardó el texto exacto de este mensaje anterior.')}</p>}
        </article>;})}
      </section>
      <section className={`${!active?'hidden lg:block':''} min-w-0 lg:sticky lg:top-6 lg:self-start`} aria-label={t('Conversation','Conversación')}>
        {!active ? <div className="flex items-center gap-3 py-12 text-muted-foreground"><MessageSquare className="h-6 w-6"/>{t('No conversation selected','Ninguna conversación seleccionada')}</div> : <>
          <Button variant="ghost" size="sm" className="mb-3 lg:hidden" onClick={()=>setSelected(null)}><ArrowLeft className="mr-2 h-4 w-4"/>{t('Back','Volver')}</Button>
          <header className="mb-4 border-b border-border pb-4"><h2 className="text-xl font-semibold">{active.first_name} {active.last_name}</h2><ApplicationChannels c={channels.get(active.id)}/><p className="mt-2 text-sm text-muted-foreground">{active.phone} · {active.service}</p><Link className="text-sm text-primary underline" to={`/admin/pipeline/${active.id}`}>{t('Open candidate','Abrir candidato')}</Link></header>
          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            {active.messages.length===0 && <p className="text-sm text-muted-foreground">{t('No recorded texts.','No hay mensajes registrados.')}</p>}
            {active.messages.map(m=><article key={m.id} className={`max-w-[95%] rounded-lg border border-border p-3 ${m.direction==='outbound'?'ml-auto bg-primary/10':'mr-auto bg-muted'}`}><div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{m.direction==='inbound'?t('Candidate','Candidato'):m.manual?t('Justin','Justin'):t('Tidy automated','Tidy automático')}</span><time>{fmt(m.at)}</time></div><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{m.body ?? t('Exact wording was not saved for this older text.','No se guardó el texto exacto de este mensaje anterior.')}</p><p className="mt-2 text-xs text-muted-foreground">{m.direction==='inbound'?t('Received','Recibido'):m.status==='sent'||m.status==='accepted'?t('Accepted · delivery unconfirmed','Aceptado · entrega sin confirmar'):m.status}</p></article>)}
          </div>
          <div className="mt-4 border-t border-border pt-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><label htmlFor="candidate-reply" className="text-sm font-semibold">{t('Your reply','Tu respuesta')}</label>{!active.submitted && <Button variant="outline" size="sm" onClick={reminder}><Clock className="mr-2 h-4 w-4"/>{t('Draft reminder','Preparar recordatorio')}</Button>}</div><Textarea id="candidate-reply" value={draft} onChange={e=>setDraft(e.target.value)} rows={4} maxLength={1200}/><div className="mt-2 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{draft.length}/1200</span><Button onClick={()=>void send()} disabled={busy || !draft.trim() || !active.phone}><Send className="mr-2 h-4 w-4"/>{busy?t('Sending…','Enviando…'):t('Send text','Enviar mensaje')}</Button></div>{!active.submitted && <p className="mt-3 flex gap-2 text-xs text-muted-foreground"><AlertCircle className="h-4 w-4 shrink-0"/>{active.nudged?`${t('Existing reminder sent','Recordatorio existente enviado')}: ${fmt(active.nudged)}`:active.nudge?`${t('Existing reminder scheduled','Recordatorio existente programado')}: ${fmt(active.nudge)}`:t('No application reminder scheduled','No hay recordatorio de solicitud programado')}</p>}</div>
        </>}
      </section>
    </div>}
  </main>;
}