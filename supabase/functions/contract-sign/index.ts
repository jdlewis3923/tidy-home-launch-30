import '../_shared/http.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { sendProEmail, proLang } from '../_shared/pro-send.ts';
import { contractSignedEmail } from '../_shared/pro-emails.ts';
import { agreementPdf,etTime } from '../_shared/contract-pdf.ts';
import { vendorFetch } from '../_shared/http.ts';
import { CONTRACT_TEMPLATE_SEED } from '../_shared/contract-template-seed.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}});
const schema=z.object({action:z.enum(['document','sign','countersign','templates','template_pdf','seed']),token:z.string().min(20).max(200).optional(),applicant_id:z.string().uuid().optional(),template_id:z.string().uuid().optional(),typed_name:z.string().trim().min(3).max(120).optional(),business_name:z.string().trim().max(200).optional(),agreed:z.boolean().optional(),version:z.string().max(300).optional()});
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
function b64(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
async function check<T>(r:{data:T;error:unknown}){if(r.error)throw r.error;return r.data;}
async function missing(id:string,reason:string){await check(await db.from('admin_alerts').upsert({dedupe_key:`contract-template:${id}`,alert_type:'contract_template_missing',level:'action',title:'Agreement link unavailable',body:reason,context:{applicant_id:id},action_url:`/admin/pipeline/${id}`,tier:'urgent'},{onConflict:'dedupe_key'}));}
async function provision(id:string){
 const r=await vendorFetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sequence-advance`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`},body:JSON.stringify({action:'signing_day_signed',applicant_id:id})});
 const data=await r.json().catch(()=>({}));return {data,error:r.ok?null:data.error??`access_${r.status}`};
}
async function mail(a:any,bytes:Uint8Array,path:string,version:string,typed:string,when:string,final=false){
 const link=await check(await db.storage.from('company-docs').createSignedUrl(path,2592000));
 const built=contractSignedEmail(a.first_name??'',typed,when,version,link?.signedUrl??null,await proLang(db,a.id));
 if(final)built.subject=`Final countersigned agreement — ${typed}`;
 const attachment=[{name:final?'Tidy-Agreement-final.pdf':'Tidy-Agreement-signed.pdf',content:b64(bytes)}];
 const pro=a.email?await sendProEmail(db,{applicantId:a.id,key:final?'contract_final':'contract_signed',to:a.email,built,triggeredBy:'contract-sign',attachment}):{sent:false,reason:'missing_email'};
 const owner=await sendProEmail(db,{applicantId:null,key:final?'contract_final_owner':'contract_signed_owner',to:'hello@jointidy.co',built:{...built,subject:`${final?'Countersigned':'Signed'}: ${typed}`},triggeredBy:'contract-sign',attachment});
 return {pro,owner};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 try{
 const p=schema.safeParse(await req.json());if(!p.success)return reply({error:'invalid_request'},400);const b=p.data;
 if(['templates','template_pdf','seed','countersign'].includes(b.action)){
  const auth=await requireServiceOrAdmin(req);if(!auth.ok)return reply({error:auth.error},auth.status);
  if(b.action==='seed'){await check(await db.from('contract_templates').upsert(CONTRACT_TEMPLATE_SEED.map(r=>({...r})),{onConflict:'service,lang,version',ignoreDuplicates:true}));return reply({ok:true});}
  if(b.action==='templates')return reply({ok:true,templates:await check(await db.from('contract_templates').select('*').eq('is_current',true).order('service'))});
  if(b.action==='template_pdf'){
   const t=await check(await db.from('contract_templates').select('*').eq('id',b.template_id??'').single());const bytes=await agreementPdf(t.body,{});return reply({ok:true,pdf:b64(bytes),filename:`Tidy-${t.service}-${t.version}.pdf`});
  }
  if(auth.kind!=='admin')return reply({error:'admin_required'},403);
  const s=await check(await db.from('contract_signatures').select('*').eq('applicant_id',b.applicant_id??'').order('signed_at',{ascending:false}).limit(1).single());
  if(s.countersigned_at)return reply({ok:true,already:true});
  const a=await check(await db.from('applicants').select('id,first_name,email').eq('id',s.applicant_id).single());const at=new Date();const ip=(req.headers.get('x-forwarded-for')??'unknown').split(',')[0];
  let original:Uint8Array|undefined;
  if(!s.template_body){const dl=await check(await db.storage.from('company-docs').download(s.signed_pdf_path));original=new Uint8Array(await dl.arrayBuffer());}
  const bytes=await agreementPdf(s.template_body??'',s.placeholder_values??{},{'Contractor':s.typed_name,'Business name':s.business_name,'Pro number':s.pro_number??'—','Contractor signed':etTime(new Date(s.signed_at)),'Contractor IP':s.ip_address??'unknown','Browser':s.user_agent??'unknown','Template service':s.template_service??'Spanish ICA','Template version':s.document_version,'Tidy countersignature':'Justin Lewis, Founder — Tidy Home Concierge LLC','Countersigned':etTime(at),'Countersign IP':ip},original);
  const path=`contracts/signed/${a.id}/final-${crypto.randomUUID()}.pdf`;await check(await db.storage.from('company-docs').upload(path,bytes,{contentType:'application/pdf'}));
  const committed=await check(await db.rpc('contract_commit_countersign',{_signature:s.id,_actor:auth.userId,_ip:ip,_path:path,_at:at.toISOString()}));
  return reply({ok:true,...committed,email:committed.already?undefined:await mail(a,bytes,path,s.document_version,s.typed_name,etTime(at),true)});
 }
 if(!b.token)return reply({error:'invalid_request'},400);
 const a=await check(await db.from('applicants').select('*').eq('contract_token',b.token).maybeSingle());if(!a)return reply({error:'not_found'},404);
 const pipeline=await check(await db.from('contractor_pipeline').select('service,stage,archived,state,proof_approved_at').eq('applicant_id',a.id).maybeSingle());
 if(!pipeline?.proof_approved_at||pipeline.archived||pipeline.state!=='open')return reply({error:'not_yet'},403);
 const lang=await proLang(db,a.id);let t:any=null;let doc:any=null;
 if(lang==='es'){
  doc=await check(await db.from('company_documents').select('id,filename,storage_path,uploaded_at').eq('doc_key','ica:es').eq('current_version',true).is('archived_at',null).order('uploaded_at',{ascending:false}).limit(1).maybeSingle());
 }
 if(!doc){
  const raw=String(pipeline.service??a.service??'').toLowerCase();const service=raw==='cleaning'||raw==='house cleaning'?'cleaning':raw==='lawn'||raw==='lawn care'?'lawn':null;
  if(!service){await missing(a.id,'Applicant has no supported agreement service.');return reply({error:'not_found'},404);}
  t=a.contracts_signed&&a.contract_template_id?await check(await db.from('contract_templates').select('*').eq('id',a.contract_template_id).eq('service',service).maybeSingle()):await check(await db.from('contract_templates').select('*').eq('service',service).eq('lang','en').eq('is_current',true).maybeSingle());
  if(!t){await missing(a.id,`No ${service} agreement template exists.`);return reply({error:'not_found'},404);}
  if(!a.contracts_signed&&a.contract_template_id!==t.id)await check(await db.from('applicants').update({contract_template_id:t.id}).eq('id',a.id).eq('contracts_signed',false));
 }
 const version=t?.version??`${doc.filename} · ${String(doc.uploaded_at).slice(0,10)} · ${String(doc.id).slice(0,8)}`;
 const values={legal_name:'{legal_name}',business_name:'—',phone:a.phone??'—',email:a.email??'—',pro_number:a.pro_number??'Assigned at signing',signed_date:new Date().toLocaleDateString('en-US',{timeZone:'America/New_York',dateStyle:'long'})};
 if(b.action==='document'){const url=doc?(await check(await db.storage.from('company-docs').createSignedUrl(doc.storage_path,3600)))?.signedUrl:null;return reply({ok:true,body:t?.body??null,title:t?.title??'Independent Contractor Agreement',version,values,url,signed:a.contracts_signed,first_name:a.first_name});}
 if(b.action!=='sign')return reply({error:'unknown_action'},400);
 if(a.contracts_signed){const access=await provision(a.id);return reply({ok:true,already:true,access:access.data});}
 if(!b.typed_name||!/\S+\s+\S+/.test(b.typed_name)||b.agreed!==true)return reply({error:'full_name_and_agreement_required'},400);
 if(b.version!==version)return reply({error:'version_changed'},409);
 const proNumber=await check(await db.rpc('signing_day_allocate_number',{_id:a.id}));
 const at=new Date(),ip=(req.headers.get('x-forwarded-for')??req.headers.get('cf-connecting-ip')??'unknown').split(',')[0].trim(),ua=(req.headers.get('user-agent')??'unknown').slice(0,400);
 const filled={...values,legal_name:b.typed_name,business_name:b.business_name||'—',pro_number:proNumber};let original:Uint8Array|undefined;
 if(doc){const dl=await check(await db.storage.from('company-docs').download(doc.storage_path));original=new Uint8Array(await dl.arrayBuffer());}
 const bytes=await agreementPdf(t?.body??'',filled,{'Contractor typed signature':b.typed_name,'Business name':filled.business_name,'Pro number':proNumber,'Signed':etTime(at),'IP':ip,'Browser':ua,'Template service':t?.service??'Spanish ICA','Template version':version},original);
 const path=`contracts/signed/${a.id}/signed-${crypto.randomUUID()}.pdf`;await check(await db.storage.from('company-docs').upload(path,bytes,{contentType:'application/pdf'}));
 const committed=await check(await db.rpc('contract_commit_signature',{_applicant:a.id,_template:t?.id??null,_document:doc?.id??null,_version:version,_body:t?.body??null,_typed:b.typed_name,_business:filled.business_name,_ip:ip,_ua:ua,_path:path,_values:filled,_signed_at:at.toISOString()}));
 const access=await provision(a.id);
 const email=committed.already?undefined:await mail(a,bytes,path,version,b.typed_name,etTime(at));
 return reply({ok:true,signed_at:at.toISOString(),email,access:access.data,access_error:access.error});
 }catch(e){return reply({error:e instanceof Error?e.message:String((e as any)?.message??e)},500);}
});
