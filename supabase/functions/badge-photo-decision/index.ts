import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
/**
 * Tidy — admin decision on a badge photo.
 * POST { kit_id, decision: 'approve' | 'retake', reason? }
 * 'retake' sends ONE email with the chosen reason and the photo rules.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { badgePhotoEmail, PHOTO_RETAKE_REASONS, type RetakeReason } from '../_shared/pro-emails.ts';
import { sendProEmail } from '../_shared/pro-send.ts';
import { TIDY_SITE } from '../_shared/email-brand.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  const body = await req.json().catch(() => ({}));
  const kitId = typeof body?.kit_id === 'string' ? body.kit_id : '';
  const decision = body?.decision;
  if (!kitId || !['approve', 'retake'].includes(decision)) return jsonResponse({ error: 'invalid_request' }, 400);

  const { data: kit } = await admin.from('pro_kit').select('id, applicant_id, badge_photo_token, badge_photo_path').eq('id', kitId).maybeSingle();
  if (!kit) return jsonResponse({ error: 'not_found' }, 404);
  const now = new Date().toISOString();

  if (decision === 'approve') {
    await admin.from('pro_kit').update({ badge_photo_status: 'approved', badge_photo_reviewed_at: now, badge_photo_retake_reason: null }).eq('id', kitId);
    if (kit.applicant_id) {
      await admin.from('applicants').update({ badge_photo_url: kit.badge_photo_path }).eq('id', kit.applicant_id);
      await admin.from('onboarding_events').insert({ applicant_id: kit.applicant_id, event: 'badge_photo_approved', metadata: {} });
      await vendorFetch(`${URL_}/functions/v1/pro-all-set`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE}` },
        body: JSON.stringify({ applicant_id: kit.applicant_id }),
      }).catch(() => null);
    }
    return jsonResponse({ ok: true, status: 'approved' });
  }

  const reason = (typeof body.reason === 'string' && body.reason in PHOTO_RETAKE_REASONS ? body.reason : null) as RetakeReason | null;
  if (!reason) return jsonResponse({ error: 'reason_required' }, 400);
  const { data: a } = await admin.from('applicants').select('id, first_name, email').eq('id', kit.applicant_id).maybeSingle();
  if (!a?.email) return jsonResponse({ error: 'no_email' }, 400);
  const built = badgePhotoEmail(a.first_name ?? 'there', `${TIDY_SITE}/photo/${kit.badge_photo_token}`, 'both', reason);
  const res = await sendProEmail(admin, { applicantId: a.id, key: 'photo_retake', to: a.email, name: a.first_name ?? undefined, built, triggeredBy: auth.kind === 'admin' ? `admin:${auth.userId}` : 'service' });
  if (!res.sent) return jsonResponse({ ok: false, error: 'email_failed', reason: res.reason }, 502);
  await admin.from('pro_kit').update({ badge_photo_status: 'retake_requested', badge_photo_retake_reason: reason, badge_photo_reviewed_at: now }).eq('id', kitId);
  return jsonResponse({ ok: true, status: 'retake_requested', sent_to: a.email });
});
