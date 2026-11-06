import { POSITIONS } from './paperwork-rules.ts';

export async function registerTeamMember(db:any, user:any, isTest=false) {
 const position=(user.customFields??[]).find((f:any)=>f.name==='Position')?.value?.[0]?.value;
 const service=Object.keys(POSITIONS).find(s=>POSITIONS[s]===position)??null;
 const name=`${user.firstName??''} ${user.lastName??''}`.trim()||`User ${user.userId}`;
 const {data:applicant}=isTest?{data:null}:await db.from('applicants').select('id').ilike('email',user.email??'missing').limit(1).maybeSingle();
 const profile={connecteam_user_id:user.userId,name,service_line:service,applicant_id:applicant?.id??null,email:user.email??null,is_test:isTest};
 const saved=await db.from('pro_pay_profiles').upsert(profile,{onConflict:'connecteam_user_id'});if(saved.error)throw saved.error;
 if(!service)await db.from('admin_alerts').upsert({dedupe_key:`set-position:${user.userId}`,alert_type:'integration_error',level:'action',tier:'digest',category:'operations',title:`Set ${name}'s Position in Connecteam`,body:'New team member found. Set Position to House Cleaning Pro, Lawn Care Pro or Car Care Pro; the paperwork email sends automatically after that.'},{onConflict:'dedupe_key',ignoreDuplicates:true});
 return profile;
}

export function isHireTestUser(user:any) {
 return user?.firstName==='ZZ'&&user?.lastName==='Hire Test'&&user?.email==='jdlewis3923@gmail.com'&&String(user.phoneNumber??'').replace(/\D/g,'')==='13055550142';
}