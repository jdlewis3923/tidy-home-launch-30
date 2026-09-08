// Tidy — temporary proof harness for the Pro notification path.
// Service-role only. Delete after the Phase 5 proof run.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { notifyPro } from '../_shared/pro-notify.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if ((req.headers.get('Authorization') ?? '') !== `Bearer ${KEY}`) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }
  const body = await req.json().catch(() => ({}));
  const admin = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });
  const result = await notifyPro(admin, {
    contractor_id: body.contractor_id,
    kind: body.kind ?? 'visit_tomorrow',
    title: body.title ?? 'Proof notification',
    body: body.body ?? 'Phase 5 proof run.',
    url: '/pro/schedule',
    idempotency_key: body.idempotency_key,
  });
  return jsonResponse({ ok: true, result });
});
