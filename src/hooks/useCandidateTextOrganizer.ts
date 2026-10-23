import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { mergeTextMessages, phoneKey, type TextMessage } from '@/lib/candidate-texts';
import type { Json } from '@/integrations/supabase/types';

export type TextCandidate = { id: string; first_name: string | null; last_name: string | null; phone: string | null; service: string | null; source: string | null; applied_on: string | null; preferred_language: string | null; archived: boolean; submitted: string | null; started: string | null; deadline: string | null; nudge: string | null; nudged: string | null; messages: TextMessage[] };
const object = (v: Json | null): Record<string, Json | undefined> => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const str = (v: Json | undefined) => typeof v === 'string' ? v : null;
export function useCandidateTextOrganizer() {
  const [rows, setRows] = useState<TextCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      // Read every page rather than silently hiding older candidate communications.
      async function all<T>(query: (from: number, to: number) => PromiseLike<{data: T[] | null; error: {message: string} | null}>) {
        const items: T[] = [];
        for (let from = 0; ; from += 500) {
          const r = await query(from, from + 499);
          if (r.error) throw new Error(r.error.message);
          items.push(...(r.data ?? []));
          if ((r.data?.length ?? 0) < 500) return items;
        }
      }
      const [apps,pipes,events,logs,outbox,receipts,deadlines] = await Promise.all([
        all((a,b) => supabase.from('applicants').select('id,first_name,last_name,phone,service,source,applied_on,preferred_language,is_test_row').order('id').range(a,b)),
        all((a,b) => supabase.from('contractor_pipeline').select('applicant_id,archived,is_test,apply_submitted_at,apply_started_at,invite_deadline_at').order('id').range(a,b)),
        all((a,b) => supabase.from('contractor_stage_events').select('id,applicant_id,metadata,reason,created_at').eq('kind','message').order('id').range(a,b)),
        all((a,b) => supabase.from('email_send_log').select('id,recipient,payload,template_name,status,twilio_sid,triggered_at,triggered_by').eq('channel','sms').order('id').range(a,b)),
        all((a,b) => supabase.from('sms_outbox').select('id,to_phone_e164,body,status,twilio_sid,created_at,sent_at,template_name,triggered_by').order('id').range(a,b)),
        all((a,b) => supabase.from('sms_delivery_events').select('message_sid,message_status,received_at').order('id').range(a,b)),
        all((a,b) => supabase.from('hiring_deadlines').select('applicant_id,kind,due_at,nudge_at,nudged_at,resolved_at').eq('kind','apply').is('resolved_at',null).order('id').range(a,b)),
      ]);
      const pipe = new Map(pipes.map(p => [p.applicant_id,p]));
      const delivery = new Map<string,{at:string;status:string}>();
      for (const r of receipts) { const old=delivery.get(r.message_sid); if (!old || r.received_at>old.at) delivery.set(r.message_sid,{at:r.received_at,status:r.message_status}); }
      const result = apps.filter(a => !a.is_test_row && !pipe.get(a.id)?.is_test && !!a.first_name?.trim()).map(a => {
        const p=pipe.get(a.id); const key=phoneKey(a.phone); const messages:TextMessage[]=[];
        for (const l of logs) if (key && phoneKey(l.recipient)===key) { const payload=object(l.payload); messages.push({id:`log:${l.id}`,at:l.triggered_at,direction:'outbound',body:str(payload.body),status:l.status,manual:l.triggered_by==='candidate-text',sid:l.twilio_sid,template:l.template_name}); }
        for (const o of outbox) if (key && phoneKey(o.to_phone_e164)===key) messages.push({id:`queue:${o.id}`,at:o.sent_at ?? o.created_at,direction:'outbound',body:o.body,status:o.status,manual:o.triggered_by==='candidate-text',sid:o.twilio_sid,template:o.template_name});
        for (const e of events) if (e.applicant_id===a.id) {const m=object(e.metadata); const text=str(m.text); const direction=m.direction==='inbound'?'inbound':'outbound'; if(text || direction==='inbound') messages.push({id:`event:${e.id}`,at:e.created_at,direction,body:text,status:direction==='inbound'?'received':m.ok===false?'failed':m.queued===true?'queued':'accepted',manual:direction==='outbound',sid:str(m.twilio_sid)});}
        const merged=mergeTextMessages(messages).map(m => ({...m,status:m.sid ? delivery.get(m.sid)?.status ?? m.status : m.status}));
        const due=deadlines.filter(d=>d.applicant_id===a.id).sort((a,b)=>b.due_at.localeCompare(a.due_at))[0];
        return {...a, archived:p?.archived ?? false,submitted:p?.apply_submitted_at ?? null,started:p?.apply_started_at ?? null,deadline:due?.due_at ?? p?.invite_deadline_at ?? null,nudge:due?.nudge_at ?? null,nudged:due?.nudged_at ?? null,messages:merged};
      });
      setRows(result); setError(null);
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not load'); }
    finally {setLoading(false);}
  },[]);
  useEffect(()=>{void load(); const timer=setInterval(()=>void load(),30000); return ()=>clearInterval(timer);},[load]);
  return {rows,error,loading,load};
}