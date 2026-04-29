// Tidy — Advance Applicant (admin-only)
//
// Single endpoint to move an applicant through the hiring pipeline.
// Body: { applicant_id: uuid, action: string, notes?: string }
//
// Actions:
//   clear              → bg_status='clear',    current_stage='interview_pending'
//   consider           → bg_status='consider', current_stage='background_check_review' (notes required)
//   fail               → bg_status='fail',     current_stage='rejected'
//   schedule_interview → current_stage='interview_pending'
//   send_offer         → current_stage='offer_sent'
//   send_contract      → current_stage='contract_signed'
//   mark_demo_passed   → current_stage='demo_passed'
//   activate           → current_stage='active'
//   reject             → current_stage='rejected'
//
// Triggers a Brevo notification email to admin@jointidy.co for each transition.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ACTIONS = [
  'clear', 'consider', 'fail',
  'schedule_interview', 'send_offer', 'send_contract',
  'mark_demo_passed', 'activate', 'reject',
] as const;

const Body = z.object({
  applicant_id: z.string().uuid(),
  action: z.enum(ACTIONS),
  notes: z.string().max(2000).optional(),
});

type Action = (typeof ACTIONS)[number];

function applyTransition(action: Action) {
  const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
  switch (action) {
    case 'clear':
      u.bg_check_status = 'clear';
      u.bg_check_provider = 'manual';
      u.bg_check_completed_at = new Date().toISOString();
      u.current_stage = 'interview_pending';
      break;
    case 'consider':
      u.bg_check_status = 'consider';
      u.bg_check_provider = 'manual';
      u.current_stage = 'background_check_review';
      break;
    case 'fail':
      u.bg_check_status = 'fail';
      u.bg_check_provider = 'manual';
      u.bg_check_completed_at = new Date().toISOString();
      u.current_stage = 'rejected';
      u.rejected_at = new Date().toISOString();
      u.rejection_reason = 'Background check failed';
      break;
    case 'schedule_interview': u.current_stage = 'interview_pending'; break;
    case 'send_offer':         u.current_stage = 'offer_sent'; break;
    case 'send_contract':      u.current_stage = 'contract_signed'; break;
    case 'mark_demo_passed':   u.current_stage = 'demo_passed'; break;
    case 'activate':           u.current_stage = 'active'; break;
    case 'reject':
      u.current_stage = 'rejected';
      u.rejected_at = new Date().toISOString();
      break;
  }
  return u;
}

const SUBJECTS: Record<Action, string> = {
  clear: 'Background check CLEARED',
  consider: 'Background check needs review',
  fail: 'Background check FAILED — applicant rejected',
  schedule_interview: 'Interview scheduled',
  send_offer: 'Offer sent',
  send_contract: 'Contract sent for signature',
  mark_demo_passed: 'Demo passed',
  activate: 'Contractor activated',
  reject: 'Applicant rejected',
};

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // AuthN: signed-in admin only.
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userRes } = await userClient.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
  if (!roleRow) return jsonResponse({ error: 'forbidden' }, 403);

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { applicant_id, action, notes } = parsed.data;

  if (action === 'consider' && !notes) {
    return jsonResponse({ error: 'notes_required_for_consider' }, 400);
  }

  const update = applyTransition(action);
  if (notes) update.bg_check_notes = notes;

  const { data: row, error } = await admin
    .from('applicants').update(update).eq('id', applicant_id)
    .select('id, first_name, last_name, email, service, current_stage, bg_check_status').single();
  if (error || !row) {
    console.error('[advance-applicant] update failed', error);
    return jsonResponse({ error: 'update_failed', details: error?.message }, 500);
  }

  // Per-action Brevo template tag + applicant-facing copy.
  const TEMPLATE_TAG: Record<Action, string> = {
    clear: 'applicant-bg-clear',
    consider: 'applicant-bg-consider',
    fail: 'applicant-rejected',
    schedule_interview: 'applicant-interview-scheduled',
    send_offer: 'applicant-offer',
    send_contract: 'applicant-contract-sent',
    mark_demo_passed: 'applicant-demo-passed',
    activate: 'applicant-activated',
    reject: 'applicant-rejected',
  };

  const APPLICANT_COPY: Record<Action, { subject: string; body: string }> = {
    clear: { subject: 'Your background check is clear', body: `<p>Hi ${row.first_name},</p><p>Great news — your background check came back clear. We'll reach out shortly to schedule your interview.</p>` },
    consider: { subject: 'Quick question about your application', body: `<p>Hi ${row.first_name},</p><p>Your background check came back with something we'd like to chat about. Someone from Tidy will reach out shortly.</p>` },
    fail: { subject: 'Your Tidy application', body: `<p>Hi ${row.first_name},</p><p>Thanks for applying. After reviewing your background check, we're unable to move forward at this time.</p>` },
    schedule_interview: { subject: 'Schedule your Tidy interview', body: `<p>Hi ${row.first_name},</p><p>Pick a time that works for you: <a href="https://calendly.com/jointidy/interview">Book your interview</a>.</p>` },
    send_offer: { subject: 'Your Tidy offer', body: `<p>Hi ${row.first_name},</p><p>We'd love to have you on the team. Your offer details are attached.</p>` },
    send_contract: { subject: 'Sign your Tidy contract', body: `<p>Hi ${row.first_name},</p><p>Your contract is ready — check your email for the HelloSign request.</p>` },
    mark_demo_passed: { subject: 'You passed your Tidy demo', body: `<p>Hi ${row.first_name},</p><p>Nice work on the demo. We're moving you to activation now.</p>` },
    activate: { subject: 'Welcome to Tidy', body: `<p>Hi ${row.first_name},</p><p>You're activated. Your onboarding packet is attached. Welcome aboard.</p>` },
    reject: { subject: 'Your Tidy application', body: `<p>Hi ${row.first_name},</p><p>Thanks for applying. We're unable to move forward at this time.</p>` },
  };

  const tag = TEMPLATE_TAG[action];
  const applicantCopy = APPLICANT_COPY[action];

  queueMicrotask(async () => {
    // 1. Email to applicant
    const applicantHtml = brandedEmailHtml({
      heading: applicantCopy.subject,
      bodyHtml: applicantCopy.body,
    });
    await sendBrevoEmail({
      toEmail: row.email, toName: fullName,
      subject: applicantCopy.subject, htmlContent: applicantHtml,
      tags: [tag],
    }).catch((e) => console.error('[advance] applicant email failed', e));

    // 2. Admin alert
    const adminHtml = brandedEmailHtml({
      heading: SUBJECTS[action],
      bodyHtml: `
        <p><strong>${fullName}</strong> — ${row.service ?? 'unknown'} applicant</p>
        <ul style="padding-left:18px">
          <li>Stage: ${row.current_stage}</li>
          <li>BG status: ${row.bg_check_status ?? '—'}</li>
          <li>Action: ${action}</li>
          ${notes ? `<li>Notes: ${notes}</li>` : ''}
        </ul>
      `,
      ctaUrl: 'https://jointidy.co/admin/applicants',
      ctaLabel: 'Open pipeline',
    });
    await sendBrevoEmail({
      toEmail: 'admin@jointidy.co', toName: 'Justin',
      subject: `${SUBJECTS[action]}: ${fullName}`, htmlContent: adminHtml,
      tags: [`admin-${tag}`],
    }).catch((e) => console.error('[advance] admin email failed', e));
  });

  return jsonResponse({ ok: true, id: row.id, current_stage: row.current_stage, bg_check_status: row.bg_check_status });
});
