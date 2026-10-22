import '../_shared/http.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { sendProEmail } from '../_shared/pro-send.ts';
import { tidyEmailShell } from '../_shared/email-brand.ts';
import { vendorFetch } from '../_shared/http.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { inviteCopy, type InviteLanguage } from '../_shared/hire-ready-rules.ts';

Deno.serve(async req => {
  const pre = handleCors(req); if (pre) return pre;
  // Database-triggered sends present the Vault service credential; accept it like cron jobs do.
  if (!(await isCronAuthorized(req.clone()))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);
  }
  const input = await req.json().catch(() => ({}));
  if (typeof input.job_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.job_id)) return jsonResponse({ error: 'job_id required' }, 400);
  const url = Deno.env.get('SUPABASE_URL'); const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return jsonResponse({ error: 'missing runtime configuration' }, 500);
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data: jobs, error: claimError } = await admin.rpc('hire_ready_claim', { _job_id: input.job_id });
  if (claimError) return jsonResponse({ error: claimError.message }, 500);
  const job = jobs?.[0];
  if (!job) return jsonResponse({ ok: true, skipped: 'not_due_or_already_claimed' });
  const { data: a } = await admin.from('applicants').select('first_name,last_name,email,phone').eq('id', job.applicant_id).single();
  const { data: p } = await admin.from('contractor_pipeline').select('stage,apply_resume_token').eq('applicant_id', job.applicant_id).single();
  if (!a || !p?.apply_resume_token) {
    await admin.from('hire_ready_invite_jobs').update({ status: 'failed', error: 'candidate or resume link missing' }).eq('id', job.id);
    return jsonResponse({ error: 'candidate or resume link missing' }, 500);
  }
  const link = `https://jointidy.co/apply?resume=${p.apply_resume_token}&role=${job.service}`;
  const copy = inviteCopy(a.first_name, job.service, job.language as InviteLanguage, link, job.kind === 'nudge');
  const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));
  // Persist channel intent before any external call; claimed jobs never auto-retry.
  await admin.from('hire_ready_invite_jobs').update({ email_status: 'sending', sms_status: a.phone ? 'pending' : 'no_phone' }).eq('id', job.id);
  let emailStatus = 'failed'; let smsStatus = a.phone ? 'failed' : 'no_phone'; let smsSid: string | null = null; const failures: string[] = [];
  try {
    const result = await sendProEmail(admin, { applicantId: job.applicant_id, key: `hire_ready_${job.kind}`, to: a.email, name: a.first_name,
      built: { subject: copy.subject, html: tidyEmailShell({ heading: copy.subject, previewText: copy.subject, bodyHtml: `<p>${esc(copy.text).replace(/\n/g, '<br>')}</p>`, ctaLabel: job.language === 'es' ? 'Completar solicitud' : 'Complete application', ctaUrl: link }) }, triggeredBy: 'hire-ready-dispatch' });
    emailStatus = result.sent ? 'sent' : 'failed'; if (!result.sent) failures.push(`Email: ${result.reason ?? 'not sent'}`);
  } catch (e) { failures.push(`Email: ${String(e).slice(0, 180)}`); }
  if (a.phone) {
    try {
      const digits = String(a.phone).replace(/\D/g, '');
      const r = await vendorFetch(`${url}/functions/v1/send-twilio-sms`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ to_phone_e164: `+${digits.length === 10 ? '1' : ''}${digits}`, body: copy.text, idempotency_key: `hire-ready:${job.id}`, template_name: `hire_ready_${job.kind}`, triggered_by: 'hire-ready-dispatch', expires_at: new Date(job.archive_at).toISOString() }) });
      const data = await r.json().catch(() => ({}));
      smsStatus = r.ok && data.ok && data.sent ? 'sent' : r.ok && data.ok && data.queued ? 'queued' : 'failed';
      smsSid = data.message_sid ?? data.sid ?? data.twilio_sid ?? null;
      if (smsStatus === 'failed') failures.push(`SMS: ${data.error ?? data.reason ?? `HTTP ${r.status}`}`);
    } catch (e) { failures.push(`SMS: ${String(e).slice(0, 180)}`); }
  }
  await admin.from('hire_ready_invite_jobs').update({ status: failures.length ? 'failed' : 'done', completed_at: new Date().toISOString(), email_status: emailStatus, sms_status: smsStatus, twilio_sid: smsSid, error: failures.join('; ') || null }).eq('id', job.id);
  await admin.from('contractor_stage_events').insert({ applicant_id: job.applicant_id, kind: 'message', from_stage: p.stage, to_stage: p.stage, reason: `hire-ready ${job.kind} (${job.language})`, metadata: { job_id: job.id, email: emailStatus, sms: smsStatus } });
  if (job.kind === 'invite') await admin.from('applicants').update({ first_texted_at: a.phone && smsStatus !== 'failed' ? new Date().toISOString() : null }).eq('id', job.applicant_id);
  if (failures.length) await writeAlert(admin, { level: 'warning', category: 'hiring', tier: 'digest', title: `Invite delivery issue · ${a.first_name} ${a.last_name}`, body: `${failures.join('; ')}. Email ${emailStatus}; SMS ${smsStatus}. No automatic text retry.`, dedupe_key: `hire_ready_fail:${job.id}`, action_label: 'Open candidate', action_url: `/admin/pipeline/${job.applicant_id}`, context: { applicant_id: job.applicant_id, job_id: job.id } });
  return jsonResponse({ ok: failures.length === 0, email: emailStatus, sms: smsStatus, failures });
});