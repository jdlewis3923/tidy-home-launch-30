import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
const schema=z.object({ledger_id:z.string().uuid(),callback_token:z.string().uuid(),post_id:z.string().min(1).max(255),post_url:z.string().url().max(1000)});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return json({error:'POST required'},405);
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return json({error:'Invalid delivery receipt'},400);
 const input=parsed.data; const link=new URL(input.post_url);
 if(link.protocol!=='https:' || !['linkedin.com','www.linkedin.com'].includes(link.hostname) || !/^\/(feed\/update\/urn:li:|posts\/)/.test(link.pathname))return json({error:'A LinkedIn post URL is required'},400);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return json({error:'Configuration missing'},500);
 const sb=createClient(url,key,{auth:{persistSession:false}});
 const {data:receipt,error}=await sb.from('social_delivery_tokens').select('ledger_id').eq('ledger_id',input.ledger_id).eq('token',input.callback_token).maybeSingle();
 if(error||!receipt)return json({error:'Invalid receipt authorization'},403);
 const {data:ledger}=await sb.from('social_publish_ledger').select('platform,state,platform_post_id,post_id').eq('id',input.ledger_id).single();
 if(!ledger||ledger.platform!=='linkedin')return json({error:'LinkedIn attempt missing'},404);
 if(ledger.state==='posted'&&ledger.platform_post_id!==input.post_id)return json({error:'Conflicting confirmation'},409);
 if(ledger.state!=='posted'){
  const {error:confirmError}=await sb.rpc('social_confirm_publish',{_ledger:input.ledger_id,_platform_id:input.post_id});if(confirmError)return json({error:confirmError.message},409);
 }
 const {error:saveError}=await sb.from('social_publish_ledger').update({post_url:input.post_url,error:null}).eq('id',input.ledger_id);if(saveError)return json({error:saveError.message},500);
 const {error:postError}=await sb.from('social_launch_posts').update({status:'posted',publish_error:null}).eq('id',ledger.post_id);if(postError)return json({error:postError.message},500);
 return json({confirmed:true});
});