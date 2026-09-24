import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — "You're all set" email. Fires once, the moment all five are true:
 * background clear, insurance verified, contract signed, intake submitted,
 * badge photo approved. Called by database triggers and by the steps that
 * complete an item. Safe to call repeatedly.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { loadFive } from '../_shared/pro-five.ts';
import { allSetEmail } from '../_shared/pro-emails.ts';
import { sendProEmail } from '../_shared/pro-send.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  // Database triggers call with the Vault service key; admins call with their session.
  if (!(await isCronAuthorized(req))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  }
  const body = await req.json().catch(() => ({}));
  const id = typeof body?.applicant_id === 'string' ? body.applicant_id : '';
  if (!id) return jsonResponse({ error: 'applicant_id required' }, 400);

  let rec;
  try { rec = await loadFive(admin, id); } catch { return jsonResponse({ error: 'not_found' }, 404); }
  if (rec.missing.length) return jsonResponse({ ok: true, action: 'not_ready', missing: rec.missing });
  if (!rec.applicant.email) return jsonResponse({ ok: false, error: 'no_email' }, 400);

  // Claim atomically so two triggers can never send twice.
  const { data: claimed } = await admin.from('applicants')
    .update({ all_set_sent_at: new Date().toISOString() })
    .eq('id', id).is('all_set_sent_at', null).select('id');
  if (!claimed?.length) return jsonResponse({ ok: true, action: 'already_sent' });

  const built = allSetEmail({
    first: rec.applicant.first_name ?? 'there',
    pro_number: rec.applicant.pro_number,
    service: rec.applicant.service,
    expected_delivery: rec.kit?.expected_delivery_date ?? null,
  });
  const res = await sendProEmail(admin, {
    applicantId: id, key: 'all_set', to: rec.applicant.email, name: rec.applicant.first_name ?? undefined,
    built, triggeredBy: 'pro-all-set',
  });
  if (!res.sent) await admin.from('applicants').update({ all_set_sent_at: null }).eq('id', id);
  return jsonResponse({ ok: res.sent, action: res.sent ? 'sent' : 'failed', reason: res.reason });
});
