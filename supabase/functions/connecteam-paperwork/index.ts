import '../_shared/http.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {z} from 'npm:zod@3';
import {requireServiceOrAdmin} from '../_shared/admin-auth.ts';
import {ct} from '../_shared/connecteam.ts';
import {paperworkState,POSITIONS} from '../_shared/paperwork-rules.ts';
import {processPaperworkEmails} from '../_shared/paperwork-mailer.ts';
import {buildPaperworkEmail,PACKS} from '../_shared/paperwork-email.ts';
import {sendProEmail} from '../_shared/pro-send.ts';
import {registerTeamMember,isHireTestUser} from '../_shared/connecteam-new-member.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}});
const reply=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...corsHeaders,'Content-Type':'application/json'}});
async function all(path:string,key:string,params:[string,string][]=[]):Promise<any[]> {
 const out:any[]=[];let offset=0;
 for(let n=0;n<100;n++){const qs=new URLSearchParams([...params,['limit','200'],['offset',String(offset)]]);const r=await ct('GET',`${path}?${qs}`);out.push(...(r.data?.[key]??[]));const next=r.paging?.offset;if(next===undefined||next<=offset||next>=r.paging?.total)return out;offset=next;}
 throw new Error('pagination limit exceeded');
}
async function setPosition(userId:number,service:string,fields:any[]) {
 const field=fields.find(f=>f.name==='Position');const option=field?.dropdownOptions?.find((o:any)=>o.value===POSITIONS[service]&&!o.isDeleted&&!o.isDisabled);
 if(!field||!option)throw new Error(`Position not configured for ${service}`);
 await ct('PUT','/users/v1/users?sendActivation=false',[{userId,customFields:[{customFieldId:field.id,value:[{id:option.id}]}]}]);
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 const auth=await requireServiceOrAdmin(req);if(!auth.ok)return reply({error:auth.error},auth.status);
 const body=z.object({action:z.enum(['sync','hire','mail','test_email','hire_test_create','hire_test_find','quota','hire_test_position','hire_test_run','hire_test_cleanup']).default('sync'),applicant_id:z.string().uuid().optional(),user_id:z.number().int().positive().optional()}).safeParse(await req.json().catch(()=>({})));
 if(!body.success)return reply({error:'invalid_request'},400);
 try{
 if(body.data.action==='test_email'){
  const {data:old}=await db.from('pro_paperwork_emails').select('status').eq('connecteam_user_id',31157330).eq('kind','test').maybeSingle();if(old)return reply({ok:old.status==='sent',already_attempted:true,status:old.status});
  const {data:row,error}=await db.from('pro_paperwork_emails').insert({connecteam_user_id:31157330,kind:'test'}).select('id').single();if(error)throw error;
  const {data:claimed}=await db.rpc('claim_paperwork_email',{_id:row.id});if(!claimed)return reply({error:'not_claimed'},409);
  const built=buildPaperworkEmail({first:'Justin',phone:'your Connecteam mobile number',service:'cleaning',status:{},signed:false,coiValid:false},'welcome');
  const result=await sendProEmail(db,{applicantId:null,key:'connecteam_paperwork_test',to:'jdlewis3923@gmail.com',name:'Justin Lewis',built,triggeredBy:`paperwork-test:${row.id}`});
  await db.from('pro_paperwork_emails').update({status:result.sent?'sent':'failed',sent_at:result.sent?new Date().toISOString():null,error:result.reason??null}).eq('id',row.id);
  return reply({ok:result.sent,recipient:'jdlewis3923@gmail.com',result});
 }
 // Owner-only hire-trigger test: a fake Connecteam user (no activation, Justin's email).
 if(body.data.action==='quota'){const r=await fetch('https://api.connecteam.com/me',{headers:{'X-API-KEY':Deno.env.get('CONNECTEAM_API_KEY')??''}});const h:Record<string,string>={};r.headers.forEach((v,k)=>{if(k.startsWith('x-ratelimit')||k==='retry-after')h[k]=v;});return reply({status:r.status,headers:h});}
 if(body.data.action==='hire_test_find'){const users=await all('/users/v1/users','users');const u=users.filter(x=>String(x.phoneNumber??'').replace(/\D/g,'').endsWith('3055550142'));const {data:prof}=await db.from('pro_pay_profiles').select('connecteam_user_id,name,service_line,is_test').in('connecteam_user_id',u.map(x=>x.userId));const {data:mail}=await db.from('pro_paperwork_emails').select('kind,status,sent_at').in('connecteam_user_id',u.map(x=>x.userId));const {data:al}=await db.from('admin_alerts').select('title,resolved_at').in('dedupe_key',u.map(x=>`set-position:${x.userId}`));return reply({users:u.map(x=>({userId:x.userId,isArchived:x.isArchived,email:x.email})),profiles:prof,emails:mail,alerts:al});}
 if(body.data.action==='hire_test_create'){
  const created=await ct('POST','/users/v1/users?sendActivation=false',[{firstName:'ZZ',lastName:'Hire Test',phoneNumber:'+13055550142',email:'jdlewis3923@gmail.com',userType:'user'}]);
  return reply({ok:true,created:created.data});
 }
 if(body.data.action==='hire_test_position'){
  if(!body.data.user_id)return reply({error:'user_id_required'},400);
  const fields=(await ct('GET','/users/v1/custom-fields')).data?.customFields??[];await setPosition(body.data.user_id,'cleaning',fields);return reply({ok:true});
 }
 if(body.data.action==='hire_test_cleanup'){
  if(!body.data.user_id)return reply({error:'user_id_required'},400);
  const u=body.data.user_id;const {data:profile}=await db.from('pro_pay_profiles').select('name,email,is_test').eq('connecteam_user_id',u).maybeSingle();
  if(!profile?.is_test||profile.email!=='jdlewis3923@gmail.com'||profile.name!=='ZZ Hire Test')return reply({error:'test_profile_required'},403);
  const archived=await ct('PUT','/users/v1/users?sendActivation=false',[{userId:u,isArchived:true}]);
  const cancelled=await db.from('pro_paperwork_emails').update({status:'cancelled'}).eq('connecteam_user_id',u).in('status',['queued','held']);if(cancelled.error)throw cancelled.error;
  await db.from('jobber_service_pro_pool').delete().eq('connecteam_user_id',u);
  const removed=await db.from('pro_pay_profiles').delete().eq('connecteam_user_id',u).eq('is_test',true);if(removed.error)throw removed.error;
  await db.from('admin_alerts').update({resolved_at:new Date().toISOString()}).in('dedupe_key',[`set-position:${u}`]).is('resolved_at',null);
  return reply({ok:true,archived:archived.data??true});
 }
 if(body.data.action==='hire_test_run'){
  if(!body.data.user_id)return reply({error:'user_id_required'},400);
  const id=body.data.user_id;
  const user=(await ct('GET',`/users/v1/users?userIds=${id}`)).data?.users?.[0];
  if(!isHireTestUser(user)||user.isArchived)return reply({error:'active_hire_test_required'},403);
  const {data:attempt}=await db.from('pro_paperwork_emails').select('status').eq('connecteam_user_id',id).eq('kind','welcome').maybeSingle();
  if(attempt)return reply({ok:attempt.status==='sent',already_attempted:true,status:attempt.status});
  const fields=(await ct('GET','/users/v1/custom-fields')).data?.customFields??[];
  await setPosition(id,'cleaning',fields);
  const confirmed=(await ct('GET',`/users/v1/users?userIds=${id}`)).data?.users?.[0];
  if(!isHireTestUser(confirmed))throw new Error('test_user_readback_failed');
  const profile=await registerTeamMember(db,confirmed,true);
  if(profile.service_line!=='cleaning')throw new Error('position_readback_failed');
  await processPaperworkEmails(db,confirmed,profile,false,sendProEmail,true);
  const {data:mail}=await db.from('pro_paperwork_emails').select('id,status,sent_at,error').eq('connecteam_user_id',id).eq('kind','welcome').single();
  return reply({ok:mail?.status==='sent',user_id:id,position:POSITIONS.cleaning,profile_created:true,recipient:profile.email,mail});
 }
 const {data:flag}=await db.from('app_settings').select('value').eq('key','checkr_live').maybeSingle();const checkrLive=flag?.value===true||flag?.value==='on';
 if(body.data.action==='mail'){
  if(!body.data.user_id)return reply({error:'user_id_required'},400);
  const {data:profile}=await db.from('pro_pay_profiles').select('*').eq('connecteam_user_id',body.data.user_id).single();
  if(!profile)return reply({error:'not_found'},404);
  // A successful paperwork sync proves the service Position and pack already exist.
  // Owner-approved releases must not depend on another rate-limited Connecteam read.
  if(profile.paperwork_synced_at&&!profile.paperwork_email_held&&profile.applicant_id){
   const {data:applicant}=await db.from('applicants').select('first_name,phone').eq('id',profile.applicant_id).single();
   if(!applicant?.phone)return reply({error:'missing_login_phone'},409);
   await processPaperworkEmails(db,{firstName:applicant.first_name,phoneNumber:applicant.phone},profile,checkrLive,sendProEmail);
   return reply({ok:true,source:'verified_paperwork_sync'});
  }
  const user=(await ct('GET',`/users/v1/users?userIds=${body.data.user_id}`)).data?.users?.[0];
  if(!user)return reply({error:'not_found'},404);
  const position=(user.customFields??[]).find((f:any)=>f.name==='Position')?.value?.[0]?.value;
  if(position!==POSITIONS[profile.service_line])return reply({ok:false,error:'position_not_ready'},409);
  await checkGroup(user,profile.service_line);await processPaperworkEmails(db,user,profile,checkrLive,sendProEmail);return reply({ok:true});
 }
 const fields=(await ct('GET','/users/v1/custom-fields')).data?.customFields??[];
 const users=await all('/users/v1/users','users');
 const ensurePosition=async(user:any,service:string)=>{const current=(user.customFields??[]).find((f:any)=>f.name==='Position')?.value?.[0]?.value;if(current!==POSITIONS[service])await setPosition(user.userId,service,fields);};
 if(body.data.action==='hire'){
  if(!body.data.applicant_id)return reply({error:'applicant_id_required'},400);
  const {data:a,error}=await db.from('applicants').select('id,first_name,last_name,phone,email,service,is_test_row').eq('id',body.data.applicant_id).single();if(error||!a)return reply({error:'not_found'},404);
  const {data:p}=await db.from('contractor_pipeline').select('stage,archived,state').eq('applicant_id',a.id).single();
  if(p?.archived||p?.state!=='open'||!['agreement','background','active'].includes(p?.stage??''))return reply({error:'not_hired'},403);
  const service=String(a.service).includes('clean')?'cleaning':String(a.service).includes('lawn')?'lawn':'detailing';
  let u=users.find(x=>String(x.phoneNumber).replace(/\D/g,'').slice(-10)===String(a.phone).replace(/\D/g,'').slice(-10));
  if(!u){const field=fields.find((f:any)=>f.name==='Position'),option=field?.dropdownOptions?.find((o:any)=>o.value===POSITIONS[service]);if(!option)throw new Error('Position missing');const created=await ct('POST','/users/v1/users?sendActivation=false',[{firstName:a.first_name,lastName:a.last_name,phoneNumber:a.phone,email:a.email,userType:'user',customFields:[{customFieldId:field.id,value:[{id:option.id}]}]}]);u=(created.data?.users??created.data?.results??[])[0];}
  if(!u?.userId)throw new Error('Connecteam returned no user');await setPosition(u.userId,service,fields);
  const saved=await db.from('pro_pay_profiles').upsert({connecteam_user_id:u.userId,applicant_id:a.id,service_line:service,name:`${a.first_name} ${a.last_name}`,email:a.email,is_test:a.is_test_row},{onConflict:'connecteam_user_id'});if(saved.error)throw saved.error;
  const fresh=(await ct('GET',`/users/v1/users?userIds=${u.userId}`)).data?.users?.[0]??u;await checkGroup(fresh,service);
  const {data:profile}=await db.from('pro_pay_profiles').select('*').eq('connecteam_user_id',u.userId).single();await processPaperworkEmails(db,fresh,profile,checkrLive,sendProEmail);
  return reply({ok:true,user_id:u.userId,sendActivation:false});
 }
 const {data:pool,error}=await db.from('jobber_service_pro_pool').select('*').eq('active',true);if(error)throw error;
 const catalog=await all('/documents/v1/documents','documents');
 const w9=catalog.find(d=>d.templateType==='w9'),coi=catalog.find(d=>d.name.startsWith('Certificate of Insurance'));
 if(!w9||!coi)throw new Error('Required W-9/COI document missing');
 const {data:profiles}=await db.from('pro_pay_profiles').select('*');
 const tracked=new Map((profiles??[]).map(p=>[Number(p.connecteam_user_id),p]));
 // New hires created in Connecteam are discovered from their service Position.
 // Hire trigger: "Add to team" in Connecteam creates a user. Any new, active, non-owner user not yet tracked becomes a Pro profile.
 const poolIds=new Set((pool??[]).map(p=>Number(p.connecteam_user_id)));
 for(const u of users){if(u.isArchived||tracked.has(u.userId)||u.userId===31157330||poolIds.has(u.userId)||(u.userType&&u.userType!=='user'))continue;const position=(u.customFields??[]).find((f:any)=>f.name==='Position');const value=position?.value?.[0]?.value;const service=Object.keys(POSITIONS).find(s=>POSITIONS[s]===value);const name=`${u.firstName??''} ${u.lastName??''}`.trim()||`User ${u.userId}`;
  const profile=await registerTeamMember(db,u,isHireTestUser(u));tracked.set(u.userId,profile);}
 for(const p of pool??[]){const u=users.find(u=>u.userId===Number(p.connecteam_user_id));if(!u)continue;await ensurePosition(u,p.service_line);const old=tracked.get(u.userId);const {data:app}=await db.from('applicants').select('id').ilike('email',u.email??'missing').limit(1).maybeSingle();const profile={...old,connecteam_user_id:u.userId,name:p.pro_name??`${u.firstName} ${u.lastName}`,service_line:p.service_line,applicant_id:old?.applicant_id??app?.id??null,email:u.email??old?.email??null,is_test:old?.is_test??false};const saved=await db.from('pro_pay_profiles').upsert(profile,{onConflict:'connecteam_user_id'});if(saved.error)throw saved.error;tracked.set(u.userId,profile);}
 for(const p of tracked.values()){if(p.service_line)continue;const u=users.find(x=>x.userId===Number(p.connecteam_user_id));const value=(u?.customFields??[]).find((f:any)=>f.name==='Position')?.value?.[0]?.value;const service=Object.keys(POSITIONS).find(s=>POSITIONS[s]===value);if(!service)continue;const r=await db.from('pro_pay_profiles').update({service_line:service}).eq('connecteam_user_id',p.connecteam_user_id);if(r.error)throw r.error;p.service_line=service;await db.from('admin_alerts').update({resolved_at:new Date().toISOString()}).eq('dedupe_key',`set-position:${p.connecteam_user_id}`).is('resolved_at',null);}
 // One batched read of everyone's documents instead of one call per Pro.
 const ids=[...tracked.values()].filter(p=>!p.is_test&&POSITIONS[p.service_line??'']).map(p=>String(p.connecteam_user_id));
 let batched:any[]|null=null;
 if(ids.length){try{batched=await all('/documents/v1/user-documents','documents',ids.map(id=>['userIds',id] as [string,string]));if(batched.length&&batched.some(r=>r.userId===undefined))batched=null;}catch{batched=null;}}
 let synced=0;
 for(const p of tracked.values()){
  if(p.is_test||!POSITIONS[p.service_line??''])continue;
  const agreement=catalog.find(d=>d.name===`Independent Contractor Agreement — ${POSITIONS[p.service_line]}`);if(!agreement)throw new Error(`ICA missing for ${p.service_line}`);
  const rows=batched?batched.filter(r=>Number(r.userId)===Number(p.connecteam_user_id)):await all('/documents/v1/user-documents','documents',[['userIds',String(p.connecteam_user_id)]]);
  const state=paperworkState(rows,{w9:w9.documentId,coi:coi.documentId,agreement:agreement.documentId});
  const r=await db.rpc('connecteam_commit_paperwork',{_user:p.connecteam_user_id,_status:state.status,_complete:state.complete,_signed_at:state.signedAt,_expiry:state.expiry,_coi_approved:state.coiApproved});if(r.error)throw r.error;synced++;
  const user=users.find(u=>u.userId===Number(p.connecteam_user_id));if(user){await checkGroup(user,p.service_line);const {data:profile}=await db.from('pro_pay_profiles').select('*').eq('connecteam_user_id',p.connecteam_user_id).single();await processPaperworkEmails(db,user,profile,checkrLive,sendProEmail);}
 }
 await db.rpc('retire_signing_selftest_if_signed');
 return reply({ok:true,synced,batched:!!batched});
 }catch(e){const error=e instanceof Error?e.message:String(e);await db.from('admin_alerts').upsert({dedupe_key:'connecteam-paperwork-sync',alert_type:'integration_error',level:'warning',tier:'digest',title:'Connecteam paperwork sync needs attention',body:error},{onConflict:'dedupe_key',ignoreDuplicates:true});return reply({ok:false,error},502);}
});
async function checkGroup(user:any,service:string){const pack=PACKS[service];if(!pack?.group)return;const groups=user.smartGroupsIds??[];if(groups.includes(pack.group))return;const result=await db.from('admin_alerts').upsert({dedupe_key:`connecteam-pack-group:${user.userId}`,alert_type:'integration_error',level:'warning',tier:'digest',title:`assign ${user.firstName} ${user.lastName} to ${pack.name} in Connecteam`,body:`Expected smart group ${pack.group}; pack ${pack.id}. API membership does not include this group.`},{onConflict:'dedupe_key',ignoreDuplicates:true});if(result.error)throw result.error;}