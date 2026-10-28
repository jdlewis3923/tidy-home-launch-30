import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { signingChecks, type SigningState } from "@/lib/signing-day";
import { useLanguage } from "@/contexts/LanguageContext";
import { CheckCircle2, Circle, FilePenLine, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
export default function SigningDayPanel({ applicantId }: { applicantId: string }) {
  const [state, setState] = useState<SigningState | null>(null);
  const [busy,setBusy] = useState(false);
  const [confirm,setConfirm] = useState(false);
  const { language } = useLanguage(); const es = language === "es";
  const load = useCallback(async () => { const {data,error}=await supabase.rpc("signing_day_state",{_id:applicantId}); if(error) toast.error(error.message); else setState(data as unknown as SigningState); },[applicantId]);
  useEffect(()=>{void load();const timer=setInterval(()=>void load(),15000);return()=>clearInterval(timer);},[load]);
  const run = async (action: "open" | "send" | "signed" | "background") => {
    setBusy(true);
    try {
      if(action==="open") {
        const {data,error}=await supabase.rpc("admin_signing_day_intake",{_id:applicantId});
        if(error) throw error;
        const token=(data as {intake_token?:string})?.intake_token;
        if(token) window.location.assign(`/intake/${token}`);
      } else {
        const {data,error}=await supabase.functions.invoke(action==="signed"?"sequence-advance":"signing-day",{body:action==="signed"?{action:"signing_day_signed",applicant_id:applicantId}:{action:action==="send"?"send_intake":"background_clear",applicant_id:applicantId}});
        if(error) { const details = error.context instanceof Response ? await error.context.json().catch(()=>null) : null; throw new Error(details?.error??error.message); }
        if(data?.error) throw new Error(data.error);
        toast.success(es?"Guardado":"Saved",{description:data?.sms?.skipped==="is_test"?(es?"Registro de prueba: no se envió texto.":"Test record: no text sent."):data?.sms?.queued?(es?"Texto en cola.":"Text queued."):undefined});
        setConfirm(false); await load();
      }
    } catch(error) { toast.error(error instanceof Error?error.message:String(error)); }
    finally {setBusy(false);}
  };
  return <section className="border-y border-border py-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">{es?"Día de firma":"Signing day"}</h2><span className="text-sm font-semibold">{state?.pro_number??(es?"Número pendiente":"Number pending")}</span></div>
    <p className="mt-1 text-sm text-muted-foreground">{state?.active?(es?"Activo":"Active"):state?.signed_at?(es?"Firmado · Primeros pasos":"Signed · Getting Started"):es?"Sin firmar":"Not signed"} · {state?.intake_complete?(es?"Formulario completo":"Intake Complete"):es?"Formulario pendiente":"Intake pending"}</p>
    <div className="my-4 grid gap-2 sm:grid-cols-2">{signingChecks.map(([key,en,sp])=><div key={key} className="flex items-center gap-2 text-sm">{state?.[key]?<CheckCircle2 className="h-4 w-4 text-primary"/>:<Circle className="h-4 w-4 text-muted-foreground"/>}{es?sp:en}</div>)}</div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={()=>void run("open")}><FilePenLine className="mr-2 h-4 w-4"/>{es?"Abrir formulario Pro":"Open Pro Intake"}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>void run("send")}><Send className="mr-2 h-4 w-4"/>{es?"Enviar enlace":"Send link"}</Button>
      <Button variant="outline" disabled={busy} onClick={()=>setConfirm(true)}>{state?.signed_at?(es?"Reintentar acceso Pro":"Retry Pro access"):es?"Marcar firmado":"Mark Signed"}</Button>
      {!state?.background&&<Button variant="outline" disabled={busy} onClick={()=>void run("background")}>{es?"Antecedentes aprobados":"Mark background clear"}</Button>}
      <Button asChild variant="ghost"><Link to="/admin/coi-review">{es?"Revisar seguro":"Review insurance"}</Link></Button>
    </div>
    {state?.intake_complete&&<p className="mt-3 text-sm text-muted-foreground">{state.kit_order_ready?(es?"Listo para pedir · seguro verificado":"Ready to order · insurance verified"):(es?"Listo para pedir una vez verificado el seguro":"Ready to order once insurance is verified")}</p>}
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogHeader><DialogTitle>{es?"Confirmar firma":"Confirm signing"}</DialogTitle><DialogDescription>{es?"Confirme que el acuerdo fue firmado. Se asignará su número Pro, se creará el acceso y se enviará el enlace de la aplicación. No activa trabajos hasta completar los requisitos.":"Confirm the agreement was signed. This assigns the Pro number, creates access and texts the app link. Jobs remain locked until readiness is complete."}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={()=>setConfirm(false)}>{es?"Cancelar":"Cancel"}</Button><Button disabled={busy} onClick={()=>void run("signed")}>{busy?<Loader2 className="h-4 w-4 animate-spin"/>:es?"Confirmar firmado":"Confirm Signed"}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}