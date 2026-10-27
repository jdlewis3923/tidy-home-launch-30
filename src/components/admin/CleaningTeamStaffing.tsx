import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

export default function CleaningTeamStaffing({ reservationId }: { reservationId: string }) {
  const { language } = useLanguage(); const es = language === 'es';
  const [teams, setTeams] = useState<Array<{id:string;label:string}>>([]);
  const [team, setTeam] = useState(''); const [result,setResult] = useState('');
  const [pros,setPros] = useState<Array<{pro_id:string;name:string}>>([]);
  const [kind,setKind] = useState('paired_pros');
  const [lead,setLead] = useState(''); const [partner,setPartner] = useState('');
  const [helper,setHelper] = useState('');
  const [background,setBackground] = useState(false); const [insured,setInsured] = useState(false);
  const [busy,setBusy] = useState(false); const [nonce,setNonce] = useState(0);
  useEffect(()=>{void supabase.rpc('admin_cleaning_team_options').then(({data,error})=>{if(!error)setPros(data??[]);});},[]);
  useEffect(()=>{ void supabase.from('cleaning_teams').select('id,kind,lead_pro_id,partner_pro_id,helper_name').eq('active',true).then(async({data})=>{
    const rows = await Promise.all((data??[]).map(async t=>{
      const [{data:valid},{data:lead},{data:partner}] = await Promise.all([supabase.rpc('cleaning_team_valid',{_team:t.id}),supabase.rpc('sched_pro_first_name',{_uid:t.lead_pro_id}),t.partner_pro_id?supabase.rpc('sched_pro_first_name',{_uid:t.partner_pro_id}):Promise.resolve({data:t.helper_name})]);
      return valid?{id:t.id,label:`${lead??'—'} (Lead) + ${partner??'—'}`} : null;
    }));setTeams(rows.filter((t):t is {id:string;label:string}=>t!==null));
  });},[nonce]);
  async function staff(){const {error}=await supabase.rpc('admin_cleaning_staff',{_reservation:reservationId,_team:team});setResult(error?error.message:(es?'Equipo asignado':'Team assigned'));}
  async function createTeam(){
    setBusy(true);
    const {data,error}=await supabase.rpc('admin_cleaning_team',{_kind:kind,_lead:lead,_partner:kind==='paired_pros'?partner:undefined,_helper:kind==='owner_helper'?helper:undefined,_background:background,_insured:insured});
    setBusy(false);
    if(error){setResult(es?'No se pudo registrar: revise los Pros y las verificaciones.':'Could not register: check Pro eligibility and verifications.');return;}
    if(data){setTeam(data);setNonce(n=>n+1);setResult(es?'Equipo registrado':'Team registered');}
  }
  return <section className="space-y-3 border-t border-border pt-3">
    <h3 className="font-semibold">{es?'Equipo Estate Plus':'Estate Plus team'}</h3>
    {teams.length===0?<p className="text-sm text-muted-foreground">{es?'Necesita un equipo verificado antes de convertir.':'Needs a verified team before conversion.'}</p>:<><Select value={team} onValueChange={setTeam}><SelectTrigger><SelectValue placeholder={es?'Seleccionar equipo':'Select team'}/></SelectTrigger><SelectContent>{teams.map(t=><SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent></Select><Button size="sm" disabled={!team} onClick={staff}>{es?'Asignar equipo':'Assign team'}</Button></>}
    <details className="space-y-3">
      <summary className="cursor-pointer text-sm font-medium">{es?'Registrar equipo verificado':'Register verified team'}</summary>
      <div className="space-y-3 pt-3">
        <Select value={kind} onValueChange={setKind}><SelectTrigger aria-label={es?'Tipo de equipo':'Team type'}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="paired_pros">{es?'Dos Pros de Tidy':'Two Tidy Pros'}</SelectItem><SelectItem value="owner_helper">{es?'Pro con ayudante':'Owner + helper'}</SelectItem></SelectContent></Select>
        <Select value={lead} onValueChange={setLead}><SelectTrigger aria-label={es?'Pro líder':'Lead Pro'}><SelectValue placeholder={es?'Pro líder':'Lead Pro'}/></SelectTrigger><SelectContent>{pros.map(p=><SelectItem key={p.pro_id} value={p.pro_id}>{p.name}</SelectItem>)}</SelectContent></Select>
        {kind==='paired_pros'?<Select value={partner} onValueChange={setPartner}><SelectTrigger aria-label={es?'Segundo Pro':'Partner Pro'}><SelectValue placeholder={es?'Segundo Pro':'Partner Pro'}/></SelectTrigger><SelectContent>{pros.filter(p=>p.pro_id!==lead).map(p=><SelectItem key={p.pro_id} value={p.pro_id}>{p.name}</SelectItem>)}</SelectContent></Select>:<>
          <Input aria-label={es?'Nombre del ayudante':'Helper name'} placeholder={es?'Nombre del ayudante':'Helper name'} maxLength={120} value={helper} onChange={e=>setHelper(e.target.value)}/>
          <label className="flex items-start gap-3 text-sm"><Checkbox checked={background} onCheckedChange={v=>setBackground(v===true)}/>{es?'Verificación de antecedentes completada':'Background check completed'}</label>
          <label className="flex items-start gap-3 text-sm"><Checkbox checked={insured} onCheckedChange={v=>setInsured(v===true)}/>{es?'Cobertura del seguro del Pro verificada':'Covered by owner’s insurance — verified'}</label>
        </>}
        <Button variant="outline" disabled={busy||!lead||(kind==='paired_pros'?(!partner||partner===lead):(!helper.trim()||!background||!insured))} onClick={()=>void createTeam()}>{es?'Registrar equipo':'Register team'}</Button>
      </div>
    </details>
    {result&&<p role="status" className="text-sm">{result}</p>}
  </section>;
}