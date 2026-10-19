import '../_shared/http.ts';
/**
 * candidate-text — admin texts a candidate from the Tidy number and the
 * message is logged on the candidate's timeline (kind 'message', outbound).
 * Body: { applicant_id, body }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });

function e164(raw: string): string | null {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
  if (!isAdmin) return jsonResponse({ error: 'forbidden' }, 403);

  const b = await req.json().catch(() => ({}));
  const id = String(b?.applicant_id ?? '');
  const text = String(b?.body ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || text.length < 1 || text.length > 1200) return jsonResponse({ error: 'invalid_input' }, 400);

  const { data: a } = await admin.from('applicants').select('phone').eq('id', id).maybeSingle();
  const to = e164(String(a?.phone ?? ''));
  if (!to) return jsonResponse({ error: 'no_phone' }, 400);

  const r = await fetch(`${URL_}/functions/v1/send-twilio-sms`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_phone_e164: to, body: text, idempotency_key: `cand-text-${id}-${Date.now()}`, template_name: 'candidate-admin-reply', triggered_by: 'candidate-text' }),
  });
  const d = await r.json().catch(() => ({}));
  const ok = r.ok && (d?.sent === true || d?.queued === true);
  await admin.from('contractor_stage_events').insert({
    applicant_id: id, kind: 'message', reason: ok ? 'Texted by Tidy' : 'Text failed to send',
    actor: u.user.id, metadata: { direction: 'outbound', text, twilio_sid: d?.message_sid ?? null, ok },
  });
  if (!ok) return jsonResponse({ error: 'send_failed', status: r.status, details: d }, 502);
  return jsonResponse({ ok: true, sid: d?.message_sid ?? null, queued: d?.queued === true });
});
