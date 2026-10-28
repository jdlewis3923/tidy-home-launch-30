// One-off: publishes owner-approved (Oct 28) Spanish drafts for lifecycle templates. Admin only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import data from './data.json' with { type: 'json' };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: u } = await db.auth.getUser((req.headers.get('Authorization') ?? '').replace('Bearer ', ''));
  const { data: ok } = u?.user ? await db.rpc('has_role', { _user_id: u.user.id, _role: 'admin' }) : { data: false };
  if (!ok) return new Response('unauthorized', { status: 401, headers: corsHeaders });
  let n = 0;
  for (const x of data as any[]) {
    const patch: Record<string, unknown> = { body_es: x.body_es, es_reviewed: true };
    if (x.subject_es) patch.subject_es = x.subject_es;
    const { error } = await db.from('lifecycle_templates').update(patch).eq('key', x.key);
    if (!error) n++;
  }
  return new Response(JSON.stringify({ updated: n }), { headers: corsHeaders });
});
