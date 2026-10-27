import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { useLanguage } from '@/contexts/LanguageContext';

const CHECKS = [
  ['touchpoints','Switch plates, handles and door frames wiped','Interruptores, manijas y marcos limpios'],
  ['stainless','Stainless polished with the grain','Acero inoxidable pulido siguiendo la veta'],
  ['glass','Mirrors and glass streak-free','Espejos y vidrios sin marcas'],
  ['microwave','Inside microwave cleaned','Interior del microondas limpio'],
  ['towels','Towels folded hotel-style','Toallas dobladas estilo hotel'],
  ['shoe_covers','Shoe covers at the door','Cubrezapatos al entrar'],
  ['surface_safe','Stone: pH-neutral only, no bleach/vinegar. Wood-safe hardwood; fragile items only on request.','Piedra: solo pH neutro, sin cloro/vinagre. Productos seguros para madera; objetos frágiles solo a pedido.'],
  ['locked','Doors secured','Puertas cerradas con llave'],
  ['alarm','Alarm set or not applicable','Alarma activada o no aplica'],
  ['lights_ac','Lights and AC as found','Luces y aire acondicionado como se encontraron'],
  ['keys_returned','Keys returned or not applicable','Llaves devueltas o no aplica'],
] as const;
const TASKS:Record<string,[string,string]>={baseboards:['Baseboards','Zócalos'],blinds:['Blinds','Persianas'],fans_fixtures:['Fans and fixtures','Ventiladores y lámparas'],cabinet_fronts:['Cabinet fronts','Frentes de gabinetes'],vents:['Vents','Rejillas de ventilación']};

export default function CleaningStandardChecklist({visitId}:{visitId:string}){
  const {language}=useLanguage(); const es=language==='es';
  const [checks,setChecks]=useState<Record<string,boolean>>({});const [rotation,setRotation]=useState('');const [error,setError]=useState('');
  useEffect(()=>{let canceled=false;void supabase.rpc('pro_cleaning_checklist',{_visit:visitId}).then(({data,error})=>{if(canceled)return;if(error){setError(es?'No se pudo cargar':'Could not load');return;}const next=data as {rotation:string;checks:Record<string,boolean>}|null;if(next){setChecks(next.checks);setRotation(next.rotation);}});return()=>{canceled=true;};},[visitId,es]);
  async function toggle(key:string,checked:boolean){const {error}=await supabase.rpc('pro_cleaning_check',{_visit:visitId,_key:key,_checked:checked});if(error){setError(es?'No se pudo guardar':'Could not save');return;}setChecks(prev=>({...prev,[key]:checked}));setError('');}
  const task=TASKS[rotation]?.[es?1:0];
  return <section className="space-y-3 border-y border-border py-4">
    <h2 className="font-semibold text-foreground">{es?'Estándar de limpieza y salida':'Cleaning standard and secure exit'}</h2>
    {[...CHECKS.slice(0,7),['rotation',`Rotating task: ${task??'—'}`,`Tarea rotativa: ${task??'—'}`],...CHECKS.slice(7)].map(([key,en,spanish])=><label key={key} className="flex min-h-11 items-start gap-3 py-2 text-sm text-foreground"><Checkbox checked={checks[key]===true} onCheckedChange={value=>void toggle(key,value===true)}/><span>{es?spanish:en}</span></label>)}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}