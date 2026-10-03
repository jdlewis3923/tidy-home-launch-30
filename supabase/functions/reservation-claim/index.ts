// Public: the personal Convert link. The long random token is the authorization;
// it returns only that reservation's own quote and contact details.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const limited = await enforceRateLimit(req, { bucket: 'reservation-claim', limit: 30, windowSeconds: 3600 });
  if (limited) return limited;
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const t = String(new URL(req.url).searchParams.get('t') ?? body.t ?? '');
  if (!/^[a-f0-9]{48}$/.test(t)) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  const { data: r } = await admin.from('reservations')
    .select('id, status, first_name, last_name, email, phone, sms_consent, services, waitlist_services, quote, street, city, zip, preferred_day, preferred_time, assigned_day, assigned_window, assigned_pro_first_name, invite_token')
    .eq('invite_token', t).maybeSingle();
  if (!r || r.invite_token !== t) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (r.status === 'canceled') return jsonResponse({ ok: false, error: 'canceled' }, 410);
  const { invite_token: _omit, ...safe } = r;
  return jsonResponse({ ok: true, reservation: safe });
});
