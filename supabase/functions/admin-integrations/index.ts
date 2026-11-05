import '../_shared/http.ts';
import {handleCors,jsonResponse} from '../_shared/cors.ts';
import {requireServiceOrAdmin} from '../_shared/admin-auth.ts';
import {admin,gql} from '../_shared/jobber.ts';
import {stripeSecretKey} from '../_shared/stripe-mode.ts';

Deno.serve(async(req)=>{
 const pre=handleCors(req);if(pre)return pre;const auth=await requireServiceOrAdmin(req);if(!auth.ok)return jsonResponse({error:auth.error},auth.status);
 const db=admin();
 const force=!!(await req.json().catch(()=>({})))?.force;
 // Connecteam rate-limits: probe it on demand (Refresh) or at most once an hour.
 const {data:cacheRow}=await db.from('app_settings').select('value').eq('key','integration_health_connecteam').maybeSingle();
 const cached=cacheRow?.value as any;const fresh=!force&&cached?.checked_at&&Date.now()-Date.parse(cached.checked_at)<3600000&&cached.connected;
 const probe=async(name:string,url:string,key:string,headers:Record<string,string>)=>{if(!key)return {name,connected:false,detail:'Not connected',checked_at:new Date().toISOString()};try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});const connected=r.ok;await r.text();return {name,connected,detail:connected?'Connection verified':`Connection check failed (${r.status})`,checked_at:new Date().toISOString()};}catch{return {name,connected:false,detail:'Connection check timed out',checked_at:new Date().toISOString()};}};
 const ct=Deno.env.get('CONNECTEAM_API_KEY')??'',stripe=stripeSecretKey()??'',brevo=Deno.env.get('BREVO_API_KEY')??'',lovable=Deno.env.get('LOVABLE_API_KEY')??'';
 const [jobber,connecteam,stripeStatus,brevoStatus,last]=await Promise.all([
  (async()=>{try{await gql(db,'{account{id}}');await db.from('integration_logs').insert({source:'jobber',event:'connection_check',status:'success'});return {name:'Jobber',connected:true,detail:'Connection verified',checked_at:new Date().toISOString()};}catch{return {name:'Jobber',connected:false,detail:'Sign in again to reconnect Jobber',checked_at:new Date().toISOString()};}})(),
  fresh?Promise.resolve({...cached,detail:`${cached.detail} · checked ${new Date(cached.checked_at).toLocaleTimeString('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'})}`}):probe('Connecteam',`https://api.connecteam.com/scheduler/v1/schedulers/20735999/shifts?startTime=${Math.floor(Date.now()/1000)}&endTime=${Math.floor(Date.now()/1000)+86400}&limit=1`,ct,{'X-API-KEY':ct}),
  probe('Stripe','https://api.stripe.com/v1/customers?limit=1',stripe,{Authorization:`Bearer ${stripe}`}),
  probe('Brevo','https://connector-gateway.lovable.dev/brevo/account',brevo&&lovable?brevo:'',{Authorization:`Bearer ${lovable}`,'X-Connection-Api-Key':brevo}),
  db.from('integration_logs').select('created_at').eq('source','jobber').eq('status','success').order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);
 if(!fresh)await db.from('app_settings').upsert({key:'integration_health_connecteam',value:connecteam},{onConflict:'key'});
 return jsonResponse({ok:true,services:[{...jobber,last_success_at:jobber.connected?jobber.checked_at:last.data?.created_at??null},connecteam,{name:'QuickBooks',connected:true,handled:true,detail:'Handled by daily check · vendors are created from Pro pay profiles; CSV export stays in Pro Pay',checked_at:new Date().toISOString()},stripeStatus,brevoStatus]});
});