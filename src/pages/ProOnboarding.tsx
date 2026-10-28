import { useCallback,useEffect,useState } from "react";
import { Link,Navigate } from "react-router-dom";
import { motion,useReducedMotion } from "framer-motion";
import { CheckCircle2,Circle,Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ProShell from "@/components/pro/portal/ProShell";
import { ProButton } from "@/components/pro/portal/kit";
import { useLanguage } from "@/contexts/LanguageContext";
import { signingChecks,type SigningState } from "@/lib/signing-day";
import { CLEANING_BASE_PAY,CONTRACTOR_VISIT_PAY,CONTRACTOR_SHINE_PAY } from "@/lib/pricing-canon";
import { toast } from "sonner";
export default function ProOnboarding(){
 const [state,setState]=useState<SigningState|null>(null);const [loading,setLoading]=useState(true);const [authed,setAuthed]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const {language}=useLanguage();const es=language==="es";const reduce=useReducedMotion();
 const load=useCallback(async()=>{const {data:u}=await supabase.auth.getUser();if(!u.user){setAuthed(false);setLoading(false);return;}const {data,error:e}=await supabase.rpc("signing_day_state",{});if(e)setError(e.message);else setState(data as unknown as SigningState);setLoading(false);},[]);
 useEffect(()=>{void load();const interval=setInterval(()=>void load(),10000);return()=>clearInterval(interval);},[load]);
 if(!authed)return <Navigate to="/pro/login" replace/>;
 if(state?.active)return <Navigate to="/pro/home" replace/>;
 const pay=async()=>{setBusy(true);const {data,error:e}=await supabase.functions.invoke("signing-day",{body:{action:"payouts"}});setBusy(false);if(e||data?.error){toast.error(data?.error??e?.message);return;}if(typeof data?.url==="string"&&data.url.startsWith("https://connect.stripe.com/"))window.location.assign(data.url);};
 const links:Record<string,string>={insurance:"/pro/upload-coi",availability:state?.intake_token?`/intake/${state.intake_token}`:"",sizes:state?.intake_token?`/intake/${state.intake_token}`:"",equipment:"/pro/equipment",training:"/pro/training"};
 const payRows=state?.service?.includes("lawn")?Object.values(CONTRACTOR_VISIT_PAY.lawn).map((v,i)=>[String(i+1),`$${v.monthly}`]):state?.service?.match(/car|detail/i)?Object.values(CONTRACTOR_SHINE_PAY).map((v,i)=>[String(i+1),`$${v.maintenanceWash} / $${v.fullDetail}`]):Object.entries(CLEANING_BASE_PAY).map(([k,v])=>[k,`$${v}`]);
 return <ProShell title={es?"Primeros pasos":"Getting Started"} nav={false}>
 <div className="space-y-6 p-5 text-foreground">{loading?<Loader2 className="h-6 w-6 animate-spin"/>:error?<p role="alert">{error}</p>:!state?<p>{es?"Tidy todavía no ha vinculado su registro.":"Tidy has not linked your record yet."}</p>:<>
 <header><p className="text-sm font-semibold text-primary">{state.pro_number??(es?"Número pendiente":"Number pending")}</p><h1 className="mt-2 text-2xl font-bold">{es?"Primeros pasos":"Getting Started"}</h1></header>
 <ul className="divide-y divide-border">{signingChecks.map(([key,en,sp],i)=><motion.li key={key} initial={reduce?false:{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{duration:.2,delay:reduce?0:i*.02}} className="py-4"><div className="flex items-center gap-3">{state[key]?<CheckCircle2 className="h-5 w-5 text-primary"/>:<Circle className="h-5 w-5 text-muted-foreground"/>}<span className="flex-1 font-semibold">{es?sp:en}</span></div>{!state[key]&&<div className="ml-8 mt-2">{key==="payouts"?<ProButton disabled={busy} onClick={()=>void pay()}>{es?"Configurar pagos":"Set up pay"}</ProButton>:links[key]?<Link className="text-sm font-semibold text-primary underline" to={links[key]}>{key==="insurance"&&state.insurance_review==="pending_review"?(es?"En revisión · dentro de 1 día":"Under review · within 1 day"):es?"Completar":"Complete"}</Link>:<span className="text-sm text-muted-foreground">{es?"Tidy lo confirma":"Tidy confirms this"}</span>}</div>}</motion.li>)}</ul>
 <section className="border-t border-border pt-4"><h2 className="font-bold">{es?"Pago base por visita":"Base pay per visit"}</h2><dl className="mt-3 space-y-2">{payRows.map(([size,amount])=><div key={size} className="flex justify-between"><dt>{es?"Tamaño":"Size"} {size}</dt><dd className="font-semibold">{amount}</dd></div>)}</dl></section>
 <section className="flex flex-col gap-3 border-t border-border pt-4"><Link className="text-primary underline" to="/pro/orientation/on-the-job">{es?"Estándar de servicio":"Service standard"}</Link><Link className="text-primary underline" to="/pro/orientation/before-you-work">{es?"Hoja de seguro · EN/ES":"Insurance sheet · EN/ES"}</Link></section>
 </>}</div></ProShell>;
}
