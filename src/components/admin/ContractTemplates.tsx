import { useEffect,useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog,DialogContent,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import ContractDocument from '@/components/ContractDocument';
import { Download,Eye } from 'lucide-react';
import { toast } from 'sonner';
type Template={id:string;title:string;body:string;version:string;service:string};
export default function ContractTemplates(){const [templates,setTemplates]=useState<Template[]>([]),[view,setView]=useState<Template|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{void supabase.from('contract_templates').select('*').eq('is_current',true).order('service').then(({data,error})=>{if(error)toast.error(error.message);else setTemplates(data??[]);});},[]);
 const download=async(t:Template)=>{setBusy(true);const {data,error}=await supabase.functions.invoke('contract-sign',{body:{action:'template_pdf',template_id:t.id}});setBusy(false);if(error||!data?.pdf){toast.error('Download failed');return;}const bytes=Uint8Array.from(atob(data.pdf),(c)=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=data.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
 return <section className="border-y border-border py-5"><h2 className="mb-4 text-lg font-bold">Contracts · Current service agreements</h2><div className="space-y-3">{templates.map(t=><div key={t.id} className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{t.title}</p><p className="text-sm text-muted-foreground">English · {t.version} · Read only</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>setView(t)}><Eye className="mr-2 h-4 w-4"/>View</Button><Button variant="outline" disabled={busy} onClick={()=>void download(t)}><Download className="mr-2 h-4 w-4"/>Download PDF</Button></div></div>)}</div><Dialog open={!!view} onOpenChange={()=>setView(null)}><DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>{view?.title}</DialogTitle></DialogHeader>{view&&<ContractDocument body={view.body}/>}</DialogContent></Dialog></section>;
}
