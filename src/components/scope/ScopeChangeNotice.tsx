import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Checkbox } from '@/components/ui/checkbox';
import { useServiceScope, txt } from '@/lib/serviceScope';
export default function ScopeChangeNotice(){
 const {language}=useLanguage();const es=language==='es';const scope=useServiceScope();
 const q=useQuery({queryKey:['scope_change_notices'],queryFn:async()=>{const {data,error}=await supabase.from('member_notifications').select('id,title,body').eq('kind','scope_change').is('read_at',null);if(error)throw error;return data??[];}});
 if(!q.data?.length)return null;
 return <section className="space-y-3 border-y border-primary/30 py-4"><h2 className="font-bold text-foreground">{es?'Actualizamos lo que incluye tu plan':'We updated what’s included'}</h2><p className="text-sm text-muted-foreground">{es?'Tu servicio continúa sin interrupciones.':'Your service continues without interruption.'}</p>{q.data.map(n=><section key={n.id} className="space-y-3"><p className="text-sm text-foreground">{n.body}</p><details><summary className="text-primary">{es?'Ver lo que incluye':'View what’s included'}</summary><ul className="mt-3 space-y-2 text-sm">{(scope.data??[]).filter(r=>r.section==='included').map(r=><li key={r.id}>{txt(r,language)}</li>)}</ul></details><label className="flex items-start gap-3 text-sm"><Checkbox className="mt-1 shrink-0" onCheckedChange={async v=>{if(v===true){const {error}=await supabase.from('member_notifications').update({read_at:new Date().toISOString()}).eq('id',n.id);if(!error)void q.refetch();}}}/>{es?'He leído la actualización.':'I’ve read the update.'}</label></section>)}</section>;
}