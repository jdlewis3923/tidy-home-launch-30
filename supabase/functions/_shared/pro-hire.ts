// Website application → Connecteam user + Pro pay profile. Uses every answer we already have so nothing is asked twice.
import {ct} from './connecteam.ts';
import {POSITIONS} from './paperwork-rules.ts';
import {processPaperworkEmails} from './paperwork-mailer.ts';
import {sendProEmail} from './pro-send.ts';
import {kitComplete,type Service} from './pro-application.ts';

export const KIT_FIELDS=['Vest size','Badge name','Emergency contact','Vehicle'] as const;
const lineFor=(s:Service)=>s==='car'?'detailing':s;
export const e164=(p:unknown)=>{const d=String(p??'').replace(/\D/g,'').slice(-10);return d.length===10?`+1${d}`:null;};
export function kitValues(a:Record<string,any>):Record<(typeof KIT_FIELDS)[number],string>{
 return {'Vest size':String(a.vest_size??''),'Badge name':String(a.badge_name??''),'Emergency contact':[a.ec_name,a.ec_relationship&&`(${a.ec_relationship})`,a.ec_phone].filter(Boolean).join(' '),'Vehicle':[a.vehicle_year,a.vehicle_make,a.vehicle_model,a.vehicle_color,a.vehicle_plate&&`plate ${a.vehicle_plate}`].filter(Boolean).join(' ')};
}
export function shipping(a:Record<string,any>){return a.ship_same==='no'||!a.street?`${a.ship_street}, ${a.ship_city} FL ${a.ship_zip}`:`${a.street??''}, ${a.city??''} FL ${a.zip??''}`;}
export function profileNote(a:Record<string,any>){const k=kitValues(a);return `Vest size: ${k['Vest size']}\nBadge name: ${k['Badge name']}\nKit ship to: ${shipping(a)}\nEmergency contact: ${k['Emergency contact']}\nVehicle: ${k.Vehicle}\nVehicle magnet: ${a.magnet_opt_in??''}\nPhoto ID and badge photo are stored in Tidy admin.`;}

async function customFields(){return (await ct('GET','/users/v1/custom-fields')).data?.customFields??[];}
/** Writes kit values into Connecteam custom fields when they exist (creating them if the API allows), and always leaves a profile note. */
async function writeKit(userId:number,a:Record<string,any>,fields:any[]){
 const vals=kitValues(a);const failures:string[]=[];
 const absent=KIT_FIELDS.filter(n=>!fields.some(f=>f.name===n));
 if(absent.length){try{const r=await ct('POST','/users/v1/custom-fields',{customFields:absent.map(name=>({name,type:'str',categoryId:fields.find((f:any)=>f.name==='Position')?.categoryId??fields.find((f:any)=>f.categoryId)?.categoryId,isRequired:false,isVisibleToAllAdmins:true,isEditableForAllAdmins:true,isEditableForUsers:false,isVisibleToUsers:false,isMultiSelect:false}))});for(const made of (r.data?.customFields??[]))if(made?.id)fields.push(made);}catch(e){failures.push(`create fields: ${e instanceof Error?e.message:e}`);}}
 const cf=KIT_FIELDS.map(n=>({f:fields.find(x=>x.name===n),v:vals[n]})).filter(x=>x.f&&x.v).map(x=>({customFieldId:x.f.id,value:x.v}));
 let wroteFields=false;if(cf.length){try{await ct('PUT','/users/v1/users?sendActivation=false',[{userId,customFields:cf}]);wroteFields=cf.length===KIT_FIELDS.length;}catch(e){failures.push(`set fields: ${e instanceof Error?e.message:e}`);}}
 await ct('POST',`/users/v1/users/${userId}/notes`,{title:'Tidy kit & profile (from jointidy.co)',text:profileNote(a)});
 return {wroteFields,failures};
}
export async function noteKitToConnecteam(userId:number,a:Record<string,any>){return writeKit(userId,a,await customFields());}

export async function hireApplication(db:any,app:any){
 const a={...app.prefill,...app.answers};const service=app.service as Service;const line=lineFor(service);
 const phone=e164(a.phone);if(!phone)throw new Error('phone_invalid');
 const fields=await customFields();
 const pos=fields.find((f:any)=>f.name==='Position');const option=pos?.dropdownOptions?.find((o:any)=>o.value===POSITIONS[line]&&!o.isDeleted&&!o.isDisabled);if(!option)throw new Error(`Position option missing for ${POSITIONS[line]}`);
 const extra:any[]=[];const failures:string[]=[];
 const bday=fields.find((f:any)=>/birth/i.test(f.name));if(bday&&a.dob)extra.push({customFieldId:bday.id,value:a.dob});
 const addr=fields.find((f:any)=>/^address$|home address/i.test(f.name));if(addr&&a.street)extra.push({customFieldId:addr.id,value:`${a.street}, ${a.city}, FL ${a.zip}`});
 const created=await ct('POST','/users/v1/users?sendActivation=false',[{firstName:String(a.first_name).trim(),lastName:String(a.last_name).trim(),phoneNumber:phone,email:String(a.email).trim(),userType:'user',customFields:[{customFieldId:pos.id,value:[{id:option.id}]}]}]);
 const user=(created.data?.users??created.data?.results??[])[0];if(!user?.userId)throw new Error('Connecteam returned no user');
 if(extra.length){try{await ct('PUT','/users/v1/users?sendActivation=false',[{userId:user.userId,customFields:extra}]);}catch(e){failures.push(`address/birthday: ${e instanceof Error?e.message:e}`);}}
 const kit=await writeKit(user.userId,{...a,_dob:a.dob},fields);failures.push(...kit.failures);
 if(!bday||!addr||failures.length)await ct('POST',`/users/v1/users/${user.userId}/notes`,{title:'Contact details (from jointidy.co)',text:`Home address: ${a.street}, ${a.city}, FL ${a.zip}\nDate of birth: ${a.dob}`}).catch(()=>null);
 const profile={connecteam_user_id:user.userId,name:`${a.first_name} ${a.last_name}`.trim(),service_line:line,email:a.email,pro_application_id:app.id,kit_complete:kitComplete(service,a,app.files),is_test:!!app.is_test,language:app.lang==='es'?'es':'en'};
 const saved=await db.from('pro_pay_profiles').upsert(profile,{onConflict:'connecteam_user_id'});if(saved.error)throw saved.error;
 const now=new Date().toISOString();
 const up=await db.from('pro_applications').update({stage:'hired',connecteam_user_id:user.userId,hired_at:now,stage_changed_at:now}).eq('id',app.id);if(up.error)throw up.error;
 await db.from('admin_alerts').update({resolved_at:now}).eq('dedupe_key',`pro-application:${app.id}`).is('resolved_at',null);
 const {data:full}=await db.from('pro_pay_profiles').select('*').eq('connecteam_user_id',user.userId).single();
 const {data:flag}=await db.from('app_settings').select('value').eq('key','checkr_live').maybeSingle();
 await processPaperworkEmails(db,{firstName:a.first_name,phoneNumber:phone},full,flag?.value===true||flag?.value==='on',sendProEmail,!!app.is_test);
 const {data:mail}=await db.from('pro_paperwork_emails').select('status,sent_at').eq('connecteam_user_id',user.userId).eq('kind','welcome').maybeSingle();
 return {ok:true,user_id:user.userId,position:POSITIONS[line],kit_fields_written:kit.wroteFields,failures,welcome:mail};
}
