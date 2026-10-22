import { ZIP_CENTROIDS } from './hiring/geo.ts';

export type V6Question = { id: string; key: string; service: string; type: string; required: boolean; label_en: string; label_es: string; options?: {value: string; en: string; es: string}[] | null };
export const V6_DISQUALIFY_DELAY_MS = 24 * 3600_000;
export function validWorkReference(name: string, phone: string, relationship: string): boolean {
  return name.trim().length > 0 && phone.replace(/\D/g, '').length >= 10 && ['supervisor', 'coworker', 'client'].includes(relationship);
}
export function validV6Answer(q: V6Question, v: unknown): boolean {
  if (v === null || v === undefined || v === '') return !q.required;
  if (q.type === 'slider') return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10;
  if (q.key.endsWith('.truth') || q.key.endsWith('.sms')) return v === true;
  if (q.key.endsWith('.jobs')) return Array.isArray(v) && v.length > 0 && v.length <= 2 && v.every(j => j && typeof j === 'object' && ['title','company','duration'].every(k => typeof j[k] === 'string' && j[k].trim()));
  if (q.key.endsWith('.avail.grid')) return Array.isArray(v) && v.length > 0 && v.every(b => typeof b === 'string' && /^(Mon|Tue|Wed|Thu|Fri)_(morning|afternoon)$/.test(b));
  if (q.type === 'multi' || q.key.startsWith('v6.equipment.') && q.key !== 'v6.equipment.ready') return Array.isArray(v) && (v.length > 0 || q.key.startsWith('v6.equipment.')) && (q.key !== 'v6.intent.priorities' || v.length <= 2) && v.every(x => q.options?.some(o => o.value === x));
  if (q.options?.length) return q.options.some(o => o.value === v);
  if (typeof v !== 'string') return false;
  if (q.key.endsWith('.email')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (q.key.endsWith('.phone')) return v.replace(/\D/g,'').length >= 10;
  if (q.key.endsWith('.zip')) return /^\d{5}$/.test(v);
  if (q.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v));
  return v.trim().length > 0 || !q.required;
}

export function nearestDriveMinutes(zip: string): number | null {
  const p = ZIP_CENTROIDS[zip]; if (!p) return null;
  return Math.min(...['33156','33183','33186'].map(z => {
    const a = ZIP_CENTROIDS[z]; if (!a) return Infinity;
    const rad = Math.PI / 180;
    const d = Math.sin((a.lat-p.lat)*rad/2)**2 + Math.cos(p.lat*rad)*Math.cos(a.lat*rad)*Math.sin((a.lng-p.lng)*rad/2)**2;
    return Math.round(3958.8 * 2 * Math.atan2(Math.sqrt(d),Math.sqrt(1-d)) * 2.2);
  }));
}

export function scoreV6(questions: V6Question[], byId: Map<string,unknown>, service: string, lang: string, dayPay: number | null, now = new Date()) {
  const get = (k: string) => { const q=questions.find(q=>q.key===`v6.${k}`); return q ? byId.get(q.id) : undefined; };
  const arr = (k: string) => { const v=get(k); return Array.isArray(v) ? v as string[] : []; };
  const skills=questions.filter(q=>q.type==='slider').map(q=>({key:q.key,label:lang==='es'?q.label_es:q.label_en,value:Number(byId.get(q.id)??0)}));
  const avg=skills.length ? skills.reduce((s,q)=>s+q.value,0)/skills.length : 0;
  const exp=String(get('work.paid_years')??'0');
  const years:Record<string,number>={'0':0,'<1':25,'1-2':55,'3-5':80,'5+':100};
  const settings=arr(`work.settings.${service}`);
  const settingsScore=settings.some(x=>['homes','own','mobile'].includes(x))?100:settings.some(x=>x!=='none')?65:0;
  const equipment=questions.find(q=>q.key===`v6.equipment.${service}`);
  const needed=equipment?.options?.filter(o=>o.value!=='polisher')??[];
  const owned=arr(`equipment.${service}`); const missing=needed.filter(o=>!owned.includes(o.value));
  const skill=Math.round((years[exp]??0)*.30+settingsScore*.15+avg*10*.35+(needed.length?(needed.length-missing.length)/needed.length*100:0)*.20);
  const backup=String(get('backup')); const blocks=arr('avail.grid').length;
  const rel=Math.round((get('vehicle')==='yes'?25:0)+(get('licence')==='yes'?20:0)+({second:20,family:15,rideshare:10,none:0}[backup]??0)+Math.min(25,blocks*2.5)+({full:3,part:7,business:10,between:10,other:5}[String(get('work.current'))]??0));
  const days=Number(get('avail.days')??0); const start=Date.parse(String(get('avail.start'))); const until=(start-now.getTime())/86400000;
  const priorities=arr('intent.priorities');
  const intent=Math.round(({steady:35,grow:35,side:20,unsure:5}[String(get('intent.goal'))]??0)+days/5*25+(until>=-1&&until<=14?20:0)+(priorities.some(x=>x==='clients'||x==='steady')?20:0));
  const t=(en:string,es:string)=>lang==='es'?es:en;
  const flags:{id:string;question:string;en?:string;es?:string}[]=[]; const points:{id:string;question:string;en?:string;es?:string}[]=[];
  const flag=(id:string,en:string,es:string)=>flags.push({id,question:t(en,es),en,es});
  const drive=nearestDriveMinutes(String(get('about.zip')??''));
  if (drive!==null&&drive>30) flag('distance',`Estimated drive to the nearest service ZIP: ${drive} minutes (over 30).`,`Traslado estimado al código postal de servicio más cercano: ${drive} minutos (más de 30).`);
  if (drive===null) flag('distance_unknown','ZIP drive estimate unavailable; confirm on the phone.','No hay una estimación para este código postal; confirma el traslado por teléfono.');
  if(missing.length&&get('equipment.ready')==='no')flag('equipment','Missing equipment and cannot obtain it before the first visit.','Le falta equipo y no puede conseguirlo antes de la primera visita.');
  if(backup==='none')flag('backup','No backup transport.','No tiene transporte alternativo.');
  if(skills.length===6&&skills.every(s=>s.value>=9))flag('inflated','Every skill was rated 9–10; confirm with examples.','Calificó todas sus habilidades con 9–10; pide ejemplos.');
  if(exp==='0'&&avg>=8)flag('experience','No paid experience, but skill average is 8+; discuss practical experience.','No tiene experiencia remunerada, pero su promedio de habilidades es 8 o más; conversa sobre su experiencia práctica.');
  for(const k of ['contractor','insurance','background'])if(get(`requirements.${k}`)==='question'){
    const q=questions.find(q=>q.key===`v6.requirements.${k}`);
    const en='Has a question (not a failure): '+(q?.label_en??''); const es='Tiene una pregunta (no es motivo de rechazo): '+(q?.label_es??'');
    const p={id:`question_${k}`,question:t(en,es),en,es}; flags.push(p);points.push(p);
  }
  const lower:Record<string,number>={under400:0,'400-700':400,'700-1000':700,'1000+':1000};
  if(dayPay!==null && (lower[String(get('intent.earnings'))]??0)>days*dayPay)flag('earnings',`Weekly earnings goal exceeds the estimated ${days}-day pay of $${days*dayPay}.`,`La meta semanal supera el pago estimado de $${days*dayPay} por ${days} días.`);
  for(const s of [...skills].sort((a,b)=>a.value-b.value).slice(0,2))points.push({id:s.key,question:`${s.label}: ${s.value}/10. `+t('Talk through an example.','Pide un ejemplo.')});
  if(missing.length)points.push({id:'missing_equipment',question:t('Missing equipment: ','Equipo que le falta: ')+missing.map(o=>lang==='es'?o.es:o.en).join(', ')});
  points.push({id:'earnings_days',question:t('Discuss earnings goal and days wanted: ','Conversen sobre su meta de ingresos y días deseados: ')+String(get('intent.earnings'))+` · ${days}`});
  if(get('work.summary'))points.push({id:'experience_summary',question:String(get('work.summary'))});
  return {skill,reliability:rel,intent,intent_adjustments:0,bars:skills,flags,phone_talking_points:points,inperson_talking_points:[],drive_time_minutes:drive,drive_time_estimated:true,disqualified:get('vehicle')==='no'||get('authorized')==='no',version:6};
}