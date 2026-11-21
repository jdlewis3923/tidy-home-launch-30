import '../_shared/http.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
import {corsHeaders} from 'npm:@supabase/supabase-js@2/cors';
import {z} from 'npm:zod@3';
import {requireServiceOrAdmin} from '../_shared/admin-auth.ts';
import {CT_BASE} from '../_shared/connecteam.ts';
import {POSITIONS} from '../_shared/paperwork-rules.ts';
import {documentLink} from '../_shared/paperwork-email.ts';

const db=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false}});
const reply=(d:unknown,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{...corsHeaders,'Content-Type':'application/json'}});
const DOC_TYPES=['agreement','w9','coi','photo_id','badge_photo'] as const;
const Body=z.object({action:z.enum(['list','approve']).default('list'),connecteam_user_id:z.number().int().positive().optional(),document_type:z.enum(DOC_TYPES).optional(),document_id:z.number().int().positive().nullable().optional(),application_id:z.string().uuid().nullable().optional(),submitted_at:z.string().datetime().nullable().optional()});
const iso=(seconds?:number|null)=>seconds?new Date(seconds*1000).toISOString():null;
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).slice(0,500);
const phone=(value:unknown)=>{const digits=String(value??'').replace(/\D/g,'');return digits.length===10?`+1${digits}`:digits.length===11&&digits.startsWith('1')?`+${digits}`:String(value??'');};

// Page loads are deliberately bounded: a slow Connecteam response must never leave a spinner.
async function connecteamOnce(path:string){
 const key=Deno.env.get('CONNECTEAM_API_KEY');if(!key)throw new Error('Connecteam is not configured.');
 const res=await fetch(`${CT_BASE}${path}`,{headers:{'X-API-KEY':key,Accept:'application/json'},signal:AbortSignal.timeout(9000)});
 const text=await res.text();if(!res.ok)throw new Error(`Connecteam [${res.status}] ${text.slice(0,240)}`);
 return text?JSON.parse(text):{};
}

function latestBy<T>(rows:T[],key:(row:T)=>string){const map=new Map<string,T>();for(const row of rows)if(!map.has(key(row)))map.set(key(row),row);return map;}

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 const auth=await requireServiceOrAdmin(req);if(!auth.ok)return reply({error:auth.error},auth.status);
 const parsed=Body.safeParse(await req.json().catch(()=>({})));if(!parsed.success)return reply({error:'invalid_request'},400);
 const b=parsed.data;
 try{
  if(b.action==='approve'){
   if(auth.kind!=='admin')return reply({error:'admin_session_required'},403);
   if(!b.connecteam_user_id||!b.document_type)return reply({error:'document_required'},400);
   const {data:pro}=await db.from('pro_pay_profiles').select('connecteam_user_id').eq('connecteam_user_id',b.connecteam_user_id).eq('is_test',false).eq('active',true).maybeSingle();
   if(!pro)return reply({error:'pro_not_found'},404);
   if(b.application_id){const {data:app}=await db.from('pro_applications').select('id').eq('id',b.application_id).eq('connecteam_user_id',b.connecteam_user_id).maybeSingle();if(!app)return reply({error:'application_mismatch'},409);}
   const row={connecteam_user_id:b.connecteam_user_id,document_type:b.document_type,document_id:b.document_id??null,application_id:b.application_id??null,submitted_at:b.submitted_at??null,approved_by:auth.userId,approved_at:new Date().toISOString()};
   const {data,error}=await db.from('pro_document_reviews').upsert(row,{onConflict:'connecteam_user_id,document_type'}).select('connecteam_user_id,document_type,approved_by,approved_at,submitted_at').single();if(error)throw error;
   return reply({ok:true,review:data,connecteam_approval_supported:false});
  }

  const {data:profiles,error}=await db.from('pro_pay_profiles').select('*').eq('active',true).eq('is_test',false).eq('paperwork_complete',false).not('service_line','is',null).order('name');if(error)throw error;
  const ids=(profiles??[]).map(p=>Number(p.connecteam_user_id));
  if(!ids.length)return reply({pros:[],connecteam_approval_supported:false,connecteam_files_available:false});
  const [{data:applications},{data:reviews},{data:applicants}]=await Promise.all([
   db.from('pro_applications').select('*').in('connecteam_user_id',ids).order('submitted_at',{ascending:false}),
   db.from('pro_document_reviews').select('*').in('connecteam_user_id',ids),
   db.from('applicants').select('id,phone').in('id',(profiles??[]).map(p=>p.applicant_id).filter(Boolean)),
  ]);
  const appMap=latestBy(applications??[],a=>String(a.connecteam_user_id));
  const applicantMap=new Map((applicants??[]).map(a=>[a.id,a]));
  const reviewMap=new Map((reviews??[]).map(r=>[`${r.connecteam_user_id}:${r.document_type}`,r]));
  const applicantIds=(profiles??[]).map(p=>p.applicant_id).filter(Boolean);
  const {data:signatures}=applicantIds.length?await db.from('contract_signatures').select('applicant_id,typed_name,signed_at,signed_pdf_path,final_pdf_path').in('applicant_id',applicantIds).not('signed_at','is',null).order('signed_at',{ascending:false}):{data:[]};
  const signatureMap=latestBy(signatures??[],s=>String(s.applicant_id));

  let catalog:any[]=[];let userDocs:any[]=[];let connecteamError='';
  try{
   const qs=new URLSearchParams();for(const id of ids)qs.append('userIds',String(id));
   const [c,u]=await Promise.all([connecteamOnce('/documents/v1/documents?limit=200'),connecteamOnce(`/documents/v1/user-documents?${qs}`)]);
   catalog=c.data?.documents??[];userDocs=u.data?.documents??[];
  }catch(e){connecteamError=message(e);}

  const pros=[];
  for(const p of profiles??[]){
   const userId=Number(p.connecteam_user_id);const app=appMap.get(String(userId));const merged={...(app?.prefill??{}),...(app?.answers??{})};
   const agreement=catalog.find(d=>d.name===`Independent Contractor Agreement — ${POSITIONS[p.service_line]}`);
   const w9=catalog.find(d=>d.templateType==='w9');const coi=catalog.find(d=>String(d.name??'').startsWith('Certificate of Insurance'));
   const signature=signatureMap.get(String(p.applicant_id));let agreementUrl:string|null=null;
   const pdfPath=signature?.final_pdf_path??signature?.signed_pdf_path;
   if(pdfPath){const {data:signed,error:signError}=await db.storage.from('company-docs').createSignedUrl(pdfPath,600);if(!signError)agreementUrl=signed?.signedUrl??null;}
   const documents=[];
   for(const [key,label,template] of [['agreement','Contractor Agreement',agreement],['w9','W-9',w9],['coi','Insurance certificate (COI)',coi]] as const){
    const row=userDocs.find(d=>Number(d.userId)===userId&&Number(d.documentId)===Number(template?.documentId));
    const uploadedAt=iso(row?.uploadedAt);const signedAt=iso(row?.signedAt);const submittedAt=signedAt??uploadedAt;
    const review=reviewMap.get(`${userId}:${key}`);const currentReview=review&&(!submittedAt||Date.parse(review.approved_at)>=Date.parse(submittedAt))?review:null;
    const hasSubmission=!!submittedAt||['pendingApproval','approved','rejected'].includes(row?.status??'');
    documents.push({key,label,status:row?.status??p.paperwork_status?.[key]??'not_assigned',document_id:template?.documentId??null,uploaded_at:uploadedAt,signed_at:signedAt,signed_by:key==='agreement'&&signature?.typed_name?signature.typed_name:signedAt?p.name:null,content_url:key==='agreement'?agreementUrl:null,content_type:key==='agreement'&&agreementUrl?'application/pdf':null,content_error:key==='agreement'&&agreementUrl?null:hasSubmission?`Couldn't load — open in Connecteam. ${connecteamError||"Connecteam's Documents API returns status and timestamps, but not the submitted file."}`:null,connecteam_url:template?.documentId?documentLink(template.documentId):'https://app.connecteam.com/',tidy_reviewed_at:currentReview?.approved_at??null,can_review:hasSubmission||!!agreementUrl});
   }
   for(const [key,label] of [['photo_id','Photo ID'],['badge_photo','Badge photo']] as const){
    const file=app?.files?.[key];let url:string|null=null;let loadError='';
    if(file?.path){const {data:signed,error:signedError}=await db.storage.from('pro-applications').createSignedUrl(file.path,600);if(signedError)loadError=signedError.message;else url=signed?.signedUrl??null;}
    const submittedAt=file?.at??app?.submitted_at??null;const review=reviewMap.get(`${userId}:${key}`);const currentReview=review&&(!submittedAt||Date.parse(review.approved_at)>=Date.parse(submittedAt))?review:null;
    documents.push({key,label,status:file?'submitted':'pendingUserUpload',document_id:null,uploaded_at:submittedAt,signed_at:null,signed_by:null,content_url:url,content_type:'image',content_error:file&&!url?`Couldn't load the private photo. ${loadError}`:null,connecteam_url:null,tidy_reviewed_at:currentReview?.approved_at??null,can_review:!!url});
   }
   pros.push({connecteam_user_id:userId,name:p.name,service:p.service_line,phone:phone(app?.phone??merged.phone??applicantMap.get(p.applicant_id)?.phone),application_id:app?.id??null,documents});
  }
  return reply({pros,connecteam_error:connecteamError||null,connecteam_approval_supported:false,connecteam_files_available:false});
 }catch(e){return reply({error:message(e)},500);}
});
