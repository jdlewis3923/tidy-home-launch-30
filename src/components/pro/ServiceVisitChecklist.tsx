import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

const LABELS: Record<string,[string,string]> = {
  shoe_covers:['Shoe covers on','Cubrezapatos puestos'],top_bottom:['Top to bottom; floors last','De arriba hacia abajo; pisos al final'],
  touchpoints:['Switch plates, handles and frames','Interruptores, manijas y marcos'],stainless:['Stainless with the grain','Acero siguiendo la veta'],
  glass:['Glass and mirrors streak-free','Vidrios y espejos sin marcas'],microwave:['Inside microwave','Interior del microondas'],
  kitchen:['Kitchen','Cocina'],baths:['Bathrooms','Baños'],bedrooms:['Bedrooms','Dormitorios'],living:['Living areas','Áreas de estar'],
  towels:['Hotel-fold towels','Toallas dobladas estilo hotel'],surface_safe:['Stone: pH-neutral only; wood-safe hardwood; fragile only if asked','Piedra: solo pH neutro; productos seguros para madera; frágiles solo a pedido'],
  rotation:["Today's rotation task","Tarea rotativa de hoy"],mow:['Mow','Cortar césped'],edge:['Edge walks and driveway','Bordear aceras y entrada'],trim:['Trim','Recortar'],
  electric_blower:['Battery/electric blower only — no gas in Pinecrest','Solo soplador eléctrico o de batería — sin gasolina en Pinecrest'],clippings:['Clippings off all hard surfaces','Retirar recortes de todas las superficies duras'],beds:['Beds left as found','Canteros como se encontraron'],gate:['Gate closed','Portón cerrado'],
  exterior:['Exterior wash','Lavado exterior'],wheels:['Wheels and tires dressed','Rines y llantas acondicionados'],glass_in_out:['Glass inside and out','Vidrios por dentro y por fuera'],vacuum:['Interior vacuumed seat by seat','Interior aspirado asiento por asiento'],jambs:['Door jambs wiped','Marcos de puertas limpios'],mats:['Mats returned','Alfombrillas colocadas'],interior_condition:['Interior wipe-down and conditioning','Limpieza y acondicionamiento interior'],detail_checklist:['Full-detail checklist completed','Lista de limpieza completa terminada'],
  locked:['Locked or not applicable','Cerrado con llave o no aplica'],alarm:['Alarm set or not applicable','Alarma activada o no aplica'],lights_ac:['Lights/AC as found','Luces/aire como se encontraron'],keys_returned:['Keys returned or not applicable','Llaves devueltas o no aplica'],
};

export default function ServiceVisitChecklist({visitId}:{visitId:string}) {
  const {language}=useLanguage();const es=language==='es';
  const [state,setState]=useState<{keys:string[];checks:Record<string,boolean>;closed:boolean}|null>(null);
  const [addons,setAddons]=useState<Array<{id:string;addon_name:string;status:string;can_split:boolean}>>([]);
  const [error,setError]=useState('');const [busy,setBusy]=useState<string|null>(null);
  useEffect(()=>{let stopped=false;Promise.all([supabase.rpc('pro_service_checklist',{_visit:visitId}),supabase.rpc('pro_visit_addons',{_visit:visitId})]).then(([checks,extra])=>{if(stopped)return;if(checks.error||extra.error){setError(es?'No se pudo cargar la lista.':'Could not load the checklist.');return;}setState(checks.data as unknown as NonNullable<typeof state>);setAddons(extra.data??[]);});return()=>{stopped=true;};},[visitId,es]);
  async function toggle(key:string,checked:boolean){setBusy(key);const {error}=await supabase.rpc('pro_service_check',{_visit:visitId,_key:key,_checked:checked});setBusy(null);if(error){setError(es?'No se pudo guardar.':'Could not save.');return;}setState(old=>old?{...old,checks:{...old.checks,[key]:checked}}:old);setError('');}
  async function finishAddon(id:string,together:boolean){setBusy(id);const {error}=await supabase.rpc('pro_complete_addon',{_attach:id,_mode:together?'together':'self'});setBusy(null);if(error){setError(es?'No se pudo guardar el extra.':'Could not save the add-on.');return;}setAddons(old=>old.map(a=>a.id===id?{...a,status:'completed'}:a));}
  const exit=new Set(['locked','alarm','lights_ac','keys_returned']);
  return <section className="space-y-4 border-y border-border py-4">
    {state&&<p className="text-sm text-muted-foreground">{state.keys.filter(k=>state.checks[k]).length}/{state.keys.length}</p>}
    {[false,true].map(isExit=><section key={String(isExit)} className="space-y-2"><h2 className="font-semibold text-foreground">{isExit?(es?'Salida segura':'Secure exit'):(es?'Trabajo de hoy':'Today’s work')}</h2>{state?.keys.filter(k=>exit.has(k)===isExit).map(key=><label key={key} className="flex min-h-11 items-start gap-3 py-2 text-sm text-foreground"><Checkbox checked={state.checks[key]===true} disabled={busy!==null||state.closed} onCheckedChange={v=>void toggle(key,v===true)}/><span>{LABELS[key]?.[es?1:0]??key}</span></label>)}</section>)}
    {addons.length>0&&<section className="space-y-3"><h2 className="font-semibold text-foreground">{es?'Extras reservados':'Booked add-ons'}</h2>{addons.map(a=><div key={a.id} className="space-y-2 border-b border-border pb-3"><p className="text-sm text-foreground">{a.addon_name}{a.status==='completed'?' ✓':''}</p>{a.status!=='completed'&&<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy!==null||state?.closed} onClick={()=>void finishAddon(a.id,false)}>{es?'Lo completé':'I completed it'}</Button>{a.can_split&&<Button variant="outline" disabled={busy!==null||state?.closed} onClick={()=>void finishAddon(a.id,true)}>{es?'Hecho juntos':'Done together'}</Button>}</div>}</div>)}</section>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}