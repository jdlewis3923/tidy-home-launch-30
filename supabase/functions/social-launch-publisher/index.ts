import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { renderTemplate, instagramVersion } from '../_shared/socialPlanner.ts';
import { loadLaunchConfig } from '../_shared/launch-config.ts';
import { sha256 } from '../_shared/social-publish-policy.ts';
const graph = 'https://graph.facebook.com/v19.0';
const json = (data: unknown, status=200) => new Response(JSON.stringify(data),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
const Body=z.object({action:z.enum(['publish','audit','dry_run','history']).default('publish'),post_id:z.string().uuid().optional()});
type Post={id:string;channel:string;caption:string;template_copy:string|null;image_url:string|null;image_hash:string|null;scheduled_for:string|null;post_number:number|null;is_test:boolean;external_post_id:string|null;posted_at:string|null};
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 const cron=await isCronAuthorized(req); const auth=cron?null:await requireServiceOrAdmin(req);
 if(!cron && auth && !auth.ok)return json({error:auth.error},auth.status);
 const parsed=Body.safeParse(await req.json().catch(()=>({})));
 if(!parsed.success)return json({error:'Invalid request'},400);
 const {action,post_id}=parsed.data;
 if(cron && action!=='publish')return json({error:'Admin required'},403);
 const url=Deno.env.get('SUPABASE_URL');const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return json({error:'Publishing configuration missing'},500);
 const sb=createClient(url,key,{auth:{persistSession:false}});
 const vault=async(name:string)=>{const {data,error}=await sb.rpc('admin_get_meta_secret',{_name:name});if(error)throw new Error(error.message);return data as string|null;};
 const image=async(u:string|null)=>{
  if(!u)throw new Error('missing_image');
  // Only our public social bucket; never fetch arbitrary client URLs or redirects.
  if(!u.startsWith(`${url}/storage/v1/object/public/social-images/`))throw new Error('Image must be uploaded to the social calendar');
  const r=await fetch(u,{redirect:'error'});if(!r.ok)throw new Error(`Image unavailable [${r.status}]`);
  const bytes=await r.arrayBuffer();if(bytes.byteLength>15*1024*1024)throw new Error('Image too large');
  if(!(r.headers.get('content-type')??'').startsWith('image/'))throw new Error('Not an image');
  return {hash:await sha256(bytes),type:r.headers.get('content-type')};
 };
 const api=async(path:string,token:string,body?:Record<string,string>)=>{
  const response=await fetch(`${graph}/${path}`,body?{method:'POST',body:new URLSearchParams({...body,access_token:token})}:{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok)throw new Error(`Meta [${response.status}]: ${await response.text()}`);
  const result=await response.json();if(result.error)throw new Error(`Meta: ${JSON.stringify(result.error)}`);return result;
 };
 const cfg=await loadLaunchConfig(sb);
 const render=(p:Post)=>renderTemplate(p.template_copy??p.caption,{launch:cfg.cleaning?.first_visit_date??null,conversion:cfg.cleaning?.conversion_date??null,carLaunch:cfg.car?.first_visit_date??null,hangerDrop1:(cfg.global?.hanger_drops??[]).map(d=>d.start).sort()[0]??null},(p.scheduled_for??new Date().toISOString()).slice(0,10));
 const platforms=(c:string)=>c==='meta_combined'?['facebook','instagram']:[c];
 try{
  if(action==='history'){
   const token=await vault('meta_fb_page_access_token');const fb=await vault('meta_fb_page_id');const ig=await vault('meta_ig_user_id');
   if(!token) return json({error:'Meta connection unavailable'},409);
   const result:Record<string,unknown>={};
   if(fb)try{result.facebook=await api(`${fb}/published_posts?fields=id,message,created_time,attachments{media,url,subattachments}&since=${Math.floor(Date.now()/1000)-30*86400}&limit=100`,token);}catch(e){result.facebook_error=String(e);}
   if(ig)try{result.instagram=await api(`${ig}/media?fields=id,caption,media_url,timestamp,permalink&limit=100`,token);}catch(e){result.instagram_error=String(e);}
   return json(result);
  }
  if(action==='audit'){
   const {data:rows,error}=await sb.from('social_launch_posts').select('*').is('archived_at',null).eq('is_test',false).order('scheduled_for');if(error)throw error;
   const results=[];
   for(const p of (rows??[]) as Post[]){
    try{
     const im=await image(p.image_url);let flag:string|null=null;
     if(platforms(p.channel).includes('instagram')&&im.type!=='image/jpeg')flag='Instagram requires a JPEG; replace this PNG before publishing';
     const {error:hashError}=await sb.from('social_launch_posts').update({image_hash:im.hash,image_flag:flag}).eq('id',p.id);if(hashError)throw hashError;
     if(p.external_post_id){
      for(const platform of platforms(p.channel)){
       const aliases=platform==='facebook'?'(?:fb|facebook)': '(?:ig|instagram)';const match=p.external_post_id.match(new RegExp(`${aliases}:([^ ]+)`));
       if(!match)continue;
       const caption=platform==='instagram'?instagramVersion(render(p)):render(p);
       const {data:h}=await sb.rpc('social_caption_hash',{_c:caption});
       const {error:backfillError}=await sb.from('social_publish_ledger').upsert({post_id:p.id,platform,scheduled_for:p.scheduled_for,caption,content_hash:h,image_url:p.image_url,image_hash:im.hash,state:'posted',platform_post_id:match[1],confirmed_at:p.posted_at,created_at:p.posted_at,is_test:false},{onConflict:'post_id,platform',ignoreDuplicates:true});if(backfillError)throw backfillError;
      }
     }
     const {data:prior}=await sb.from('social_publish_ledger').select('platform').eq('image_hash',im.hash).eq('is_test',false).neq('post_id',p.id).gte('created_at',new Date(Date.now()-90*86400000).toISOString());
     if(prior?.some(h=>platforms(p.channel).includes(h.platform)))flag='Image already posted on this platform within 90 days';
     if(!p.posted_at)await sb.from('social_launch_posts').update({image_flag:flag}).eq('id',p.id);
     results.push({id:p.id,hash:im.hash,flag});
    }catch(e){const message=String(e);await sb.from('social_launch_posts').update({image_flag:message}).eq('id',p.id);results.push({id:p.id,error:message});}
   }
   return json({results});
  }
  if(action==='dry_run'){
   // Clone three real preview cards into isolated test rows. No provider calls.
   const {data:source,error}=await sb.from('social_launch_posts').select('*').is('archived_at',null).eq('is_test',false).eq('channel','meta_combined').eq('status','scheduled').gte('scheduled_for',new Date().toISOString()).order('scheduled_for').limit(3);if(error)throw error;
   if(source?.length!==3)return json({error:'Three upcoming cards required'},409);
   const timeline=[];const run=crypto.randomUUID();const start=Date.now();
   for(let n=0;n<4;n++){
    const original=source[n===3?0:n] as Post; const im=await image(original.image_url);const at=new Date(start+n*600000).toISOString();const caption=render(original);
    const {data:p,error:insertError}=await sb.from('social_launch_posts').insert({channel:'facebook',post_number:n+1,caption,template_copy:caption,image_url:original.image_url,image_hash:im.hash,scheduled_for:at,status:'scheduled',is_test:true,theme:`dry-run:${run}`}).select('id').single();if(insertError)throw insertError;
    const {data:r,error:reserveError}=await sb.rpc('social_reserve_publish',{_id:p.id,_platform:'facebook',_caption:caption,_image_hash:im.hash,_dry_run:true,_at:at});if(reserveError)throw reserveError;
    timeline.push({post_id:p.id,source_id:original.id,scheduled_for:at,caption,image_url:original.image_url,result:r});
    if(n<3)await sb.from('social_launch_posts').update({status:'posted'}).eq('id',p.id);
   }
   return json({run,timeline,no_provider_calls:true});
  }
  const {data:posts,error}=await sb.rpc('claim_due_social_posts',{_limit:1,_only:post_id??null});if(error)throw error;
  const results=[];
  for(const p of (posts??[]) as Post[]){
   try{
    const im=await image(p.image_url);const caption=render(p);if(/\{(?:LAUNCH|CONVERT)\}/.test(caption))throw new Error('Launch date missing');
    const token=await vault('meta_fb_page_access_token');if(!token)throw new Error('Meta connection unavailable');
    // Preflight every destination before publishing either one.
    const fb=platforms(p.channel).includes('facebook')?await vault('meta_fb_page_id'):null;
    const ig=platforms(p.channel).includes('instagram')?await vault('meta_ig_user_id'):null;
    if(platforms(p.channel).includes('facebook')&&!fb)throw new Error('Facebook page missing');
    if(platforms(p.channel).includes('instagram')&&(!ig||im.type!=='image/jpeg'))throw new Error(!ig?'Instagram account missing':'Instagram needs a JPEG image');
    for(const platform of platforms(p.channel)){
     const copy=platform==='instagram'?instagramVersion(caption):caption;
     const {data:r,error:reserveError}=await sb.rpc('social_reserve_publish',{_id:p.id,_platform:platform,_caption:copy,_image_hash:im.hash});if(reserveError)throw reserveError;
     const reservation=r as {ok:boolean;reason?:string;ledger_id:string;image_url:string;caption:string};
     if(!reservation.ok)throw new Error(reservation.reason??'Blocked');
     let id:string;
     try{
      if(platform==='facebook'){
       const response=await api(`${fb}/photos`,token,{url:reservation.image_url,caption:reservation.caption});id=response.post_id??response.id;
      }else{
       const container=await api(`${ig}/media`,token,{image_url:reservation.image_url,caption:reservation.caption});if(!container.id)throw new Error('Instagram container missing');
       let ready=false;
       for(let attempt=0;attempt<12;attempt++){
        const state=await api(`${container.id}?fields=status_code`,token);
        if(state.status_code==='FINISHED'){ready=true;break;}if(state.status_code==='ERROR')throw new Error('Instagram image processing failed');
        await new Promise(resolve=>setTimeout(resolve,2000));
       }
       if(!ready)throw new Error('Instagram image not ready; held for manual review');
       const response=await api(`${ig}/media_publish`,token,{creation_id:container.id});id=response.id;
      }
      if(!id)throw new Error('Platform did not return a post ID');
      const {error:confirmError}=await sb.rpc('social_confirm_publish',{_ledger:reservation.ledger_id,_platform_id:id});if(confirmError)throw confirmError;
     }catch(e){await sb.from('social_publish_ledger').update({state:'failed',error:String(e)}).eq('id',reservation.ledger_id).is('platform_post_id',null);throw e;}
    }
    await sb.from('social_launch_posts').update({status:'posted',publish_error:null}).eq('id',p.id);results.push({id:p.id,ok:true});
   }catch(e){const message=String(e);await sb.from('social_launch_posts').update({status:'blocked',publish_error:message}).eq('id',p.id);
    await writeAlert(sb as never,{level:'action',category:'operations',tier:'digest',title:'Social post blocked',body:message,action_url:'/admin/social',action_label:'Open social calendar',dedupe_key:`social_blocked:${p.id}`,context:{post_id:p.id}});results.push({id:p.id,ok:false,error:message});
   }
  }
  return json({results});
 }catch(e){return json({error:e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : String(e)},500);}
});
