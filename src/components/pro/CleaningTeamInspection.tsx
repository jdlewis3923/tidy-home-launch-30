import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { visitAction } from '@/lib/pro-portal';

export default function CleaningTeamInspection({ visitId }: { visitId: string }) {
  const { language } = useLanguage();
  const es = language === 'es';
  const [details, setDetails] = useState<{size:number;is_lead:boolean;team:{lead:string;partner:string}|null;zones:Array<{description:string}>;inspected:boolean}|null>(null);
  const [zones, setZones] = useState('');
  const [inspected, setInspected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  const [locationReason,setLocationReason] = useState('');
  useEffect(() => {
    let canceled = false;
    void supabase.rpc('pro_cleaning_visit_details', {_visit:visitId}).then(({data,error}) => {
      if (canceled || error || !data) return;
      const next = data as unknown as NonNullable<typeof details>;
      setDetails(next); setInspected(next.inspected);
      setZones(next.zones.map(z=>z.description).filter(Boolean).join('\n'));
    });
    return () => { canceled=true; };
  }, [visitId]);
  if (details?.size !== 5) return null;
  async function save() {
    setBusy(true);
    const {error} = await supabase.rpc('cleaning_finish_details', {
      _visit:visitId, _zones:zones.split('\n').map(z=>z.trim()).filter(Boolean).map(description=>({description})), _inspection:inspected,
    });
    setBusy(false); setResult(error ? (es?'No se pudo guardar la inspección.':'Could not save the inspection.') : (es?'Inspección guardada':'Inspection saved'));
  }
  async function checkOut(){setBusy(true);const response=await visitAction(visitId,'team_check_out',{location_reason:locationReason.trim()||undefined});setBusy(false);setResult(response.ok?(es?'Salida registrada':'Check-out recorded'):(response.error?.includes('reason_required')?(es?'Fuera de 150 m o dirección sin verificar: agregue un motivo.':'Outside 150 m or unverified address: add a reason.'):(es?'Registre su llegada y permita su ubicación antes de salir.':'Check in and allow location before checking out.')));}
  return <section className="space-y-3 border-y border-border py-4">
    <h2 className="font-semibold text-foreground">{es?'Equipo Estate Plus':'Estate Plus team'}</h2>
    {details.team&&<p className="text-sm text-muted-foreground">{details.team.lead} ({es?'Líder':'Lead'}) + {details.team.partner}</p>}
    {details.is_lead ? <>
      <label className="block space-y-2 text-sm text-foreground"><span>{es?'Zonas y Pro responsable':'Room zones and responsible Pro'}</span><Textarea value={zones} onChange={e=>setZones(e.target.value)} maxLength={2000} rows={4}/></label>
      <label className="flex items-start gap-3 text-sm text-foreground"><Checkbox checked={inspected} onCheckedChange={v=>setInspected(v===true)}/><span>{es?'Inspección final realizada y reporte de fotos listo':'Final walkthrough completed and photo report ready'}</span></label>
      <Button variant="outline" disabled={busy||!zones.trim()} onClick={()=>void save()}>{es?'Guardar inspección':'Save inspection'}</Button>
    </> : <><p className="text-sm text-muted-foreground">{es?'El líder guarda las zonas y cierra la visita después de la inspección final.':'The Lead saves room zones and closes the visit after the final walkthrough.'}</p><Button variant="outline" disabled={busy} onClick={()=>void checkOut()}>{es?'Registrar mi salida':'Record my check-out'}</Button></>}
    {!details.is_lead&&<label className="block space-y-2 text-sm text-foreground"><span>{es?'Motivo de ubicación, si está fuera de 150 m':'Location reason, if outside 150 m'}</span><Textarea maxLength={500} rows={2} value={locationReason} onChange={e=>setLocationReason(e.target.value)}/></label>}
    {result&&<p role="status" className="text-sm text-foreground">{result}</p>}
  </section>;
}