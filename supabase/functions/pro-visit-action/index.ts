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

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

const BodySchema = z.object({
  visit_id: z.string().uuid(),
  action: z.enum(['on_my_way', 'complete']),
});

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  const diff = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

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
      .select('id, assigned_pro_id, status, user_id, service_type, visit_pay_cents, scheduled_start, street, customer_first_name')
      .eq('id', visit_id)
      .maybeSingle();
    if (!visit || visit.assigned_pro_id !== uid) {
      return jsonResponse({ ok: false, error: 'visit_not_assigned_to_you' });
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

    const now = new Date();
    await admin
      .from('visits')
      .update({ completed_at: now.toISOString(), status: 'complete' })
      .eq('id', visit_id);

    // Roll this Pro's payout week (Monday-Sunday, paid the following Friday).
    const start = mondayOf(visit.scheduled_start ? new Date(visit.scheduled_start) : now);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const friday = new Date(start);
    friday.setUTCDate(friday.getUTCDate() + 11);
    const pay = visit.visit_pay_cents ?? 0;

    const { data: week } = await admin
      .from('payout_weeks')
      .select('id, visit_pay_cents')
      .eq('pro_id', uid)
      .eq('week_start', iso(start))
      .maybeSingle();
    if (week) {
      await admin
        .from('payout_weeks')
        .update({ visit_pay_cents: (week.visit_pay_cents ?? 0) + pay })
        .eq('id', week.id);
    } else {
      await admin.from('payout_weeks').insert({
        pro_id: uid,
        week_start: iso(start),
        week_end: iso(end),
        payout_date: iso(friday),
        status: 'pending',
        visit_pay_cents: pay,
      });
    }

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
