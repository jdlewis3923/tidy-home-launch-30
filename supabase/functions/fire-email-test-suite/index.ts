// Tidy — Email/SMS Test Suite Trigger (admin-only)
//
// Fires a test send for every backend-triggered transactional message
// in the Tidy stack. Each send is tagged in email_send_log with
// triggered_by = 'test-suite' so /admin/email-health can filter by it.
//
// 5-second delay between sends to avoid Brevo rate limits.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail, brandedEmailHtml } from '../_shared/notifyJustin.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const ADMIN_EMAIL = 'admin@jointidy.co';
const ADMIN_PHONE = '+17868291141';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type EmailTpl = {
  template_name: string;
  subject: string;
  heading: string;
  body: string;
  attach?: string[]; // company_documents.filename
};

const EMAIL_TEMPLATES: EmailTpl[] = [
  { template_name: 'applicant-applied', subject: '[TEST] Application received', heading: 'Application received', body: '<p>Test send for applicant confirmation flow.</p>' },
  { template_name: 'admin-new-applicant', subject: '[TEST] New contractor application', heading: 'New applicant', body: '<p>Test admin alert.</p>' },
  { template_name: 'applicant-bg-clear', subject: '[TEST] Background check cleared', heading: 'BG clear', body: '<p>Test send.</p>' },
  { template_name: 'applicant-bg-consider', subject: '[TEST] Background check needs review', heading: 'BG consider', body: '<p>Test send.</p>' },
  { template_name: 'applicant-rejected', subject: '[TEST] Application not moving forward', heading: 'Rejected', body: '<p>Test send.</p>' },
  { template_name: 'applicant-interview-scheduled', subject: '[TEST] Interview scheduled', heading: 'Interview', body: '<p>Test send.</p>' },
  { template_name: 'applicant-offer', subject: '[TEST] Offer letter', heading: 'Offer', body: '<p>Test send with offer letter PDF.</p>', attach: ['11_OfferLetter_Template.pdf'] },
  { template_name: 'applicant-contract-sent', subject: '[TEST] Contract for signature', heading: 'Contract', body: '<p>Test send with contract PDF.</p>', attach: ['15_HelloSign_Contract_Cleaning.pdf'] },
  { template_name: 'applicant-demo-passed', subject: '[TEST] Demo passed', heading: 'Demo passed', body: '<p>Test send with onboarding packet.</p>', attach: ['12_OnboardingPacket_Cleaning.pdf'] },
  { template_name: 'applicant-activated', subject: '[TEST] Welcome to Tidy', heading: 'Activated', body: '<p>Test send with welcome packet.</p>', attach: ['12_OnboardingPacket_Cleaning.pdf'] },
  { template_name: 'customer-welcome', subject: '[TEST] Welcome to Tidy 🏡', heading: 'Welcome', body: '<p>Test customer welcome flow (Stripe subscription created).</p>' },
  { template_name: 'customer-payment-failed-att1', subject: '[TEST] Payment failed — attempt 1', heading: 'Payment failed', body: '<p>Test send.</p>' },
  { template_name: 'customer-payment-failed-final', subject: '[TEST] Payment failed — final notice', heading: 'Final notice', body: '<p>Test send.</p>' },
  { template_name: 'customer-renewal', subject: '[TEST] Renewal reminder', heading: 'Renewal', body: '<p>Test send.</p>' },
  { template_name: 'customer-card-expiring', subject: '[TEST] Card expiring soon', heading: 'Card expiring', body: '<p>Test send.</p>' },
  { template_name: 'visit-post-feedback', subject: '[TEST] How was your visit?', heading: 'Feedback', body: '<p>Test send.</p>' },
];

const SMS_TEMPLATES: Array<{ template_name: string; body: string }> = [
  { template_name: 'referral-code-sms', body: '[TEST] Your Tidy referral code: TEST-XXXXX' },
  { template_name: 'referral-50-credit-sms', body: '[TEST] You just earned a $50 Tidy credit! 🎉' },
  { template_name: 'customer-welcome-sms', body: '[TEST] Welcome to Tidy! Reply HELP for support.' },
  { template_name: 'visit-day-before-sms', body: '[TEST] Your Tidy visit is tomorrow.' },
];

// Look up filenames → signed attachments on tidy-docs bucket.
async function buildAttachments(filenames: string[]) {
  if (!filenames.length) return [];
  const { data: rows } = await admin
    .from('company_documents')
    .select('filename, storage_path')
    .in('filename', filenames)
    .is('archived_at', null);
  const out: Array<{ url: string; name: string }> = [];
  for (const row of rows ?? []) {
    if (!row.storage_path || row.storage_path.startsWith('pending/')) continue;
    const { data: signed } = await admin.storage
      .from('tidy-docs').createSignedUrl(row.storage_path, 60 * 60 * 24);
    if (signed?.signedUrl) out.push({ url: signed.signedUrl, name: row.filename });
  }
  return out;
}

async function getLatestLogId(template_name: string): Promise<string | null> {
  const { data } = await admin
    .from('email_send_log')
    .select('id')
    .eq('template_name', template_name)
    .eq('triggered_by', 'test-suite')
    .order('triggered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  // Admin auth (or service-role bypass for internal cron).
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);

  let isServiceRole = false;
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const pad = (s: string) => s + '='.repeat((4 - (s.length % 4)) % 4);
      const payload = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))));
      isServiceRole = payload?.role === 'service_role';
    }
  } catch { /* ignore */ }

  if (!isServiceRole) {
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
  }

  const failures: Array<{ template: string; error: string }> = [];
  const log_ids: string[] = [];
  let succeeded = 0;
  const total = EMAIL_TEMPLATES.length + SMS_TEMPLATES.length;

  // 1. Emails.
  for (const tpl of EMAIL_TEMPLATES) {
    try {
      const attachments = tpl.attach ? await buildAttachments(tpl.attach) : [];
      const html = brandedEmailHtml({ heading: tpl.heading, bodyHtml: tpl.body });
      const messageId = await sendBrevoEmail({
        toEmail: ADMIN_EMAIL, toName: 'Tidy Admin (test)',
        subject: tpl.subject, htmlContent: html,
        tags: [tpl.template_name, 'test-suite'],
        attachments: attachments.length ? attachments : undefined,
        templateName: tpl.template_name,
        triggeredBy: 'test-suite',
      });
      const logId = await getLatestLogId(tpl.template_name);
      if (logId) log_ids.push(logId);
      if (messageId) succeeded++;
      else failures.push({ template: tpl.template_name, error: 'no message id (see email_send_log)' });
    } catch (e) {
      failures.push({ template: tpl.template_name, error: (e as Error).message });
    }
    await sleep(5000);
  }

  // 2. SMS — use send-twilio-sms with template_name + triggered_by labels.
  for (const sms of SMS_TEMPLATES) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_phone_e164: ADMIN_PHONE,
          body: sms.body,
          idempotency_key: `test-suite-${sms.template_name}-${Date.now()}`,
          template_name: sms.template_name,
          triggered_by: 'test-suite',
        }),
      });
      const json = await r.json().catch(() => ({}));
      const logId = await getLatestLogId(sms.template_name);
      if (logId) log_ids.push(logId);
      if (r.ok && json?.ok) {
        succeeded++;
      } else {
        failures.push({
          template: sms.template_name,
          error: json?.error ?? json?.reason ?? `HTTP ${r.status}`,
        });
      }
    } catch (e) {
      failures.push({ template: sms.template_name, error: (e as Error).message });
    }
    await sleep(5000);
  }

  return jsonResponse({
    total_attempted: total,
    total_succeeded: succeeded,
    total_failed: total - succeeded,
    failures,
    email_send_log_ids: log_ids,
  });
});
