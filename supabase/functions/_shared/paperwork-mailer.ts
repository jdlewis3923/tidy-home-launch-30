import {sendProEmail} from './pro-send.ts';
import {buildPaperworkEmail,dueKinds,reminderWindow} from './paperwork-email.ts';
export async function processPaperworkEmails(db:any,user:any,profile:any,checkrLive=false){
 const {data:history,error}=await db.from('pro_paperwork_emails').select('*').eq('connecteam_user_id',profile.connecteam_user_id);if(error)throw error;
 const sent=(history??[]).filter((r:any)=>r.status==='sent');const welcome=sent.find((r:any)=>r.kind==='welcome');
 const complete=profile.paperwork_complete&&(!checkrLive||profile.paperwork_status?.checkr==='complete');
 const kinds=dueKinds(welcome?.sent_at??null,complete,sent.map((r:any)=>r.kind),Date.now());
 for(const kind of kinds){const r=await db.from('pro_paperwork_emails').upsert({connecteam_user_id:profile.connecteam_user_id,kind,status:profile.paperwork_email_held?'held':'queued'},{onConflict:'connecteam_user_id,kind',ignoreDuplicates:true});if(r.error)throw r.error;}
 if(complete){await db.from('pro_paperwork_emails').update({status:'cancelled'}).eq('connecteam_user_id',profile.connecteam_user_id).in('kind',['reminder48','reminder5d']).eq('status','queued');}
 if(profile.paperwork_email_held||profile.is_test)return;
 const {data:pending}=await db.from('pro_paperwork_emails').select('*').eq('connecteam_user_id',profile.connecteam_user_id).eq('status','queued').lte('due_at',new Date().toISOString());
 for(const row of pending??[]){if(row.kind.startsWith('reminder')&&!reminderWindow(new Date()))continue;
  const {data:claimed,error:ce}=await db.rpc('claim_paperwork_email',{_id:row.id});if(ce)throw ce;if(!claimed)continue;
  const built=buildPaperworkEmail({first:user.firstName,phone:user.phoneNumber??'',service:profile.service_line,status:profile.paperwork_status??{},signed:!!profile.agreement_signed_at,coiValid:!!profile.coi_verified_at&&(!profile.coi_expires_at||Date.parse(profile.coi_expires_at)>Date.now()),lang:profile.preferred_language,checkrUrl:checkrLive?profile.checkr_invite_url:undefined},row.kind);
  const result=await sendProEmail(db,{applicantId:profile.applicant_id,key:`connecteam_paperwork_${row.kind}`,to:profile.email,name:profile.name,built,triggeredBy:`paperwork:${row.id}`,mode:'transition'});
  await db.from('pro_paperwork_emails').update({status:result.sent?'sent':'failed',sent_at:result.sent?new Date().toISOString():null,error:result.reason??null}).eq('id',row.id);
  if(!result.sent)await db.from('admin_alerts').upsert({dedupe_key:`paperwork-mail:${row.id}`,alert_type:'integration_error',level:'warning',tier:'digest',title:`Paperwork email needs attention: ${profile.name}`,body:result.reason??'send failed'},{onConflict:'dedupe_key',ignoreDuplicates:true});
 }
}