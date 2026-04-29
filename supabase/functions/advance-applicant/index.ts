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

  const fullName = `${row.first_name} ${row.last_name}`;
  queueMicrotask(async () => {
    const html = brandedEmailHtml({
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
      subject: `${SUBJECTS[action]}: ${fullName}`, htmlContent: html,
    });
  });

  return jsonResponse({ ok: true, id: row.id, current_stage: row.current_stage, bg_check_status: row.bg_check_status });
});
