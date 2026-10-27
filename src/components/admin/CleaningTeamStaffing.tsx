import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CleaningTeamStaffing({ reservationId }: { reservationId: string }) {
  const { language } = useLanguage(); const es = language === 'es';
  const [teams, setTeams] = useState<Array<{id:string;label:string}>>([]);
  const [team, setTeam] = useState(''); const [result,setResult] = useState('');
  useEffect(()=>{ void supabase.from('cleaning_teams').select('id,kind,lead_pro_id,partner_pro_id,helper_name').eq('active',true).then(async({data})=>{
    const rows = await Promise.all((data??[]).map(async t=>{
      const [{data:valid},{data:lead},{data:partner}] = await Promise.all([supabase.rpc('cleaning_team_valid',{_team:t.id}),supabase.rpc('sched_pro_first_name',{_uid:t.lead_pro_id}),t.partner_pro_id?supabase.rpc('sched_pro_first_name',{_uid:t.partner_pro_id}):Promise.resolve({data:t.helper_name})]);
      return valid?{id:t.id,label:`${lead??'—'} (Lead) + ${partner??'—'}`} : null;
    }));setTeams(rows.filter((t):t is {id:string;label:string}=>t!==null));
  });},[]);
  async function staff(){const {error}=await supabase.rpc('admin_cleaning_staff',{_reservation:reservationId,_team:team});setResult(error?error.message:(es?'Equipo asignado':'Team assigned'));}
  return <section className="space-y-3 border-t border-border pt-3">
    <h3 className="font-semibold">{es?'Equipo Estate Plus':'Estate Plus team'}</h3>
    {teams.length===0?<p className="text-sm text-muted-foreground">{es?'Necesita un equipo verificado antes de convertir.':'Needs a verified team before conversion.'}</p>:<><Select value={team} onValueChange={setTeam}><SelectTrigger><SelectValue placeholder={es?'Seleccionar equipo':'Select team'}/></SelectTrigger><SelectContent>{teams.map(t=><SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={!team} onClick={staff}>{es?'Asignar equipo':'Assign team'}</Button></>}
    {result&&<p role="status" className="text-sm">{result}</p>}
  </section>;
}