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
 const body=z.object({action:z.enum(['sync','hire','test_email']).default('sync'),applicant_id:z.string().uuid().optional()}).safeParse(await req.json().catch(()=>({})));
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
  const {data:profile}=await db.from('pro_pay_profiles').select('*').eq('connecteam_user_id',u.userId).single();await processPaperworkEmails(db,fresh,profile);
  return reply({ok:true,user_id:u.userId,sendActivation:false});
 }
 const {data:pool,error}=await db.from('jobber_service_pro_pool').select('*').eq('active',true);if(error)throw error;
 const catalog=await all('/documents/v1/documents','documents');
 const w9=catalog.find(d=>d.templateType==='w9'),coi=catalog.find(d=>d.name.startsWith('Certificate of Insurance'));
 if(!w9||!coi)throw new Error('Required W-9/COI document missing');
 const {data:profiles}=await db.from('pro_pay_profiles').select('*');
 const tracked=new Map((profiles??[]).map(p=>[Number(p.connecteam_user_id),p]));
 // New hires created in Connecteam are discovered from their service Position.
 for(const u of users){if(u.isArchived||tracked.has(u.userId))continue;const position=(u.customFields??[]).find((f:any)=>f.name==='Position');const value=position?.value?.[0]?.value;const service=Object.keys(POSITIONS).find(s=>POSITIONS[s]===value);if(!service)continue;const {data:a}=await db.from('applicants').select('id').ilike('email',u.email??'missing').limit(1).maybeSingle();const p={connecteam_user_id:u.userId,name:`${u.firstName} ${u.lastName}`,service_line:service,applicant_id:a?.id??null,email:u.email??null,is_test:false};const r=await db.from('pro_pay_profiles').upsert(p,{onConflict:'connecteam_user_id'});if(r.error)throw r.error;tracked.set(u.userId,p);}
 for(const p of pool??[]){const u=users.find(u=>u.userId===Number(p.connecteam_user_id));if(!u)continue;await ensurePosition(u,p.service_line);const old=tracked.get(u.userId);const {data:app}=await db.from('applicants').select('id').ilike('email',u.email??'missing').limit(1).maybeSingle();const profile={...old,connecteam_user_id:u.userId,name:p.pro_name??`${u.firstName} ${u.lastName}`,service_line:p.service_line,applicant_id:old?.applicant_id??app?.id??null,email:u.email??old?.email??null,is_test:old?.is_test??false};const saved=await db.from('pro_pay_profiles').upsert(profile,{onConflict:'connecteam_user_id'});if(saved.error)throw saved.error;tracked.set(u.userId,profile);}
 let synced=0;
 for(const p of tracked.values()){
  if(p.is_test||!POSITIONS[p.service_line??''])continue;
  const agreement=catalog.find(d=>d.name===`Independent Contractor Agreement — ${POSITIONS[p.service_line]}`);if(!agreement)throw new Error(`ICA missing for ${p.service_line}`);
  const rows=await all('/documents/v1/user-documents','documents',[['userIds',String(p.connecteam_user_id)]]);
  const state=paperworkState(rows,{w9:w9.documentId,coi:coi.documentId,agreement:agreement.documentId});
  const r=await db.rpc('connecteam_commit_paperwork',{_user:p.connecteam_user_id,_status:state.status,_complete:state.complete,_signed_at:state.signedAt,_expiry:state.expiry,_coi_approved:state.coiApproved});if(r.error)throw r.error;synced++;
  const user=users.find(u=>u.userId===Number(p.connecteam_user_id));if(user){await checkGroup(user,p.service_line);const {data:profile}=await db.from('pro_pay_profiles').select('*').eq('connecteam_user_id',p.connecteam_user_id).single();await processPaperworkEmails(db,user,profile);}
 }
 return reply({ok:true,synced});
 }catch(e){const error=e instanceof Error?e.message:String(e);await db.from('admin_alerts').upsert({dedupe_key:'connecteam-paperwork-sync',alert_type:'integration_error',level:'warning',tier:'digest',title:'Connecteam paperwork sync needs attention',body:error},{onConflict:'dedupe_key',ignoreDuplicates:true});return reply({ok:false,error},502);}
});
async function checkGroup(user:any,service:string){const pack=PACKS[service];if(!pack?.group)return;const groups=user.smartGroupsIds??[];if(groups.includes(pack.group))return;const result=await db.from('admin_alerts').upsert({dedupe_key:`connecteam-pack-group:${user.userId}`,alert_type:'integration_error',level:'warning',tier:'digest',title:`assign ${user.firstName} ${user.lastName} to ${pack.name} in Connecteam`,body:`Expected smart group ${pack.group}; pack ${pack.id}. API membership does not include this group.`},{onConflict:'dedupe_key',ignoreDuplicates:true});if(result.error)throw result.error;}