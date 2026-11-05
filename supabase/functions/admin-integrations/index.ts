import '../_shared/http.ts';
import {handleCors,jsonResponse} from '../_shared/cors.ts';
import {requireServiceOrAdmin} from '../_shared/admin-auth.ts';
import {admin,gql} from '../_shared/jobber.ts';

Deno.serve(async(req)=>{
 const pre=handleCors(req);if(pre)return pre;const auth=await requireServiceOrAdmin(req);if(!auth.ok)return jsonResponse({error:auth.error},auth.status);
 const db=admin();
 const probe=async(name:string,url:string,key:string,headers:Record<string,string>)=>{if(!key)return {name,connected:false,detail:'Not connected',checked_at:new Date().toISOString()};try{const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});const connected=r.ok;await r.text();return {name,connected,detail:connected?'Connection verified':`Connection check failed (${r.status})`,checked_at:new Date().toISOString()};}catch{return {name,connected:false,detail:'Connection check timed out',checked_at:new Date().toISOString()};}};
 const ct=Deno.env.get('CONNECTEAM_API_KEY')??'',stripe=Deno.env.get('STRIPE_SECRET_KEY')??'',brevo=Deno.env.get('BREVO_API_KEY')??'';
 const [jobber,connecteam,stripeStatus,brevoStatus,last]=await Promise.all([
  (async()=>{try{await gql(db,'{account{id}}');await db.from('integration_logs').insert({source:'jobber',event:'connection_check',status:'success'});return {name:'Jobber',connected:true,detail:'Connection verified',checked_at:new Date().toISOString()};}catch{return {name:'Jobber',connected:false,detail:'Sign in again to reconnect Jobber',checked_at:new Date().toISOString()};}})(),
  probe('Connecteam','https://api.connecteam.com/scheduler/v1/schedulers/20735999',ct,{'X-API-KEY':ct}),
  probe('Stripe','https://api.stripe.com/v1/account',stripe,{Authorization:`Bearer ${stripe}`}),
  probe('Brevo','https://api.brevo.com/v3/account',brevo,{'api-key':brevo}),
  db.from('integration_logs').select('created_at').eq('source','jobber').eq('status','success').order('created_at',{ascending:false}).limit(1).maybeSingle()
 ]);
 return jsonResponse({ok:true,services:[{...jobber,last_success_at:jobber.connected?jobber.checked_at:last.data?.created_at??null},connecteam,{name:'QuickBooks',connected:false,detail:'Not connected · contractor CSV export is available in Pro Pay',checked_at:new Date().toISOString()},stripeStatus,brevoStatus]});
});