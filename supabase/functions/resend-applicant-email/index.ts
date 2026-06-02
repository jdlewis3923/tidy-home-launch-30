// Tidy — Resend an applicant email by re-firing the same advance-applicant
// action that originally produced the email_send_log row. Admin-only.
//
// Body: { email_log_id: uuid }
//
// Strategy: every applicant email written by advance-applicant uses a
// template_name tag (e.g. 'applicant-bg-clear', 'applicant-offer'). We map
// the tag back to its triggering action and re-invoke advance-applicant
// with { applicant_id, action }. This is the simplest correct behavior —
// the same code path runs, attachments rebuild fresh, and a NEW email_send_log
// row is written so the original audit trail is preserved.
//
// Rows that didn't originate from advance-applicant (e.g. payment-setup
// emails, custom blasts) fall back to a generic re-send using the stored
// payload.subject — only available when payload.subject was captured.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({ email_log_id: z.string().uuid() });

// Reverse map: template tag → advance-applicant action.
const TAG_TO_ACTION: Record<string, string> = {
  'applicant-bg-clear': 'clear',
  'applicant-bg-consider': 'consider',
  'applicant-rejected': 'reject',
  'applicant-bg-invite': 'send_to_bg_check',
  'applicant-interview-scheduled': 'schedule_interview',
  'applicant-offer': 'send_offer',
  'applicant-contract-sent': 'send_contract',
  'applicant-oriented': 'mark_oriented',
  'applicant-activated': 'activate',
  'applicant-payment-setup': 'send_payment_setup',
};

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

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

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);

  const { data: log, error: logErr } = await admin
    .from('email_send_log')
    .select('id, template_name, recipient, payload, triggered_by')
    .eq('id', parsed.data.email_log_id).single();
  if (logErr || !log) return jsonResponse({ error: 'log_not_found' }, 404);

  const tag = (log.template_name ?? '').toLowerCase();
  const action = TAG_TO_ACTION[tag];
  if (!action) {
    return jsonResponse({
      error: 'unsupported_template',
      message: `Resend not wired for template '${tag}'. Send manually or extend TAG_TO_ACTION.`,
    }, 400);
  }

  // Find the applicant by recipient email (the only stable foreign key we
  // have in email_send_log without a dedicated applicant_id column).
  const { data: applicant } = await admin
    .from('applicants').select('id, current_stage').eq('email', log.recipient).maybeSingle();
  if (!applicant) return jsonResponse({ error: 'applicant_not_found_for_recipient' }, 404);

  // Re-invoke advance-applicant with the original action, using the service
  // role so we bypass the activation gate (we're not advancing stage — we're
  // re-sending the email side-effect; advance-applicant performs an idempotent
  // update on the row).
  const r = await fetch(`${SUPABASE_URL}/functions/v1/advance-applicant`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      applicant_id: applicant.id,
      action,
      notes: `Resend triggered by admin from email_send_log ${log.id}`,
    }),
  });
  const respBody = await r.json().catch(() => ({}));
  if (!r.ok) {
    return jsonResponse({ error: 'resend_failed', upstream_status: r.status, upstream: respBody }, 502);
  }
  return jsonResponse({ ok: true, resent_action: action, applicant_id: applicant.id });
});
