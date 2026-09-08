// Tidy — Pro visit actions: "on my way" and "complete visit".
//
// Every rule that matters is enforced HERE, server-side, not in the UI:
//   - the visit must be assigned to the calling Pro
//   - COI must be on file and unexpired (pro_coi_state.can_work)
//   - complete requires >= 1 before photo AND >= 1 after photo
//   - on_my_way stamps on_my_way_at and texts the customer via send-twilio-sms
//   - complete stamps completed_at, rolls the week's payout_weeks row and
//     increments the Pro's completed visit count
//
// Deliberately absent: any clock-in, elapsed time or location capture.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';
import { PRO_REPORTABLE_PAID_IN_FULL_REASONS } from '../_shared/pricing-canon.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

// 'blocked': the pro arrived and could not work through no fault of their own.
// Canon pays it in full. Only the two pro-reportable reasons are accepted here,
// a note is mandatory, and on_my_way must already have been sent — every case
// is written to admin_alerts for review.
const BodySchema = z.discriminatedUnion('action', [
  z.object({ visit_id: z.string().uuid(), action: z.literal('on_my_way') }),
  z.object({ visit_id: z.string().uuid(), action: z.literal('complete') }),
  z.object({
    visit_id: z.string().uuid(),
    action: z.literal('blocked'),
    reason: z.enum(PRO_REPORTABLE_PAID_IN_FULL_REASONS as [string, ...string[]]),
    note: z.string().trim().min(10).max(500),
  }),
]);

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const env = readEnv(REQUIRED_ENV);
  if (req.method === 'GET') {
    return jsonResponse({ ok: env.missing.length === 0, function: 'pro-visit-action', missing_env: env.missing });
  }
  if (env.missing.length) return jsonResponse({ ok: false, error: missingEnvError(env.missing) });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' });

  try {
    console.log('[pro-visit-action] entry');
    const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ ok: false, error: 'unauthorized' });
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return jsonResponse({ ok: false, error: 'unauthorized' });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' });
    const { visit_id, action } = parsed.data;

    const { data: visit } = await admin
      .from('visits')
      .select('id, assigned_pro_id, status, user_id, service_type, visit_pay_cents, contractor_pay_cents, scheduled_start, on_my_way_at, street, customer_first_name')
      .eq('id', visit_id)
      .maybeSingle();
    if (!visit || visit.assigned_pro_id !== uid) {
      return jsonResponse({ ok: false, error: 'visit_not_assigned_to_you' });
    }
    if (['complete', 'canceled', 'blocked', 'skipped'].includes(visit.status ?? '')) {
      return jsonResponse({ ok: false, error: 'visit_not_open', status: visit.status });
    }

    // COI gate — viewing is fine, working is not.
    const { data: coi } = await admin.rpc('pro_coi_state', { _pro: uid });
    const coiRow = Array.isArray(coi) ? coi[0] : coi;
    if (!coiRow?.can_work) {
      return jsonResponse({ ok: false, error: 'coi_blocked', coi_status: coiRow?.status ?? 'none' });
    }

    if (action === 'on_my_way') {
      await admin
        .from('visits')
        .update({ on_my_way_at: new Date().toISOString(), status: 'on_the_way' })
        .eq('id', visit_id);

      let sms: string = 'skipped_no_phone';
      const { data: profile } = await admin
        .from('profiles')
        .select('phone, first_name')
        .eq('user_id', visit.user_id)
        .maybeSingle();
      if (profile?.phone) {
        const to = profile.phone.startsWith('+') ? profile.phone : `+1${profile.phone.replace(/\D/g, '')}`;
        const res = await fetch(`${env.values.SUPABASE_URL}/functions/v1/send-twilio-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.values.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            to_phone_e164: to,
            body: 'Your Tidy Pro is on the way.',
            idempotency_key: `omw:${visit_id}`,
            template_name: 'pro_on_my_way',
            triggered_by: 'pro-visit-action',
          }),
        });
        const out = await res.json().catch(() => ({}));
        sms = out?.ok === false ? `sms_failed:${out?.error ?? 'unknown'}` : 'sent';
      }
      return jsonResponse({ ok: true, action, sms });
    }

    if (action === 'blocked') {
      if (!visit.on_my_way_at) return jsonResponse({ ok: false, error: 'on_my_way_required' });
      const { reason, note } = parsed.data;
      const { data: result, error: rpcErr } = await admin.rpc('mark_visit_paid_in_full', {
        _visit_id: visit_id,
        _reason: reason,
        _note: note,
        _actor: `pro:${uid}`,
      });
      if (rpcErr) return jsonResponse({ ok: false, error: rpcErr.message });
      const out = result as { visit_pay_cents?: number } | null;
      return jsonResponse({ ok: true, action, paid_in_full_reason: reason, visit_pay_cents: out?.visit_pay_cents ?? 0 });
    }

    // action === 'complete'
    const { count: before } = await admin
      .from('visit_photos')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visit_id)
      .eq('kind', 'before');
    const { count: after } = await admin
      .from('visit_photos')
      .select('id', { count: 'exact', head: true })
      .eq('visit_id', visit_id)
      .eq('kind', 'after');
    if (!before || !after) {
      return jsonResponse({
        ok: false,
        error: 'photos_required',
        before_photos: before ?? 0,
        after_photos: after ?? 0,
      });
    }

    // Pay = frozen Tier 1 base (contractor_pay_cents) + the uplift for the tier
    // this pro holds RIGHT NOW. The base never moves; the tier is the pro's.
    let pay = visit.visit_pay_cents ?? 0;
    if (visit.contractor_pay_cents != null) {
      const { data: resolved } = await admin.rpc('pro_tier_uplift_cents', {
        _base_cents: visit.contractor_pay_cents,
        _pro_uid: uid,
      });
      if (typeof resolved === 'number') pay = resolved;
    }

    const now = new Date();
    await admin
      .from('visits')
      .update({ completed_at: now.toISOString(), status: 'complete', visit_pay_cents: pay })
      .eq('id', visit_id);

    // Roll this Pro's payout week (Monday-Sunday, paid the following Friday).
    const { error: creditErr } = await admin.rpc('credit_payout_week', {
      _pro: uid,
      _at: visit.scheduled_start ?? now.toISOString(),
      _cents: pay,
    });
    if (creditErr) console.error('[pro-visit-action] payout credit failed', creditErr.message);

    const { data: applicant } = await admin
      .from('applicants')
      .select('id, completed_visits')
      .eq('contractor_id', uid)
      .maybeSingle();
    if (applicant) {
      await admin
        .from('applicants')
        .update({ completed_visits: (applicant.completed_visits ?? 0) + 1, last_visit_at: now.toISOString() })
        .eq('id', applicant.id);
    }

    return jsonResponse({ ok: true, action, visit_pay_cents: pay });
  } catch (e) {
    console.error('[pro-visit-action] failed', (e as Error).message);
    return jsonResponse({ ok: false, error: (e as Error).message });
  }
});
