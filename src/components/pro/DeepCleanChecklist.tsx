import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { useServiceScope, txt } from '@/lib/serviceScope';
import { Button } from '@/components/ui/button';
import { Camera, Check } from 'lucide-react';
export default function DeepCleanChecklist({attachId,visitId}:{attachId:string;visitId:string}) {
  const {language}=useLanguage();const es=language==='es';const scope=useServiceScope();
  const [done,setDone]=useState<string[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{void supabase.from('deep_clean_item_checks').select('scope_row_id').eq('attach_id',attachId).then(({data})=>setDone((data??[]).map(r=>r.scope_row_id)));},[attachId]);
  const upload=async(rowId:string,file:File)=>{
    setBusy(true);setError('');
    try {
      const {data:user}=await supabase.auth.getUser(); if(!user.user) throw new Error('Please sign in again.');
      const path=`${user.user.id}/${visitId}/deep-clean-${rowId}-${crypto.randomUUID()}.jpg`;
      const {error:up}=await supabase.storage.from('job-condition-photos').upload(path,file);if(up)throw up;
      const {data:photo,error:ins}=await supabase.from('visit_photos').insert({visit_id:visitId,pro_id:user.user.id,kind:'after',storage_path:path}).select('id').single();if(ins||!photo)throw ins??new Error('Photo not saved');
      const {error:check}=await supabase.rpc('deep_clean_photo_check',{_attach:attachId,_scope:rowId,_photo:photo.id});if(check)throw check;
      setDone(old=>[...old,rowId]);
    }catch(e){setError(es?'No se pudo guardar la foto final. Intenta de nuevo.':e instanceof Error?e.message:'Could not save the after-photo.');}finally{setBusy(false);}
  };
  return <section className="space-y-3 border-l-4 border-primary pl-3">
    <h3 className="font-bold text-primary">{es?'LIMPIEZA PROFUNDA':'DEEP CLEAN'}</h3>
    {(scope.data??[]).filter(r=>r.addon_key==='deep_clean').map(row=><div key={row.id} className="space-y-2 text-sm text-foreground">
      <p className="flex items-center gap-2">{done.includes(row.id)&&<Check className="h-4 w-4 text-success"/>}{txt(row,language)}</p>
      <Button variant="outline" size="sm" asChild disabled={busy}><label className="cursor-pointer"><Camera className="mr-2 h-4 w-4"/>{es?'Foto final obligatoria':'Required after-photo'}<input className="sr-only" type="file" accept="image/*" capture="environment" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(row.id,file);}}/></label></Button>
    </div>)}
    {error&&<p role="alert" className="text-destructive">{error}</p>}
  </section>;
}