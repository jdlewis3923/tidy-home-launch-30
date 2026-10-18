// HIRING v5 dry-run — simulate an inbound candidate reply without Twilio.
// Admin-only. Runs the exact same keyword handler as the live webhook.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { handleHiringInbound } from '../_shared/hiring-inbound.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData } = await admin.auth.getUser(auth.slice(7).trim());
  const uid = userData?.user?.id;
  if (!uid) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: role } = await admin.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
  if (!role) return jsonResponse({ error: 'forbidden' }, 403);

  let body: { applicant_id?: string; body?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: 'invalid_json' }, 400); }
  if (!body.applicant_id || !body.body) return jsonResponse({ error: 'applicant_id and body required' }, 400);

  const { data: applicant } = await admin.from('applicants').select('id, phone').eq('id', body.applicant_id).maybeSingle();
  if (!applicant?.phone) return jsonResponse({ error: 'candidate_has_no_phone' }, 404);

  const handled = await handleHiringInbound(admin, applicant.phone, body.body, `sim-${Date.now()}`);
  return jsonResponse({ ok: true, handled });
});
