import '../_shared/http.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {z} from 'npm:zod@3';
import {requireServiceOrAdmin} from '../_shared/admin-auth.ts';
import {missingKeys,kitComplete,fieldsFor,SERVICE_LABEL,type Service} from '../_shared/pro-application.ts';
import {hireApplication,noteKitToConnecteam} from '../_shared/pro-hire.ts';
import {buildFinishProfileEmail} from '../_shared/finish-profile-email.ts';
import {sendProEmail} from '../_shared/pro-send.ts';
import {ct} from '../_shared/connecteam.ts';

const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}});
const BUCKET='pro-applications';
const reply=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...corsHeaders,'Content-Type':'application/json'}});
const PUBLIC=['start','load','save','upload_url','attach','submit'] as const;
const ADMIN=['admin_list','admin_get','admin_stage','admin_hire','admin_create_finish','admin_send_finish','admin_test_cleanup','admin_test_kit','admin_test_purge_files'] as const;
const Body=z.object({action:z.enum([...PUBLIC,...ADMIN]),token:z.string().regex(/^[a-f0-9]{48}$/).optional(),service:z.enum(['cleaning','lawn','car']).optional(),src:z.string().max(80).optional().nullable(),lang:z.enum(['en','es']).optional(),answers:z.record(z.any()).optional(),key:z.string().regex(/^[a-z_]{2,40}$/).optional(),path:z.string().max(200).optional(),content_type:z.string().max(100).optional(),id:z.string().uuid().optional(),stage:z.enum(['applied','phone_screen','equipment_check','rejected']).optional(),connecteam_user_id:z.number().int().positive().optional(),prefill:z.record(z.any()).optional(),skip:z.array(z.string()).optional()});
const MAX_JSON=40000;
const publicView=(r:any)=>({token:r.token,kind:r.kind,service:r.service,stage:r.stage,lang:r.lang,answers:r.answers,prefill:r.prefill,skip:r.skip_sections,files:Object.fromEntries(Object.entries(r.files??{}).map(([k,v]:any)=>[k,{name:v.name}]))});
function clean(service:Service,answers:Record<string,unknown>){const keys=new Set(fieldsFor(service).filter(f=>f.type!=='file').map(f=>f.key));const out:Record<string,unknown>={};for(const [k,v] of Object.entries(answers))if(keys.has(k))out[k]=Array.isArray(v)?v.map(String).slice(0,10).map(s=>s.slice(0,40)):String(v??'').slice(0,300);return out;}
async function byToken(token?:string){if(!token)return null;const {data}=await db.from('pro_applications').select('*').eq('token',token).maybeSingle();return data;}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 const raw=await req.text();if(raw.length>MAX_JSON)return reply({error:'too_large'},413);
 const parsed=Body.safeParse(JSON.parse(raw||'{}'));if(!parsed.success)return reply({error:'invalid_request',detail:parsed.error.flatten().fieldErrors},400);
 const b=parsed.data;
 try{
  if((ADMIN as readonly string[]).includes(b.action)){const auth=await requireServiceOrAdmin(req);if(!auth.ok)return reply({error:auth.error},auth.status);return await admin(b);}
  if(b.action==='start'){
   if(!b.service)return reply({error:'service_required'},400);
   const {data,error}=await db.from('pro_applications').insert({service:b.service,src:b.src??null,lang:b.lang??'en'}).select('*').single();if(error)throw error;return reply(publicView(data));
  }
  const app=await byToken(b.token);if(!app)return reply({error:'not_found'},404);
  const open=app.stage==='draft';
  if(b.action==='load')return reply(publicView(app));
  if(!open)return reply({error:'already_submitted'},409);
  if(b.action==='save'){
   const answers=clean(app.service,{...app.answers,...(b.answers??{})});
   const {error}=await db.from('pro_applications').update({answers,lang:b.lang??app.lang,updated_at:new Date().toISOString(),full_name:[answers.first_name,answers.last_name].filter(Boolean).join(' ')||app.full_name,email:(answers.email as string)||app.email,phone:(answers.phone as string)||app.phone}).eq('id',app.id);if(error)throw error;return reply({ok:true});
  }
  if(b.action==='upload_url'){
   const f=fieldsFor(app.service).find(x=>x.key===b.key&&x.type==='file');if(!f)return reply({error:'bad_key'},400);
   const ext=(b.content_type??'').includes('pdf')?'pdf':(b.content_type??'').includes('png')?'png':(b.content_type??'').includes('heic')?'heic':(b.content_type??'').includes('word')?'docx':'jpg';
   const path=`${app.id}/${b.key}-${Date.now()}.${ext}`;
   const {data,error}=await db.storage.from(BUCKET).createSignedUploadUrl(path);if(error)throw error;return reply({path,token:data.token});
  }
  if(b.action==='attach'){
   if(!b.key||!b.path?.startsWith(`${app.id}/${b.key}-`))return reply({error:'bad_path'},400);
   const dir=b.path.split('/')[0],name=b.path.split('/')[1];const {data:list}=await db.storage.from(BUCKET).list(dir,{search:name});if(!list?.some(o=>o.name===name))return reply({error:'upload_missing'},400);
   const files={...app.files,[b.key]:{path:b.path,name:String(b.answers?.name??name).slice(0,120),at:new Date().toISOString()}};
   const {error}=await db.from('pro_applications').update({files,updated_at:new Date().toISOString()}).eq('id',app.id);if(error)throw error;return reply({ok:true});
  }
  if(b.action==='submit'){
   const answers=clean(app.service,{...app.answers,...(b.answers??{})});
   const missing=missingKeys(app.service,answers,app.files,app.prefill,app.skip_sections);if(missing.length)return reply({error:'incomplete',missing},422);
   const merged={...app.prefill,...answers};const now=new Date().toISOString();
   const stage=app.kind==='finish_profile'?'profile_complete':'applied';
   const {error}=await db.from('pro_applications').update({answers,stage,submitted_at:now,stage_changed_at:now,updated_at:now}).eq('id',app.id).eq('stage','draft');if(error)throw error;
   const name=[merged.first_name,merged.last_name].filter(Boolean).join(' ')||app.full_name||'Applicant';
   if(app.kind==='finish_profile'&&app.connecteam_user_id){
    const kit=kitComplete(app.service,merged,app.files);
    await db.from('pro_pay_profiles').update({kit_complete:kit,pro_application_id:app.id}).eq('connecteam_user_id',app.connecteam_user_id);
    if(!app.is_test)await noteKitToConnecteam(app.connecteam_user_id,merged).catch(e=>db.from('integration_logs').insert({source:'internal',event:'pro-application.kit_note',status:'error',detail:String(e)}));
    await db.from('admin_alerts').insert({alert_type:'pro_profile_complete',level:'action',tier:'digest',category:'operations',title:`${name} finished their Tidy profile`,body:`Kit, photo ID and badge photo received. Vest ${merged.vest_size}, badge "${merged.badge_name}".`,action_url:`/admin/applications/${app.id}`,dedupe_key:`pro-profile:${app.id}`});
   }else if(!app.is_test){
    await db.from('admin_alerts').insert({alert_type:'pro_application',level:'action',tier:'urgent',category:'operations',title:`New ${SERVICE_LABEL[app.service as Service].en} application: ${name}`,body:`${merged.phone} · ${merged.email} · ZIPs ${(merged.zips as string[]??[]).join(', ')} · ${merged.years} yrs${app.src?` · src ${app.src}`:''}`,action_url:`/admin/applications/${app.id}`,dedupe_key:`pro-application:${app.id}`});
   }
   return reply({ok:true,stage});
  }
  return reply({error:'unknown_action'},400);
 }catch(e){const error=e instanceof Error?e.message:JSON.stringify(e);await db.from('integration_logs').insert({source:'internal',event:`pro-application.${b.action}`,status:'error',detail:error});return reply({error},500);}
});

async function signed(files:Record<string,any>){const out:Record<string,{url:string;name:string}>={};for(const [k,v] of Object.entries(files??{})){const {data}=await db.storage.from(BUCKET).createSignedUrl(v.path,3600);if(data)out[k]={url:data.signedUrl,name:v.name};}return out;}

async function admin(b:z.infer<typeof Body>){
 if(b.action==='admin_list'){const {data,error}=await db.from('pro_applications').select('id,kind,service,stage,full_name,email,phone,src,is_test,submitted_at,stage_changed_at,connecteam_user_id,updated_at').neq('stage','draft').order('submitted_at',{ascending:false}).limit(300);if(error)throw error;
  const {data:drafts}=await db.from('pro_applications').select('id,service,full_name,phone,updated_at,kind').eq('stage','draft').order('updated_at',{ascending:false}).limit(50);return reply({applications:data,drafts});}
 const app=b.id?(await db.from('pro_applications').select('*').eq('id',b.id).maybeSingle()).data:null;
 if(b.action==='admin_create_finish'){
  if(!b.connecteam_user_id||!b.service)return reply({error:'missing'},400);
  const {data:p}=await db.from('pro_pay_profiles').select('name,email').eq('connecteam_user_id',b.connecteam_user_id).single();
  const {data:old}=await db.from('pro_applications').select('id,token').eq('kind','finish_profile').eq('connecteam_user_id',b.connecteam_user_id).maybeSingle();if(old)return reply({id:old.id,token:old.token,existing:true});
  const {data,error}=await db.from('pro_applications').insert({kind:'finish_profile',service:b.service,connecteam_user_id:b.connecteam_user_id,prefill:b.prefill??{},skip_sections:b.skip??[],full_name:p?.name,email:p?.email,is_test:false}).select('id,token').single();if(error)throw error;
  await db.from('pro_pay_profiles').update({pro_application_id:data.id}).eq('connecteam_user_id',b.connecteam_user_id);return reply(data);
 }
 if(b.action==='admin_test_purge_files'&&b.path){if(!/^[0-9a-f-]{36}$/.test(b.path))return reply({error:'bad'},400);const {data:still}=await db.from('pro_applications').select('id').eq('id',b.path).maybeSingle();if(still)return reply({error:'exists'},409);const {data:objs}=await db.storage.from(BUCKET).list(b.path,{limit:100});const paths=(objs??[]).map(o=>`${b.path}/${o.name}`);if(paths.length)await db.storage.from(BUCKET).remove(paths);return reply({removed:paths.length});}
 if(!app)return reply({error:'not_found'},404);
 if(b.action==='admin_get')return reply({application:app,files:await signed(app.files)});
 if(b.action==='admin_stage'){if(['hired','profile_complete'].includes(app.stage))return reply({error:'locked'},409);const {error}=await db.from('pro_applications').update({stage:b.stage,stage_changed_at:new Date().toISOString()}).eq('id',app.id);if(error)throw error;await db.from('admin_alerts').update({resolved_at:new Date().toISOString()}).eq('dedupe_key',`pro-application:${app.id}`).is('resolved_at',null);return reply({ok:true});}
 if(b.action==='admin_hire'){if(app.kind!=='apply'||['draft','rejected'].includes(app.stage))return reply({error:'not_hireable'},409);if(app.stage==='hired')return reply({ok:true,already:true,user_id:app.connecteam_user_id});const r=await hireApplication(db,app);return reply(r);}
 if(b.action==='admin_send_finish'){
  if(app.kind!=='finish_profile'||!app.connecteam_user_id)return reply({error:'not_finish'},400);
  const {data:p}=await db.from('pro_pay_profiles').select('*').eq('connecteam_user_id',app.connecteam_user_id).single();if(!p?.email||p.active===false)return reply({error:'recipient_not_ready'},409);
  const {data:old}=await db.from('pro_paperwork_emails').select('id,status').eq('connecteam_user_id',p.connecteam_user_id).eq('kind','finish_profile_20261112').maybeSingle();if(old)return reply({already_attempted:true,mail:old});
  const {data:mail,error:me}=await db.from('pro_paperwork_emails').insert({connecteam_user_id:p.connecteam_user_id,kind:'finish_profile_20261112',status:'queued'}).select('id').single();if(me)throw me;
  const {data:claimed}=await db.rpc('claim_paperwork_email',{_id:mail.id});if(!claimed)return reply({error:'not_claimed'},409);
  const built=buildFinishProfileEmail({first:String(p.name).split(' ')[0],service:p.service_line,status:p.paperwork_status??{},signed:!!p.agreement_signed_at,coiValid:!!p.coi_verified_at&&(!p.coi_expires_at||Date.parse(p.coi_expires_at)>Date.now()),link:`https://jointidy.co/apply/finish?t=${app.token}`});
  const result=await sendProEmail(db as any,{applicantId:null,key:'connecteam_paperwork_finish_profile_20261112',to:p.email,name:p.name,built,triggeredBy:`paperwork:${mail.id}`,mode:'manual'});
  await db.from('pro_paperwork_emails').update({status:result.sent?'sent':'failed',sent_at:result.sent?new Date().toISOString():null,error:result.reason??null}).eq('id',mail.id);
  return reply({ok:result.sent,mail_id:mail.id,buttons:built.keys,result});
 }
 if(b.action==='admin_test_purge_files'){if(!b.path||!/^[0-9a-f-]{36}$/.test(b.path))return reply({error:'bad'},400);const {data:still}=await db.from('pro_applications').select('id').eq('id',b.path).maybeSingle();if(still)return reply({error:'exists'},409);const {data:objs}=await db.storage.from(BUCKET).list(b.path,{limit:100});const paths=(objs??[]).map(o=>`${b.path}/${o.name}`);if(paths.length)await db.storage.from(BUCKET).remove(paths);return reply({removed:paths.length});}
 if(b.action==='admin_test_kit'){if(!app.is_test||!app.connecteam_user_id)return reply({error:'test_only'},403);return reply(await noteKitToConnecteam(app.connecteam_user_id,{...app.prefill,...app.answers}));}
 if(b.action==='admin_test_cleanup'){
  if(!app.is_test)return reply({error:'test_only'},403);
  if(app.connecteam_user_id){const {data:p}=await db.from('pro_pay_profiles').select('is_test').eq('connecteam_user_id',app.connecteam_user_id).maybeSingle();if(p&&!p.is_test)return reply({error:'real_profile'},403);
   await ct('PUT','/users/v1/users?sendActivation=false',[{userId:app.connecteam_user_id,isArchived:true}]).catch(()=>null);
   await db.from('pro_paperwork_emails').update({status:'cancelled'}).eq('connecteam_user_id',app.connecteam_user_id).in('status',['queued','held']);
   await db.from('pro_pay_profiles').delete().eq('connecteam_user_id',app.connecteam_user_id).eq('is_test',true);}
  const {data:objs}=await db.storage.from(BUCKET).list(app.id,{limit:100});const paths=[...new Set([...Object.values(app.files??{}).map((v:any)=>v.path),...(objs??[]).map(o=>`${app.id}/${o.name}`)])];if(paths.length)await db.storage.from(BUCKET).remove(paths);
  await db.from('pro_pay_profiles').update({pro_application_id:null}).eq('pro_application_id',app.id);
  await db.from('admin_alerts').update({resolved_at:new Date().toISOString()}).like('dedupe_key',`%${app.id}%`).is('resolved_at',null);
  const {error}=await db.from('pro_applications').delete().eq('id',app.id).eq('is_test',true);if(error)throw error;return reply({ok:true});
 }
 return reply({error:'unknown_action'},400);
}
