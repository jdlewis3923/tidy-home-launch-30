import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ProButton } from "@/components/pro/portal/kit";
import ProShell from "@/components/pro/portal/ProShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { signingPhone, signingCode } from "@/lib/signing-day";
import heroHome from "@/assets/miami-waterfront.webp";
export default function ProLogin(){
 const [phone,setPhone]=useState("");const [code,setCode]=useState("");const [sent,setSent]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const {language}=useLanguage();const es=language==="es";const navigate=useNavigate();
 const submit=async()=>{
   const number=signingPhone.safeParse(phone);
   if(!number.success){setError(es?"Ingrese un teléfono válido.":"Enter a valid phone number.");return;}
   setBusy(true);setError("");
   try{
     if(!sent){const {error:e}=await supabase.auth.signInWithOtp({phone:number.data,options:{shouldCreateUser:false}});if(e)throw e;setSent(true);}
     else {const otp=signingCode.safeParse(code);if(!otp.success)throw new Error(es?"Ingrese el código del texto.":"Enter the code from your text.");const {error:e}=await supabase.auth.verifyOtp({phone:number.data,token:otp.data,type:"sms"});if(e)throw e;
       const {data:me,error:m}=await supabase.rpc("pro_get_me");if(m)throw m;
       if(!Array.isArray(me)||!me.length){await supabase.auth.signOut();throw new Error(es?"Tidy todavía no ha habilitado su acceso Pro.":"Tidy has not enabled your Pro access yet.");}
       const {data:ready,error:r}=await supabase.rpc("signing_day_state",{});if(r)throw r;
       const state=ready as unknown as {mode:boolean;active:boolean};navigate(state?.mode&&!state.active?"/pro/onboarding":"/pro/home",{replace:true});
     }
   }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
 };
 return <ProShell title={es?"Acceso Pro":"Pro sign in"} nav={false} dark>
   <img src={heroHome} alt={es?"Casa en Miami":"Miami home"} className="h-52 w-full object-cover"/>
   <section className="bg-background px-5 py-8 text-foreground"><h1 className="text-2xl font-bold">{es?"Bienvenido a Tidy Pro":"Welcome to Tidy Pro"}</h1>
   <form className="mt-6 space-y-4" onSubmit={e=>{e.preventDefault();void submit();}}>
     <label className="block text-sm font-semibold">{es?"Celular":"Mobile phone"}<input required disabled={sent} type="tel" autoComplete="tel" value={phone} onChange={e=>setPhone(e.target.value)} className="mt-2 h-12 w-full rounded-md border border-input bg-background px-3 text-base"/></label>
     {sent&&<label className="block text-sm font-semibold">{es?"Código de un solo uso":"One-time code"}<input autoFocus required inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,""))} className="mt-2 h-12 w-full rounded-md border border-input bg-background px-3 text-base"/></label>}
     {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
     <ProButton type="submit" full disabled={busy}>{busy?(es?"Un momento…":"Please wait…"):sent?(es?"Entrar":"Sign in"):(es?"Enviarme un código":"Text me a code")}</ProButton>
     {sent&&<ProButton type="button" variant="outlined" full disabled={busy} onClick={()=>{setSent(false);setCode("");}}>{es?"Cambiar teléfono / reenviar":"Change phone / resend"}</ProButton>}
   </form></section>
 </ProShell>;
}
