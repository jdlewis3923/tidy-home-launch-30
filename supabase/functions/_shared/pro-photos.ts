// Pushes a Pro's photo ID + badge photo into Connecteam and emails Justin "Badge ready".
// Connecteam API has no avatar endpoint, so photos go onto the user's "Photo ID + Badge Photo"
// document (841237) via Attachments upload; fallback is a profile note with 30-day signed links.
import {ct} from './connecteam.ts';
import {sendBrevoEmail,ADMIN_EMAIL} from './notifyJustin.ts';
import {SERVICE_LABEL,type Service} from './pro-application.ts';

import {PHOTO_DOC_ID,MAX_PHOTO_ATTEMPTS,buildBadgeEmail} from './pro-photos-rules.ts';
export {PHOTO_DOC_ID,MAX_PHOTO_ATTEMPTS,retryDelayMs,buildBadgeEmail} from './pro-photos-rules.ts';
const BUCKET='pro-applications';
const PHOTOS=[['badge_photo','Badge photo'],['photo_id','Photo ID']] as const;
const mime=(p:string)=>p.endsWith('.png')?'image/png':p.endsWith('.pdf')?'application/pdf':p.endsWith('.heic')?'image/heic':'image/jpeg';
const msg=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,400);

async function links(db:any,files:Record<string,any>,ttl:number){const out:Record<string,string>={};for(const [k] of PHOTOS){const f=files?.[k];if(!f)continue;const {data}=await db.storage.from(BUCKET).createSignedUrl(f.path,ttl);if(data)out[k]=data.signedUrl;}return out;}

async function uploadToDocument(db:any,userId:number,files:Record<string,any>){
 const assigned=await ct('GET',`/documents/v1/user-documents?userIds=${userId}`);
 if(!(assigned.data?.documents??[]).some((d:any)=>d.documentId===PHOTO_DOC_ID))throw new Error(`Photo ID + Badge Photo document (${PHOTO_DOC_ID}) not assigned to user ${userId} yet`);
 const ids:string[]=[];
 for(const [k] of PHOTOS){const f=files?.[k];if(!f)throw new Error(`missing ${k}`);
  const {data:blob,error}=await db.storage.from(BUCKET).download(f.path);if(error||!blob)throw new Error(`download ${k}`);
  const type=mime(f.path);const g=await ct('POST','/attachments/v1/files/generate-upload-url',{fileName:`${k}-${f.path.split('/').pop()}`,fileTypeHint:type,featureType:'documents'});
  const fileId=g.data?.fileId,url=g.data?.uploadFileUrl;if(!fileId||!url)throw new Error('no upload url');
  const put=await fetch(url,{method:'PUT',headers:{'Content-Type':type},body:await blob.arrayBuffer()});if(!put.ok)throw new Error(`storage PUT [${put.status}] ${(await put.text()).slice(0,200)}`);
  await ct('PUT',`/attachments/v1/files/complete-upload/${fileId}`);ids.push(fileId);}
 return await ct('PUT',`/documents/v1/users/${userId}/documents/${PHOTO_DOC_ID}/entry`,{fileIds:ids});
}

/** Never throws. Records {status,method,attempts,...} on the application row. */
export async function pushPhotosToConnecteam(db:any,app:any,userId:number){
 const prev=app.connecteam_photos??{};if(prev.status==='done')return prev;
 const attempts=(prev.attempts??0)+1;const at=new Date().toISOString();let state:any;
 try{const r=await uploadToDocument(db,userId,app.files);state={status:'done',method:'document_upload',document_id:PHOTO_DOC_ID,entry_status:r?.data?.status??null,user_id:userId,attempts,at};}
 catch(e){const err=msg(e);
  if(prev.note_written){state={status:attempts>=MAX_PHOTO_ATTEMPTS?'fallback':'fallback_retrying',method:'note_fallback',upload_error:err,user_id:userId,attempts,at,note_written:prev.note_written};}
  else try{const l=await links(db,app.files,30*86400);
   await ct('POST',`/users/v1/users/${userId}/notes`,{title:'Badge photo + Photo ID (links valid 30 days)',text:`Badge photo: ${l.badge_photo??'missing'}\nPhoto ID: ${l.photo_id??'missing'}`});
   state={status:attempts>=MAX_PHOTO_ATTEMPTS?'fallback':'fallback_retrying',method:'note_fallback',upload_error:err,user_id:userId,attempts,at,note_written:prev.note_written||at};
  }catch(e2){state={status:attempts>=MAX_PHOTO_ATTEMPTS?'error':'retrying',method:null,upload_error:err,error:msg(e2),user_id:userId,attempts,at};}}
 // A note fallback keeps retrying the real upload until MAX attempts; don't write duplicate notes.
 if(state.method==='note_fallback'&&prev.note_written)state.note_written=prev.note_written;
 await db.from('pro_applications').update({connecteam_photos:state}).eq('id',app.id);
 await db.from('integration_logs').insert({source:'internal',event:'pro-application.connecteam_photos',status:state.status==='done'?'success':state.method?'warning':'error',detail:JSON.stringify(state)}).then(()=>null,()=>null);
 return state;
}

/** Once per application. Never throws. */
export async function sendBadgeReady(db:any,app:any,merged:Record<string,any>){
 if(app.badge_email?.status==='sent')return app.badge_email;
 const at=new Date().toISOString();let state:any;
 try{const l=await links(db,app.files,30*86400);
  const name=[merged.first_name,merged.last_name].filter(Boolean).join(' ')||app.full_name||'Pro';
  const {subject,html}=buildBadgeEmail({name,service:SERVICE_LABEL[app.service as Service].en,badge:String(merged.badge_name??''),vest:String(merged.vest_size??''),links:l,adminUrl:`https://jointidy.co/admin/applications/${app.id}`});
  const ext=(k:string)=>String(app.files?.[k]?.path??'.jpg').split('.').pop();
  const attachments=Object.entries(l).map(([k,url])=>({url,name:`${k==='badge_photo'?'badge-photo':'photo-id'}-${name.replace(/\W+/g,'-')}.${ext(k)}`}));
  const id=await sendBrevoEmail({toEmail:ADMIN_EMAIL,subject:(app.is_test?'[TEST] ':'')+subject,htmlContent:html,attachments,templateName:'badge_ready',triggeredBy:'pro-application',adminChannel:app.is_test?'test':'urgent'});
  state={status:'sent',message_id:id,to:ADMIN_EMAIL,at};
 }catch(e){state={status:'error',error:msg(e),at,attempts:(app.badge_email?.attempts??0)+1};}
 await db.from('pro_applications').update({badge_email:state}).eq('id',app.id);return state;
}
