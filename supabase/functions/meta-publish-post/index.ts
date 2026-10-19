// Retired: a legacy call must never reach a second platform publisher.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
Deno.serve(req => req.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : new Response(JSON.stringify({ skipped: true, reason: 'Legacy publisher retired; use the social calendar' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }));
