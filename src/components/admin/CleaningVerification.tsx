import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CleaningVerification({ reservationId, onSaved }: {reservationId:string; onSaved:()=>void}) {
  const [sqft,setSqft] = useState('');
  const [baths,setBaths] = useState('');
  const [busy,setBusy] = useState(false);
  const [result,setResult] = useState('');
  const [approvalLink,setApprovalLink] = useState('');
  const { language } = useLanguage();
  const es = language === 'es';
  const save = async()=>{
    if (!Number(sqft) || baths==='') return;
    setBusy(true);
    const {data,error}=await supabase.rpc('admin_cleaning_verify',{_reservation:reservationId,_sqft:Number(sqft),_baths:Number(baths)});
    setBusy(false);
    if(error)setResult(error.message);
    else { const r=data as {verified_size:string;confirmation:string;token?:string}; setResult(`${es?'Tamaño verificado':'Measured size'} ${r.verified_size} · ${r.confirmation==='pending'?(es?'Requiere aprobación del cliente':'Customer confirmation required'):(es?'Verificado':'Verified')}`); setApprovalLink(r.token ? `${window.location.origin}/cleaning-size/${r.token}` : ''); onSaved(); }
  };
  return <div className="space-y-2 border-t pt-3">
    <p className="text-sm font-bold">Verify cleaning size</p>
    <a href="https://www.miamidade.gov/Apps/PA/propertysearch/" target="_blank" rel="noreferrer" className="text-xs text-primary underline">Miami-Dade Property Appraiser search</a>
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-xs">Living area · sq ft<input aria-label="Verified cleaning square footage" type="number" min="1" step="1" className="mt-1 block w-32 rounded border bg-background p-2" value={sqft} onChange={e=>setSqft(e.target.value)} /></label>
      <label className="text-xs">Bathrooms<input aria-label="Verified cleaning bathrooms" type="number" min="0" step="0.5" className="mt-1 block w-24 rounded border bg-background p-2" value={baths} onChange={e=>setBaths(e.target.value)} /></label>
      <Button size="sm" disabled={busy||!sqft||baths===''} onClick={save}>Save measurement</Button>
    </div>
    {result&&<p role="status" className="text-xs">{result}</p>}
    {approvalLink&&<div className="space-y-2"><a href={approvalLink} target="_blank" rel="noreferrer" className="block break-all text-xs text-primary underline">{es?'Abrir aprobación del cliente':'Open customer approval'}</a><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText(approvalLink)}>{es?'Copiar enlace de aprobación':'Copy approval link'}</Button></div>}
  </div>;
}