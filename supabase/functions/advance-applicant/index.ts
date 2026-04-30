// Tidy — Advance Applicant (admin-only)
//
// Single endpoint to move an applicant through the hiring pipeline.
// Body: { applicant_id: uuid, action: string, notes?: string }
//
// On every transition we:
//   1. UPDATE applicants row (stage + bg_check fields).
//   2. INSERT onboarding_events row (applicant_id, event, metadata).
//   3. Pull role-specific PDF(s) from company_documents → tidy-docs bucket
//      → signed URL → attached to Brevo email.
//   4. Send Brevo email to applicant (with attachment when relevant).
//   5. Send Brevo admin alert.
//   6. For 'activate', also enqueue a stripe_connect_pending row.
//
// TODO(HelloSign): When Justin provides HELLOSIGN_API_KEY, replace the
// 'send_offer' / 'send_contract' attachment-only flow with a real HelloSign
// signature request via the HelloSign API (templates + signer).
// TODO(Stripe Connect): When STRIPE_SECRET_KEY for Connect is wired, replace
// the stripe_connect_pending stub with a real Stripe Accounts API call and
// store the returned account.id + onboarding link.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, brandedEmailHtml, type BrevoAttachment } from '../_shared/notifyJustin.ts';

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
type Role = 'cleaning' | 'lawn' | 'detail' | string;

// Map applicant.service → canonical role bucket for PDF lookup.
function roleKey(service: string | null | undefined): Role {
  const s = (service ?? '').toLowerCase();
  if (s.includes('lawn')) return 'lawn';
  if (s.includes('detail') || s.includes('car')) return 'detail';
  return 'cleaning';
}

// Map an action+role → list of canonical filenames to attach.
function filenamesFor(action: Action, role: Role): string[] {
  const onboardingPacket = {
    cleaning: '12_OnboardingPacket_Cleaning.pdf',
    lawn:     '13_OnboardingPacket_Lawn.pdf',
    detail:   '14_OnboardingPacket_Detail.pdf',
  } as const;
  const contract = {
    cleaning: '15_HelloSign_Contract_Cleaning.pdf',
    lawn:     '16_HelloSign_Contract_Lawn.pdf',
    detail:   '17_HelloSign_Contract_Detail.pdf',
  } as const;
  switch (action) {
    case 'send_offer':       return ['11_OfferLetter_Template.pdf'];
    case 'send_contract':    return [contract[role as keyof typeof contract] ?? contract.cleaning];
    case 'mark_demo_passed': return [onboardingPacket[role as keyof typeof onboardingPacket] ?? onboardingPacket.cleaning];
    case 'activate':         return [onboardingPacket[role as keyof typeof onboardingPacket] ?? onboardingPacket.cleaning];
    default:                 return [];
  }
}

// Pull files from company_documents → signed URL on tidy-docs bucket.
// Returns Brevo-shaped attachments. Skips files whose storage_path is still
// `pending/...` (no real upload yet) so we don't send 404 links.
async function buildAttachments(filenames: string[]): Promise<BrevoAttachment[]> {
  if (!filenames.length) return [];
  const { data: rows } = await admin
    .from('company_documents')
    .select('filename, storage_path')
    .in('filename', filenames)
    .is('archived_at', null);
  const out: BrevoAttachment[] = [];
  for (const row of rows ?? []) {
    if (!row.storage_path || row.storage_path.startsWith('pending/')) {
      console.warn('[advance] skipping un-uploaded doc', row.filename);
      continue;
    }
    const { data: signed, error } = await admin.storage
      .from('tidy-docs').createSignedUrl(row.storage_path, 60 * 60 * 24 * 7); // 7d
    if (error || !signed?.signedUrl) {
      console.warn('[advance] sign failed', row.filename, error?.message);
      continue;
    }
    out.push({ url: signed.signedUrl, name: row.filename });
  }
  return out;
}

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

const CALENDLY_URL = 'https://calendly.com/jointidy/interview';
const LOGIN_URL_PLACEHOLDER = 'https://jointidy.co/auth/login'; // TODO swap when contractor login is live

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // AuthN: signed-in admin OR service-role bypass (for E2E + internal calls).
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
  const token = auth.replace('Bearer ', '').trim();

  let userId: string | null = null;
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    // Service-role bypass — used by E2E test runner / internal pipelines.
    userId = '00000000-0000-0000-0000-000000000000';
    console.log('[advance-applicant] service-role bypass');
  } else {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    userId = userRes?.user?.id ?? null;
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) return jsonResponse({ error: 'forbidden' }, 403);
  }

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
  const role = roleKey(row.service);

  // Insert onboarding_events row (best-effort, but we do await — it's the audit trail).
  const eventInsert = await admin.from('onboarding_events').insert({
    applicant_id: row.id,
    event: action,
    metadata: {
      stage: row.current_stage,
      bg_check_status: row.bg_check_status,
      role,
      notes: notes ?? null,
      triggered_by: userId,
    },
  });
  if (eventInsert.error) console.error('[advance] onboarding_events insert failed', eventInsert.error);

  // Stripe Connect Express stub on activation.
  // TODO: replace with real Stripe Connect API call (accounts.create + accountLinks.create)
  // once STRIPE_SECRET_KEY for Connect is provisioned.
  if (action === 'activate') {
    const { error: stripeErr } = await admin.from('stripe_connect_pending').insert({
      applicant_id: row.id,
      role,
      status: 'pending_api_call',
    });
    if (stripeErr) console.error('[advance] stripe_connect_pending insert failed', stripeErr);
  }

  // Build attachments from documents → signed URLs.
  const filenames = filenamesFor(action, role);
  const attachments = await buildAttachments(filenames);

  // Per-action applicant-facing copy.
  const APPLICANT_COPY: Record<Action, { subject: string; body: string }> = {
    clear: { subject: 'Your background check is clear', body: `<p>Hi ${row.first_name},</p><p>Great news — your background check came back clear. We'll reach out shortly to schedule your interview.</p>` },
    consider: { subject: 'Quick question about your application', body: `<p>Hi ${row.first_name},</p><p>Your background check came back with something we'd like to chat about. Someone from Tidy will reach out shortly.</p>` },
    fail: { subject: 'Your Tidy application', body: `<p>Hi ${row.first_name},</p><p>Thanks for applying. After reviewing your background check, we're unable to move forward at this time.</p>` },
    schedule_interview: { subject: 'Schedule your Tidy interview', body: `<p>Hi ${row.first_name},</p><p>Pick a time that works for you: <a href="${CALENDLY_URL}">Book your interview</a>.</p>` },
    send_offer: { subject: 'Your Tidy offer', body: `<p>Hi ${row.first_name},</p><p>We'd love to have you on the team. Your offer letter is attached.</p><p>Next step: pick a time to chat and sign — <a href="${CALENDLY_URL}">book here</a>.</p><!-- TODO(HelloSign): replace this with a HelloSign signature request via API --><p style="color:#64748b;font-size:13px">— The Tidy team</p>` },
    send_contract: { subject: 'Sign your Tidy contract', body: `<p>Hi ${row.first_name},</p><p>Your contract is attached. Please review and sign.</p><!-- TODO(HelloSign): replace attached PDF with a HelloSign signature request once API key is wired --><p style="color:#64748b;font-size:13px">— The Tidy team</p>` },
    mark_demo_passed: { subject: 'You passed your Tidy demo 🎉', body: `<p>Hi ${row.first_name},</p><p>Nice work on the demo. Your onboarding packet is attached — review it before your first job.</p>` },
    activate: { subject: 'Welcome to Tidy', body: `<p>Hi ${row.first_name},</p><p>You're activated and ready to take jobs. Your onboarding packet is attached.</p><p>Log in to your contractor portal: <a href="${LOGIN_URL_PLACEHOLDER}">${LOGIN_URL_PLACEHOLDER}</a></p>` },
    reject: { subject: 'Your Tidy application', body: `<p>Hi ${row.first_name},</p><p>Thanks for taking the time to apply to Tidy. After review, we're not able to move forward right now — we wish you the best.</p>` },
  };

  const tag = TEMPLATE_TAG[action];
  const applicantCopy = APPLICANT_COPY[action];

  queueMicrotask(async () => {
    const applicantHtml = brandedEmailHtml({
      heading: applicantCopy.subject,
      bodyHtml: applicantCopy.body,
    });
    await sendBrevoEmail({
      toEmail: row.email, toName: fullName,
      subject: applicantCopy.subject, htmlContent: applicantHtml,
      tags: [tag],
      attachments: attachments.length ? attachments : undefined,
    }).catch((e) => console.error('[advance] applicant email failed', e));

    const adminHtml = brandedEmailHtml({
      heading: SUBJECTS[action],
      bodyHtml: `
        <p><strong>${fullName}</strong> — ${row.service ?? 'unknown'} applicant</p>
        <ul style="padding-left:18px">
          <li>Stage: ${row.current_stage}</li>
          <li>BG status: ${row.bg_check_status ?? '—'}</li>
          <li>Action: ${action}</li>
          <li>Attachments: ${attachments.map((a) => a.name).join(', ') || 'none'}</li>
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

    // Sync transition to Tidy Master sheet (Applicants tab).
    await admin.functions.invoke('sync-applicant-to-sheet', {
      body: { applicant_id: row.id, last_event: action, last_event_at: new Date().toISOString() },
    }).catch((e) => console.error('[advance] sheet sync failed', e));
  });

  return jsonResponse({
    ok: true,
    id: row.id,
    current_stage: row.current_stage,
    bg_check_status: row.bg_check_status,
    attachments_count: attachments.length,
    requested_filenames: filenames,
  });
});
