import Stripe from 'https://esm.sh/stripe@17.5.0?target=deno';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {status,headers:{...corsHeaders,'Content-Type':'application/json'}});
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok',{headers:corsHeaders});
  if (req.method !== 'POST') return json({error:'method_not_allowed'},405);
  const url = Deno.env.get('SUPABASE_URL'); const role = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !role) return json({error:'configuration_missing'},503);
  const admin = createClient(url,role,{auth:{persistSession:false}});
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i,'');
  const {data:user,error} = await admin.auth.getUser(token);
  if (error || !user.user) return json({error:'unauthorized'},401);
  const {data:allowed} = await admin.rpc('has_role',{_user_id:user.user.id,_role:'admin'});
  if (!allowed) return json({error:'forbidden'},403);
  const key = Deno.env.get('STRIPE_TEST_SECRET_KEY');
  if (!key?.startsWith('sk_test_')) return json({error:'test_stripe_key_unavailable'},503);
  const stripe = new Stripe(key,{apiVersion:'2024-12-18.acacia'});
  try {
    const existing = await stripe.products.search({query:"metadata['tidy_addon_key']:'deep_clean'",limit:1});
    const product = existing.data[0] ?? await stripe.products.create({name:'Deep Clean',metadata:{tidy_addon_key:'deep_clean'}},{idempotencyKey:'tidy-deep-clean-product-test-v1'});
    const results = [];
    for (const size of [1,2,3,4,5]) {
      const {data:q,error:qError} = await admin.rpc('deep_clean_catalog_quote',{_addon_key:'deep_clean',_size:size,_quarterly:false});
      if (qError || !q) throw new Error(qError?.message ?? 'quote_unavailable');
      const found = await stripe.prices.list({lookup_keys:[q.lookup_key],active:true,limit:1});
      const price = found.data[0] ?? await stripe.prices.create({product:product.id,currency:'usd',unit_amount:q.price_cents,lookup_key:q.lookup_key,nickname:q.display_name,metadata:{addon_key:'deep_clean',size:String(size),contractor_pay:String(q.price_cents*0.4/100),added_minutes:String(q.added_minutes)}},{idempotencyKey:`tidy-${q.lookup_key}-test-v1`});
      if (price.livemode || price.unit_amount !== q.price_cents) throw new Error('test_price_mismatch');
      results.push({size,price_cents:price.unit_amount,lookup_key:price.lookup_key,livemode:price.livemode});
    }
    return json({ok:true,mode:'test',prices:results});
  } catch(e) {return json({error:e instanceof Error?e.message:'failed'},500);}
});