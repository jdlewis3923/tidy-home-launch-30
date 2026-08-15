// insurance-decision — ADMIN ONLY.
//
// Approve / request update / reject / waive a contractor's General Liability
// coverage. Records who acted and when, requires an internal reason for
// update+reject+waive, mirrors the status onto applicants.insurance_status,
// writes an insurance_audit_log row and an onboarding_events row. Best-effort
// Brevo notice via the existing gateway. Internal reasons are never surfaced to
// contractors by this function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const Body = z.object({
  insurance_id: z.string().uuid(),
  decision: z.enum(['approve', 'request_update', 'reject', 'waive']),
  reason: z.string().trim().max(2000).optional(),
});

const STATUS: Record<string, string> = {
  approve: 'verified',
  request_update: 'update_requested',
  reject: 'rejected',
  waive: 'waived',
};

async function fireBrevo(templateKey: string, to: { email: string; name: string }, params: Record<string, unknown>) {
  if (!LOVABLE_API_KEY || !BREVO_API_KEY) return;
  const { data: setting } = await admin.from('app_settings').select('value').eq('key', templateKey).maybeSingle();
  const raw = setting?.value as any;
  const templateId = Number(raw?.id ?? raw ?? 0);
  if (!templateId) return;
  await fetch('https://connector-gateway.lovable.dev/brevo/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': BREVO_API_KEY,
    },
    body: JSON.stringify({ templateId, to: [to], params }),
  }).catch((e) => console.error('[insurance-decision] brevo failed', e));
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
  if (!isAdmin) return jsonResponse({ error: 'forbidden' }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);
  const { insurance_id, decision } = parsed.data;
  const reason = parsed.data.reason ?? '';

  if (decision !== 'approve' && reason.length < 3) {
    return jsonResponse({ error: 'reason_required' }, 400);
  }

  const { data: rec } = await admin
    .from('contractor_insurance')
    .select('id, applicant_id, contractor_id, expiration_date, carrier_name, verification_status')
    .eq('id', insurance_id)
    .maybeSingle();
  if (!rec) return jsonResponse({ error: 'not_found' }, 404);

  const status = STATUS[decision];
  const now = new Date().toISOString();

  const { error: updErr } = await admin
    .from('contractor_insurance')
    .update({
      verification_status: status,
      verified_at: decision === 'approve' ? now : null,
      verified_by: u.user.id,
      verification_method: decision === 'waive' ? 'admin_waiver' : 'manual_admin',
      rejection_reason: decision === 'approve' ? null : reason,
      waived_reason: decision === 'waive' ? reason : null,
      waived_by: decision === 'waive' ? u.user.id : null,
      waived_at: decision === 'waive' ? now : null,
      last_checked_at: now,
    })
    .eq('id', insurance_id);
  if (updErr) return jsonResponse({ error: 'update_failed', details: updErr.message }, 500);

  await admin.from('insurance_audit_log').insert({
    insurance_id: rec.id,
    applicant_id: rec.applicant_id,
    contractor_id: rec.contractor_id,
    action: decision,
    from_status: rec.verification_status,
    to_status: status,
    reason: reason || null,
    performed_by: u.user.id,
    metadata: { carrier_name: rec.carrier_name ?? null },
  });

  if (rec.applicant_id) {
    await admin
      .from('applicants')
      .update({
        insurance_status: status,
        insurance_expires_at: decision === 'approve' ? rec.expiration_date : null,
      })
      .eq('id', rec.applicant_id);

    await admin.from('onboarding_events').insert({
      applicant_id: rec.applicant_id,
      event:
        decision === 'approve' ? 'insurance_verified'
        : decision === 'reject' ? 'insurance_rejected'
        : decision === 'waive' ? 'insurance_waived'
        : 'insurance_update_requested',
      metadata: { acted_by: u.user.id, carrier_name: rec.carrier_name ?? null },
    });

    const { data: a } = await admin
      .from('applicants')
      .select('email, first_name, last_name')
      .eq('id', rec.applicant_id)
      .maybeSingle();
    // Waivers are internal — no contractor-facing email, no internal reason shared.
    if (a?.email && decision !== 'waive') {
      const key = decision === 'approve'
        ? 'brevo_template_insurance_verified'
        : decision === 'reject'
        ? 'brevo_template_insurance_rejected'
        : 'brevo_template_insurance_update_requested';
      await fireBrevo(key, { email: a.email, name: `${a.first_name} ${a.last_name}` }, {
        first_name: a.first_name,
        reason: decision === 'approve' ? null : reason,
        expiration_date: rec.expiration_date,
      });
    }
  }

  return jsonResponse({ ok: true, verification_status: status });
});
