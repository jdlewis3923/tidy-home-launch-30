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
// Signing is now handled by Documenso (REST API). On 'send_offer' we
// fire-and-forget the `send-documenso-envelope` edge function which creates
// the ICA, W-9, and Direct Deposit envelopes. The applicant gets signing
// emails directly from Documenso; the Brevo email below is just a heads-up.
// TODO(Stripe Connect): When STRIPE_CONNECT_API_KEY work begins, replace the
// stripe_connect_pending stub with a real Stripe Accounts API call.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { sendBrevoEmail, brandedEmailHtml, type BrevoAttachment } from '../_shared/notifyJustin.ts';
import { vendorFetch } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ACTIONS = [
  'clear', 'consider', 'fail',
  'send_to_bg_check',
  'schedule_interview', 'send_offer', 'send_contract',
  'mark_oriented', 'activate', 'reject',
  'send_payment_setup',
  'schedule_training', 'mark_no_show',
] as const;

const Body = z.object({
  applicant_id: z.string().uuid(),
  action: z.enum(ACTIONS),
  notes: z.string().max(2000).optional(),
  scheduled_at: z.string().datetime().optional(),
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
    cleaning: '15_Contract_Cleaning.pdf',
    lawn:     '16_Contract_Lawn.pdf',
    detail:   '17_Contract_Detail.pdf',
  } as const;
  switch (action) {
    case 'send_offer':       return ['11_OfferLetter_Template.pdf'];
    case 'send_contract':    return [contract[role as keyof typeof contract] ?? contract.cleaning];
    case 'mark_oriented':    return [onboardingPacket[role as keyof typeof onboardingPacket] ?? onboardingPacket.cleaning];
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
      u.current_stage = 'interview';
      break;
    case 'consider':
      u.bg_check_status = 'consider';
      u.bg_check_provider = 'manual';
      u.current_stage = 'bg_check';
      break;
    case 'fail':
      u.bg_check_status = 'fail';
      u.bg_check_provider = 'manual';
      u.bg_check_completed_at = new Date().toISOString();
      u.current_stage = 'rejected';
      u.rejected_at = new Date().toISOString();
      u.rejection_reason = 'Background check failed';
      break;
    case 'send_to_bg_check':   u.current_stage = 'bg_check'; u.bg_check_provider = 'checkr'; u.bg_check_status = 'pending'; break;
    case 'schedule_interview': u.current_stage = 'interview'; break;
    case 'send_offer':         u.current_stage = 'offer_sent'; break;
    case 'send_contract':      u.current_stage = 'contract_signed'; break;
    case 'mark_oriented':      u.current_stage = 'oriented'; break;
    case 'activate':           u.current_stage = 'active'; break;
    case 'reject':
      u.current_stage = 'rejected';
      u.rejected_at = new Date().toISOString();
      break;
    case 'send_payment_setup':
    case 'schedule_training':
    case 'mark_no_show':
      // No stage change — side-effects only (handled in main handler).
      break;
  }
  return u;
}

const SUBJECTS: Record<Action, string> = {
  clear: 'Background check CLEARED',
  consider: 'Background check needs review',
  fail: 'Background check FAILED — applicant rejected',
  send_to_bg_check: 'Background check invitation sent',
  schedule_interview: 'Interview scheduled',
  send_offer: 'Offer sent',
  send_contract: 'Contract sent for signature',
  mark_oriented: 'Group orientation complete',
  activate: 'Contractor activated',
  reject: 'Applicant rejected',
  send_payment_setup: 'Payment setup link sent',
  schedule_training: 'Live training scheduled',
  mark_no_show: 'Marked as no-show for training',
};

const TEMPLATE_TAG: Record<Action, string> = {
  clear: 'applicant-bg-clear',
  consider: 'applicant-bg-consider',
  fail: 'applicant-rejected',
  send_to_bg_check: 'applicant-bg-invite',
  schedule_interview: 'applicant-interview-scheduled',
  send_offer: 'applicant-offer',
  send_contract: 'applicant-contract-sent',
  mark_oriented: 'applicant-oriented',
  activate: 'applicant-activated',
  reject: 'applicant-rejected',
  send_payment_setup: 'applicant-payment-setup',
  schedule_training: 'applicant-training-scheduled',
  mark_no_show: 'applicant-training-no-show',
};

const CALENDLY_URL = 'https://calendly.com/jointidy/interview';
const LOGIN_URL_PLACEHOLDER = 'https://jointidy.co/auth/login'; // TODO swap when contractor login is live

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // AuthN: literal service-role key (constant-time) OR a signature-verified
  // admin session. JWT payload claims are never decoded or trusted.
  const authResult = await requireServiceOrAdmin(req);
  if (!authResult.ok) {
    console.warn('[advance-applicant] rejected', authResult.error);
    return jsonResponse({ error: authResult.error }, authResult.status);
  }
  const userId: string = authResult.userId ?? '00000000-0000-0000-0000-000000000000';

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { applicant_id, action, notes, scheduled_at } = parsed.data;

  if (action === 'consider' && !notes) {
    return jsonResponse({ error: 'notes_required_for_consider' }, 400);
  }
  if (action === 'schedule_training' && !scheduled_at) {
    return jsonResponse({ error: 'scheduled_at_required' }, 400);
  }

  // ACTIVATE GATE: must be oriented AND compliance_complete=true AND all 3 onboarding gates true.
  if (action === 'activate') {
    const { data: pre } = await admin
      .from('applicants')
      .select('current_stage, compliance_complete, stripe_connect_complete, training_passed, equipment_approved')
      .eq('id', applicant_id)
      .single();
    if (!pre) return jsonResponse({ error: 'applicant_not_found' }, 404);
    if (pre.current_stage !== 'oriented') {
      return jsonResponse({
        error: 'activation_blocked',
        reason: `applicant must be in 'oriented' stage (currently '${pre.current_stage}')`,
      }, 400);
    }
    if (!pre.compliance_complete) {
      return jsonResponse({
        error: 'activation_blocked',
        reason: 'compliance_complete is false (COI / bond / auto / EIN missing)',
      }, 400);
    }
    const unmet: string[] = [];
    if (!pre.stripe_connect_complete) unmet.push('stripe_connect_complete (payouts not set up)');
    if (!pre.training_passed)         unmet.push('training_passed (SOP quiz not cleared)');
    if (!pre.equipment_approved)      unmet.push('equipment_approved (equipment photos not approved)');
    if (unmet.length) {
      return jsonResponse({
        error: 'activation_blocked',
        reason: `onboarding gates not met: ${unmet.join(', ')}`,
        unmet_gates: unmet,
      }, 400);
    }
  }


  // SEND_CONTRACT PRE-CHECK: this action has silently emailed nothing for
  // months because the contract PDF row was never uploaded (storage_path still
  // `pending/...`) and the failure was swallowed. Refuse the transition up
  // front instead of recording a fake "contract sent".
  if (action === 'send_contract') {
    const { data: preRow } = await admin
      .from('applicants').select('service').eq('id', applicant_id).maybeSingle();
    const preAttachments = await buildAttachments(filenamesFor('send_contract', roleKey(preRow?.service)));
    if (!preAttachments.length) {
      return jsonResponse({
        error: 'contract_document_unavailable',
        reason: 'No signable contract PDF is uploaded for this role, so no email would be sent. Upload the contract in company_documents / tidy-docs first.',
        expected_filenames: filenamesFor('send_contract', roleKey(preRow?.service)),
      }, 409);
    }
  }

  const update = applyTransition(action);
  if (notes) update.bg_check_notes = notes;


  // Schedule training: persist datetime.
  if (action === 'schedule_training' && scheduled_at) {
    update.training_scheduled_at = scheduled_at;
  }

  // Mark no-show: increment counter; if >=2 auto-reject.
  let autoRejectedForNoShow = false;
  if (action === 'mark_no_show') {
    const { data: pre } = await admin
      .from('applicants')
      .select('training_no_show_count')
      .eq('id', applicant_id)
      .single();
    const nextCount = ((pre as any)?.training_no_show_count ?? 0) + 1;
    update.training_no_show_count = nextCount;
    update.training_scheduled_at = null;
    if (nextCount >= 2) {
      autoRejectedForNoShow = true;
      update.current_stage = 'rejected';
      update.rejected_at = new Date().toISOString();
      update.rejection_reason = 'Two training no-shows';
    }
  }

  const { data: row, error } = await admin
    .from('applicants').update(update).eq('id', applicant_id)
    .select('id, first_name, last_name, email, service, current_stage, bg_check_status, training_scheduled_at, training_no_show_count').single();
  if (error || !row) {
    console.error('[advance-applicant] update failed', error);
    return jsonResponse({ error: 'update_failed', details: error?.message }, 500);
  }

  const fullName = `${row.first_name} ${row.last_name}`;
  const applicantRole = roleKey(row.service);

  // Insert onboarding_events row (best-effort, but we do await — it's the audit trail).
  const eventInsert = await admin.from('onboarding_events').insert({
    applicant_id: row.id,
    event: action,
    metadata: {
      stage: row.current_stage,
      bg_check_status: row.bg_check_status,
      role: applicantRole,
      notes: notes ?? null,
      triggered_by: userId,
    },
  });
  if (eventInsert.error) console.error('[advance] onboarding_events insert failed', eventInsert.error);

  // Stripe Connect Express stub on activation.
  if (action === 'activate') {
    const { error: stripeErr } = await admin.from('stripe_connect_pending').insert({
      applicant_id: row.id,
      role: applicantRole,
      status: 'pending_api_call',
    });
    if (stripeErr) console.error('[advance] stripe_connect_pending insert failed', stripeErr);
  }

  // Documenso envelope dispatch on send_offer.
  // Previously fire-and-forget with console.error only, which is exactly why
  // this never once produced an envelope and nobody found out. Now awaited,
  // recorded in onboarding_events + admin_alerts, and surfaced to the caller.
  let documensoResult: { ok: boolean; status?: number; error?: string; body?: unknown } | null = null;
  if (action === 'send_offer') {
    try {
      const r = await vendorFetch(`${SUPABASE_URL}/functions/v1/send-documenso-envelope`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicant_id: row.id }),
      });
      const body = await r.json().catch(() => ({}));
      documensoResult = r.ok && (body as any)?.ok !== false
        ? { ok: true, status: r.status, body }
        : { ok: false, status: r.status, error: (body as any)?.error ?? `http_${r.status}`, body };
    } catch (e) {
      documensoResult = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    if (!documensoResult.ok) {
      console.error('[advance] documenso envelope FAILED', documensoResult);
      await admin.from('admin_alerts').insert({
        alert_type: 'documenso_envelope_failed',
        title: `Documenso envelope failed for ${fullName}`,
        body: documensoResult.error ?? 'unknown error',
        context: { applicant_id: row.id, ...documensoResult },
      }).then(() => {}, () => {});
      await admin.from('onboarding_events').insert({
        applicant_id: row.id,
        event: 'send_offer_documenso_failed',
        metadata: documensoResult as unknown as Record<string, unknown>,
      }).then(() => {}, () => {});
      return jsonResponse({
        ok: false,
        error: 'documenso_envelope_failed',
        details: documensoResult,
        applicant_id: row.id,
        current_stage: row.current_stage,
        note: 'Stage was advanced but NO signing envelope exists. Fix Documenso and re-run send_offer.',
      }, 502);
    }
  }



  // Checkr invitation dispatch on send_to_bg_check.
  //
  // Phase 4: AWAITED. The applicant is emailed a promise that the background
  // check is coming, so a detached microtask that dies with the isolate is the
  // exact send_offer failure again. A dispatch failure is surfaced and alerted.
  let checkrDispatchError: string | null = null;
  if (action === 'send_to_bg_check') {
    try {
      const r = await vendorFetch(`${SUPABASE_URL}/functions/v1/checkr-invite`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicant_id: row.id }),
      });
      if (!r.ok) {
        checkrDispatchError = `checkr-invite ${r.status}: ${(await r.text().catch(() => '')).slice(0, 300)}`;
      }
    } catch (e) {
      checkrDispatchError = `checkr-invite threw: ${(e as Error).message}`;
    }
    if (checkrDispatchError) {
      console.error('[advance]', checkrDispatchError);
      await admin.from('admin_alerts').insert({
        alert_type: 'checkr_invite_dispatch_failed',
        title: `Background check invitation was NOT sent: ${row.email}`,
        body: `${checkrDispatchError} — the applicant was told it is coming. Re-run send_to_bg_check.`,
        context: { applicant_id: row.id },
      }).then(() => {}, () => {});
    }
  }

  // Build attachments from documents → signed URLs.
  const filenames = filenamesFor(action, applicantRole);
  const attachments = await buildAttachments(filenames);

  // For send_payment_setup: synchronously mint a Stripe Connect onboarding
  // link so we can embed it in the email body. If Stripe is not configured
  // we still send a heads-up email pointing at the contractor portal.
  let paymentSetupUrl: string | null = null;
  if (action === 'send_payment_setup') {
    try {
      const r = await vendorFetch(`${SUPABASE_URL}/functions/v1/stripe-connect-create`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ applicant_id: row.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.url) paymentSetupUrl = j.url as string;
      else console.error('[advance] stripe-connect-create failed', r.status, j);
    } catch (e) {
      console.error('[advance] stripe-connect-create dispatch failed', e);
    }
  }

  const paymentSetupHref = paymentSetupUrl ?? 'https://jointidy.co/onboarding';

  // Build a .ics calendar invite for schedule_training.
  let trainingIcsAttachment: BrevoAttachment | null = null;
  let trainingHumanWhen = '';
  if (action === 'schedule_training' && row.training_scheduled_at) {
    const start = new Date(row.training_scheduled_at);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const uid = `tidy-training-${row.id}@jointidy.co`;
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tidy Home Concierge//Training//EN',
      'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
      'SUMMARY:Tidy Live Training',
      'DESCRIPTION:Live training with Justin. Bring your equipment.',
      'LOCATION:Miami\\, FL (details to follow)',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    trainingIcsAttachment = {
      name: 'tidy-training.ics',
      content: btoa(ics),
    };
    trainingHumanWhen = start.toLocaleString('en-US', {
      timeZone: 'America/New_York', dateStyle: 'full', timeStyle: 'short',
    });
  }


  // Per-action applicant-facing copy.
  const APPLICANT_COPY: Record<Action, { subject: string; body: string }> = {
    clear: { subject: 'Your background check is clear', body: `<p>Hi ${row.first_name},</p><p>Great news — your background check came back clear. We'll reach out shortly to schedule your interview.</p>` },
    consider: { subject: 'Quick question about your application', body: `<p>Hi ${row.first_name},</p><p>Your background check came back with something we'd like to chat about. Someone from Tidy will reach out shortly.</p>` },
    fail: { subject: 'Your Tidy application', body: `<p>Hi ${row.first_name},</p><p>Thanks for applying. After reviewing your background check, we're unable to move forward at this time.</p>` },
    send_to_bg_check: { subject: 'Your background check from Tidy', body: `<p>Hi ${row.first_name},</p><p>Thanks for moving forward with Tidy. Within the next few minutes you'll get a separate email from <strong>Checkr</strong> — our background-check partner — with a secure link to complete your screening (criminal, identity, SSN, and sex-offender). It usually takes 3–5 minutes.</p><p><strong>Tidy covers the full cost</strong> of this check. You won't be asked to pay anything.</p><p>If you don't see the Checkr email, check spam, then reply here and we'll resend.</p><p style="color:#64748b;font-size:13px">— The Tidy team</p>` },
    schedule_interview: { subject: 'Schedule your Tidy interview', body: `<p>Hi ${row.first_name},</p><p>Pick a time that works for you: <a href="${CALENDLY_URL}">Book your interview</a>.</p>` },
    send_offer: { subject: 'Your Tidy offer — please sign', body: `<p>Hi ${row.first_name},</p><p>We'd love to have you on the team. You'll receive 3 separate emails from Documenso to sign your ICA, W-9, and Direct Deposit form.</p><p>Pick a time to chat: <a href="${CALENDLY_URL}">book here</a>.</p><p style="color:#64748b;font-size:13px">— The Tidy team</p>` },
    send_contract: { subject: 'Sign your Tidy contract', body: `<p>Hi ${row.first_name},</p><p>Your contract is attached. Please review and sign.</p><p style="color:#64748b;font-size:13px">— The Tidy team</p>` },
    mark_oriented: { subject: 'Group orientation complete 🎉', body: `<p>Hi ${row.first_name},</p><p>Welcome to the team. Your role-specific onboarding packet is attached — review it before your first job. We'll send activation + payout setup next.</p>` },
    activate: { subject: 'Welcome to Tidy', body: `<p>Hi ${row.first_name},</p><p>You're activated and ready to take jobs. Your onboarding packet is attached.</p><p>Log in to your contractor portal: <a href="${LOGIN_URL_PLACEHOLDER}">${LOGIN_URL_PLACEHOLDER}</a></p>` },
    reject: { subject: 'Your Tidy application', body: `<p>Hi ${row.first_name},</p><p>Thanks for taking the time to apply to Tidy. After review, we're not able to move forward right now — we wish you the best.</p>` },
    send_payment_setup: { subject: 'Set up your Tidy payouts', body: `<p>Hi ${row.first_name},</p><p>Last step before activation: set up your payouts. Tidy uses <strong>Stripe Connect</strong> to pay contractors directly into your bank account after each job — no invoices, no waiting.</p><p>Click below to complete your payout setup (about 3 minutes; you'll need your SSN/EIN and a bank routing/account number).</p><p style="margin:18px 0"><a href="${paymentSetupHref}" style="display:inline-block;background:#f5c518;color:#0f172a;font-weight:700;padding:12px 22px;border-radius:8px;text-decoration:none">Set up payouts</a></p><p style="color:#64748b;font-size:13px">This secure link expires in a few minutes. If it expires, just reply to this email and we'll send a fresh one.</p><p style="color:#64748b;font-size:13px">— The Tidy team</p>` },
    schedule_training: { subject: 'Your Tidy live training is scheduled', body: `<p>Hi ${row.first_name},</p><p>Your live training is scheduled for <strong>${trainingHumanWhen} (Miami time)</strong>. A calendar invite is attached.</p><p>Bring all your equipment. We'll send a reminder 24 hours before.</p>` },
    mark_no_show: autoRejectedForNoShow
      ? { subject: 'Your Tidy application', body: `<p>Hi ${row.first_name},</p><p>You missed your second scheduled live training, so we've closed your application. If circumstances change, you're welcome to re-apply down the road.</p>` }
      : { subject: 'Let’s reschedule your Tidy training', body: `<p>Hi ${row.first_name},</p><p>We didn't see you at your scheduled live training. No worries — reply to this email and we'll set up a new time. (Heads up: a second no-show closes the application.)</p>` },
  };


  const tag = TEMPLATE_TAG[action];
  const applicantCopy = APPLICANT_COPY[action];

  // Emails are AWAITED and their failures surfaced. The old queueMicrotask +
  // console.error pattern is what made send_contract look like it worked while
  // sending nothing at all.
  const applicantHtml = brandedEmailHtml({
    heading: applicantCopy.subject,
    bodyHtml: applicantCopy.body,
  });
  const allAttachments = [
    ...attachments,
    ...(trainingIcsAttachment ? [trainingIcsAttachment] : []),
  ];

  let applicantEmailError: string | null = null;
  try {
    await sendBrevoEmail({
      toEmail: row.email, toName: fullName,
      subject: applicantCopy.subject, htmlContent: applicantHtml,
      tags: [tag],
      attachments: allAttachments.length ? allAttachments : undefined,
      templateName: tag,
      triggeredBy: 'advance-applicant',
    });
  } catch (e) {
    applicantEmailError = e instanceof Error ? e.message : String(e);
  }

  if (applicantEmailError) {
    console.error('[advance] applicant email FAILED', action, applicantEmailError);
    await admin.from('admin_alerts').insert({
      alert_type: 'applicant_email_failed',
      title: `Applicant email failed (${action}) for ${fullName}`,
      body: applicantEmailError,
      context: { applicant_id: row.id, action, template: tag },
    }).then(() => {}, () => {});
    await admin.from('onboarding_events').insert({
      applicant_id: row.id,
      event: `${action}_email_failed`,
      metadata: { error: applicantEmailError, template: tag },
    }).then(() => {}, () => {});
  }

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
  let adminEmailError: string | null = null;
  try {
    await sendBrevoEmail({
      toEmail: 'admin@jointidy.co', toName: 'Justin',
      subject: `${SUBJECTS[action]}: ${fullName}`, htmlContent: adminHtml,
      tags: [`admin-${tag}`],
      templateName: `admin-${tag}`,
      triggeredBy: 'advance-applicant',
    });
  } catch (e) {
    adminEmailError = e instanceof Error ? e.message : String(e);
    console.error('[advance] admin email FAILED', action, adminEmailError);
  }

  // Sync transition to Tidy Master sheet (Applicants tab) — non-blocking, but
  // any failure is reported back rather than dropped.
  let sheetSyncError: string | null = null;
  try {
    const { error: syncErr } = await admin.functions.invoke('sync-applicant-to-sheet', {
      body: { applicant_id: row.id, last_event: action, last_event_at: new Date().toISOString() },
    });
    if (syncErr) sheetSyncError = syncErr.message;
  } catch (e) {
    sheetSyncError = e instanceof Error ? e.message : String(e);
  }
  if (sheetSyncError) console.error('[advance] sheet sync failed', sheetSyncError);

  if (applicantEmailError) {
    return jsonResponse({
      ok: false,
      error: 'applicant_email_failed',
      details: applicantEmailError,
      id: row.id,
      current_stage: row.current_stage,
      attachments_count: attachments.length,
      requested_filenames: filenames,
    }, 502);
  }

  return jsonResponse({
    ok: true,
    id: row.id,
    current_stage: row.current_stage,
    bg_check_status: row.bg_check_status,
    attachments_count: attachments.length,
    requested_filenames: filenames,
    documenso: documensoResult,
    admin_email_error: adminEmailError,
    sheet_sync_error: sheetSyncError,
  });
});
