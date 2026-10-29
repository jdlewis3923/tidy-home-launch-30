import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { money } from '@/lib/pro-pay';
import { REDO_PAY_EN, REDO_PAY_ES } from '@/lib/redo-pay';
type Row={redo_id:string;visit_id:string;paid:boolean;amount_cents:number;label:string;decided_at:string};
export default function RedoPayLines({proId,visitId,from,to}:{proId?:string|null;visitId?:string;from?:string;to?:string}){
 const {language}=useLanguage();const es=language==='es';const [rows,setRows]=useState<Row[]>([]);
 useEffect(()=>{if(!proId)return;let q=supabase.from('redo_pay_decisions').select('redo_id,visit_id,paid,amount_cents,label,decided_at').eq('pro_id',proId);if(visitId)q=q.eq('visit_id',visitId);if(from)q=q.gte('decided_at',from);if(to)q=q.lte('decided_at',to);void q.order('decided_at',{ascending:false}).then(({data})=>setRows(data??[]));},[proId,visitId,from,to]);
 return <section className="border-t border-border py-3 text-sm"><h2 className="font-semibold">{es?'Pago por regresos':'Redo pay'}</h2><p className="mt-2 text-muted-foreground">{es?REDO_PAY_ES:REDO_PAY_EN}</p>{rows.map(r=><div key={r.redo_id} className="mt-3 flex justify-between gap-3"><span>{es?(r.paid?'Regreso — 50% de la tarifa original':'Regreso — sin pago (segundo en 60 días)'):r.label}</span><strong>{money(r.amount_cents)}</strong></div>)}</section>;
}