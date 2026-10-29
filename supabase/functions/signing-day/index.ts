import '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { requireServiceOrAdmin, bearerToken } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { onboardingPack, type PackLinks } from '../_shared/onboarding-pack.ts';
import { sendProEmail } from '../_shared/pro-send.ts';
const url = Deno.env.get('SUPABASE_URL') ?? '';
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(url,key,{auth:{persistSession:false}});
const bodySchema = z.object({action:z.enum(['intake_equipment','send_intake','provision','payouts','background_clear','send_agreement','pack_state','send_pack','resend_item','checkr_invite']),applicant_id:z.string().uuid().optional(),token:z.string().min(20).max(100).optional(),item:z.enum(['intake','agreement','app','insurance','background']).optional(),checked:z.boolean().optional(),request_id:z.string().uuid().optional()});
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
async function invoke(name:string,body:unknown){const r=await vendorFetch(`${url}/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},body:JSON.stringify(body)});const data=await r.json().catch(()=>({}));return {data,error:r.ok?null:new Error(data.error??`Request failed (${r.status})`)};}
async function sms(id:string, text:string, idempotency:string) {
  const {data:a}=await db.from('applicants').select('phone,is_test_row').eq('id',id).single();
  const {data:p}=await db.from('contractor_pipeline').select('is_test').eq('applicant_id',id).single();
  if(a?.is_test_row || p?.is_test) return {skipped:'is_test'};
  const digits=String(a?.phone??'').replace(/\D/g,'');
  if(digits.length<10) throw new Error('Candidate phone is missing');
  const {data,error}=await invoke('send-twilio-sms',{to_phone_e164:digits.length===10?`+1${digits}`:`+${digits}`,body:text,idempotency_key:idempotency,template_name:'pro-signing-day',triggered_by:'signing-day'});
  if(error) throw error;
  if(data?.error || data?.ok===false) throw new Error(data.error??'Text was not accepted');
  return data;
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST') return reply({error:'method_not_allowed'},405);
  try {
    const parsed=bodySchema.safeParse(await req.json());
    if(!parsed.success) return reply({error:'invalid_request'},400);
    const b=parsed.data;
    if(b.action==='intake_equipment') {
      if(!b.token) return reply({error:'token_required'},400);
      const {data:k}=await db.from('pro_kit').select('applicant_id,token_expires_at').eq('token',b.token).maybeSingle();
      if(!k || (k.token_expires_at && Date.parse(k.token_expires_at)<Date.now())) return reply({error:'invalid_link'},404);
      const {data:state}=await db.rpc('signing_day_state',{_id:k.applicant_id});
      const {data:pipeline}=await db.from('contractor_pipeline').select('service').eq('applicant_id',k.applicant_id).single();
      const {data:items}=await db.from('pipeline_equipment_items').select('label_en,label_es').eq('service',pipeline?.service).eq('active',true).order('sort');
      return reply({items:items??[],compliance:{agreement:state?.agreement,background:state?.background,insurance:state?.insurance,payouts:state?.payouts}});
    }
    if(b.action==='payouts') {
      const {data:u,error}=await db.auth.getUser(bearerToken(req));
      if(error||!u.user) return reply({error:'unauthorized'},401);
      const {data:a}=await db.from('applicants').select('id,signing_day_signed_at').eq('contractor_id',u.user.id).single();
      if(!a?.signing_day_signed_at) return reply({error:'not_signed'},403);
      const {data,error:err}=await invoke('stripe-connect-create',{applicant_id:a.id,refresh_url:'https://jointidy.co/pro/onboarding',return_url:'https://jointidy.co/pro/onboarding'});
      if(err) throw err;
      return reply(data);
    }
    const auth=await requireServiceOrAdmin(req);
    if(!auth.ok) return reply({error:auth.error},auth.status);
    if(!b.applicant_id) return reply({error:'applicant_id_required'},400);
    const id=b.applicant_id;
    if(['pack_state','send_pack','resend_item','checkr_invite'].includes(b.action)) {
      const {data:a,error:ae}=await db.from('applicants').select('first_name,email,contract_token,contracts_signed,signing_day_signed_at').eq('id',id).single();
      const {data:p,error:pe}=await db.from('contractor_pipeline').select('proof_approved_at,archived,state,preferred_language,checkr_invite_sent_at').eq('applicant_id',id).single();
      if(ae||pe||!a||!p) return reply({error:'candidate_not_found'},404);
      if(b.action==='checkr_invite') {
        const {error}=await db.from('contractor_pipeline').update({checkr_invite_sent_at:b.checked?new Date().toISOString():null}).eq('applicant_id',id);if(error)throw error;
        return reply({ok:true});
      }
      if(p.archived||p.state!=='open')return reply({error:'Restore this candidate before sending onboarding links.'},409);
      const {data:t,error:te}=await db.rpc('admin_signing_day_intake',{_id:id});if(te)throw te;
      let agreement:string|null=null;
      if(p.proof_approved_at&&!a.contracts_signed){
        const token=a.contract_token??crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
        const {error}=await db.from('applicants').update({contract_token:token}).eq('id',id);if(error)throw error;
        const {data:doc,error:de}=await invoke('contract-sign',{action:'document',token});if(de||!doc.ok)throw de??new Error(doc.error??'Agreement unavailable');
        agreement=`https://jointidy.co/contract/${token}`;
      }
      const es=p.preferred_language==='es';
      const links:PackLinks={intake:`https://jointidy.co/intake/${t.intake_token}`,agreement,app:a.signing_day_signed_at?'https://jointidy.co/pro/login':null,insurance:`https://jointidy.co/pro/insurance${es?'?lang=es':''}`,background:'https://dashboard.checkr.com'};
      const {data:history,error:he}=await db.from('onboarding_pack_sends').select('*').eq('applicant_id',id).order('created_at',{ascending:false}).limit(15);if(he)throw he;
      if(b.action==='pack_state')return reply({ok:true,links,history,checkr_invite_sent_at:p.checkr_invite_sent_at});
      if(b.action==='resend_item'&&!b.item)return reply({error:'item_required'},400);
      if(b.item==='agreement'&&!agreement)return reply({error:'Agreement requires approved equipment and an unsigned candidate.'},409);
      if(b.item==='app'&&!links.app)return reply({error:'signed_required'},409);
      const text=onboardingPack(links,es,b.action==='resend_item'?b.item:undefined);
      const requestId=b.request_id??crypto.randomUUID();
      const {data:log,error:le}=await db.from('onboarding_pack_sends').insert({id:requestId,applicant_id:id,item:b.action==='send_pack'?'pack':b.item,body:text,links,sms_status:'pending',email_status:'pending'}).select('id').single();
      if(le?.code==='23505')return reply({ok:true,duplicate:true});if(le||!log)throw le??new Error('Log failed');
      const escaped=text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');
      const email=a.email?await sendProEmail(db,{applicantId:id,key:'signing_day_pack',to:a.email,name:a.first_name,built:{subject:es?'Sus enlaces de incorporación de Tidy':'Your Tidy onboarding links',html:`<p>${escaped}</p>`,text},triggeredBy:'signing-day',mode:'manual'}):{sent:false,reason:'No email address'};
      let result:Record<string,unknown>;try{result=await sms(id,text,`onboarding-pack:${requestId}`);}catch(e){result={sent:false,error:e instanceof Error?e.message:'Text failed'};}
      const smsStatus=result.skipped?'test_skipped':result.queued?'queued':result.sent?'accepted':'failed';
      const {error:save}=await db.from('onboarding_pack_sends').update({sms_status:smsStatus,sms_result:result,email_status:email.sent?'accepted':'failed',email_result:email,release_after:result.release_after??null}).eq('id',requestId);if(save)throw save;
      return reply({ok:smsStatus!=='failed'&&email.sent,text,sms:result,email});
    }
    if(b.action==='background_clear') {
      const {data:p}=await db.from('contractor_pipeline').select('proof_approved_at,archived,state').eq('applicant_id',id).single();
      if(!p?.proof_approved_at||p.archived||p.state!=='open') return reply({error:'Approved equipment proof is required before background clearance.'},409);
      const {error}=await db.from('applicants').update({bg_check_status:'clear',bg_check_completed_at:new Date().toISOString()}).eq('id',id);
      if(error) throw error;
      return reply({ok:true});
    }
    if(b.action==='send_agreement') {
      const {data:a,error}=await db.from('applicants').select('contract_token,contracts_signed').eq('id',id).single();
      if(error)throw error;
      const {data:p}=await db.from('contractor_pipeline').select('proof_approved_at,archived,state,preferred_language').eq('applicant_id',id).single();
      if(!p?.proof_approved_at||p.archived||p.state!=='open')return reply({error:'Approved equipment proof is required.'},409);
      const token=a?.contract_token??crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
      const {error:save}=await db.from('applicants').update({contract_token:token}).eq('id',id);if(save)throw save;
      const {data:document,error:docError}=await db.functions.invoke('contract-sign',{body:{action:'document',token}});
      if(docError||!document?.ok)return reply({error:'This link is no longer active'},409);
      const link=`https://jointidy.co/contract/${token}`;
      return reply({ok:true,link,sms:await sms(id,p.preferred_language==='es'?`Su equipo está aprobado. Lea y firme su contrato de Tidy aquí: ${link}`:`Your equipment is approved. Read and sign your Tidy contractor agreement here: ${link}`,`signing-agreement:${id}:${token}`)});
    }
    if(b.action==='send_intake') {
      const {data:t,error}=await db.rpc('admin_signing_day_intake',{_id:id});
      if(error) throw error;
      const {data:p}=await db.from('contractor_pipeline').select('preferred_language').eq('applicant_id',id).single();
      const text=p?.preferred_language==='es'?`Complete su formulario Pro de Tidy aquí: https://jointidy.co/intake/${t.intake_token}`:`Complete your Tidy Pro intake here: https://jointidy.co/intake/${t.intake_token}`;
      return reply({ok:true,sms:await sms(id,text,`signing-intake:${id}:${t.intake_token}`)});
    }
    const {data:a,error:ae}=await db.from('applicants').select('id,phone,contractor_id,signing_day_signed_at,signing_day_app_sms_at,pro_number').eq('id',id).single();
    if(ae||!a) return reply({error:'candidate_not_found'},404);
    if(!a.signing_day_signed_at) return reply({error:'signed_required'},409);
    const digits=String(a.phone??'').replace(/\D/g,'');
    const phone=digits.length===10?`+1${digits}`:`+${digits}`;
    if(!/^\+[1-9]\d{9,14}$/.test(phone)) return reply({error:'valid_phone_required'},400);
    let uid=a.contractor_id;
    if(uid) {
      const {data:user}=await db.auth.admin.getUserById(uid);
      if(user.user?.phone && user.user.phone.replace(/\D/g,'')!==digits && user.user.phone.replace(/\D/g,'')!==phone.replace(/\D/g,'')) return reply({error:'linked_phone_mismatch'},409);
      const {error}=await db.auth.admin.updateUserById(uid,{phone,phone_confirm:false});
      if(error) throw error;
    } else {
      const {data:created,error}=await db.auth.admin.createUser({phone,phone_confirm:false});
      if(error||!created.user) return reply({error:error?.message??'account_failed'},409);
      uid=created.user.id;
    }
    const {error:link}=await db.from('applicants').update({contractor_id:uid}).eq('id',id);
    if(link) throw link;
    const {error:role}=await db.from('user_roles').upsert({user_id:uid,role:'pro'},{onConflict:'user_id,role'});
    if(role) throw role;
    let outcome:unknown={skipped:'already_sent'};
    if(!a.signing_day_app_sms_at) {
      const {data:p}=await db.from('contractor_pipeline').select('preferred_language').eq('applicant_id',id).single();
      outcome=await sms(id,p?.preferred_language==='es'?`Su número Pro es ${a.pro_number}. Entre con un código enviado a su celular: https://jointidy.co/pro/login`:`Your Pro number is ${a.pro_number}. Sign in with a code texted to your phone: https://jointidy.co/pro/login`,`signing-app:${id}`);
      const result=outcome as {skipped?:string;queued?:boolean;sid?:string};
      if(result.sid||result.queued||result.skipped==='is_test') await db.from('applicants').update({signing_day_app_sms_at:new Date().toISOString()}).eq('id',id);
    }
    return reply({ok:true,sms:outcome});
  }catch(e){return reply({error:e instanceof Error?e.message:'Request failed'},400);}
});