import { useCallback,useEffect,useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import SigningDayPanel from "@/components/admin/SigningDayPanel";
import ApplicationChannels from "@/components/admin/ApplicationChannels";
import { useApplicationChannels } from "@/hooks/useApplicationChannels";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
type Candidate={id:string;first_name:string;last_name:string;service:string|null;is_test_row:boolean|null};
export default function SigningDay(){
 const [rows,setRows]=useState<Candidate[]>([]); const [filter,setFilter]=useState("");const [loading,setLoading]=useState(true);
 const {language}=useLanguage();const es=language==="es";const channels=useApplicationChannels(rows.map(r=>r.id));
 const load=useCallback(async()=>{
   const {data:p,error}=await supabase.from("contractor_pipeline").select("applicant_id").eq("archived",false).eq("state","open");
   if(error){toast.error(error.message);setLoading(false);return;}
   const ids=(p??[]).map(r=>r.applicant_id);
   if(!ids.length){setLoading(false);return;}
   const {data,error:e}=await supabase.from("applicants").select("id,first_name,last_name,service,is_test_row").in("id",ids).order("first_name");
   if(e)toast.error(e.message);else setRows(data??[]);setLoading(false);
 },[]);
 useEffect(()=>{void load();},[load]);
 return <main className="min-h-screen bg-background p-4 text-foreground sm:p-8"><Helmet><title>Signing day | Tidy</title></Helmet><div className="mx-auto max-w-5xl"><header className="mb-6"><h1 className="text-3xl font-bold">{es?"Día de firma":"Signing day"}</h1><Input className="mt-4 max-w-md" aria-label={es?"Buscar candidato":"Search candidates"} placeholder={es?"Buscar candidato":"Search candidates"} value={filter} onChange={e=>setFilter(e.target.value)}/></header>{loading?<p>{es?"Cargando…":"Loading…"}</p>:rows.filter(r=>`${r.first_name} ${r.last_name} ${r.service}`.toLowerCase().includes(filter.toLowerCase())).map(r=><article key={r.id} className="mb-6"><Link className="text-xl font-bold text-primary" to={`/admin/pipeline/${r.id}`}>{r.first_name} {r.last_name}</Link><span className="ml-2 text-sm text-muted-foreground">{r.service}{r.is_test_row?" · TEST":""}</span><ApplicationChannels c={channels.get(r.id)}/><SigningDayPanel applicantId={r.id}/></article>)}</div></main>;
}