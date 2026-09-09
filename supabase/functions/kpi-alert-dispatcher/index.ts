/**
 * kpi-alert-dispatcher — Routes a fired KPI alert to the right channels.
 *
 * Channels:
 *   - dashboard: already inserted into kpi_alerts (no-op here)
 *   - sms: critical only — send to JUSTIN_ALERT_PHONE via send-twilio-sms
 *   - email: warn + critical — Brevo email to all admins
 *
 * Called by compute-kpi (service-role), not directly by users.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail as sendViaBrevo } from '../_shared/brevo-send.ts';
import { vendorFetch } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const JUSTIN_PHONE = Deno.env.get('JUSTIN_ALERT_PHONE') ?? '';
const ALERT_FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@jointidy.co';

interface AlertPayload {
  kpi_code: string;
  severity: 'warn' | 'critical';
  message: string;
}

async function sendBrevoEmail(to: string[], subject: string, html: string) {
  if (!BREVO_API_KEY || to.length === 0) return false;
  // Internal admin ops mail — marketing: false.
  const r = await sendViaBrevo({
    to, subject, htmlContent: html, marketing: false,
    sender: { name: 'Tidy KPI Alerts', email: ALERT_FROM_EMAIL },
    label: 'kpi-alert-dispatcher',
  });
  return r.sent;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: AlertPayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid JSON' }, 400);
  }
  const { kpi_code, severity, message } = body;
  if (!kpi_code || !severity || !message) {
    return jsonResponse({ ok: false, error: 'missing fields' }, 400);
  }

  const channels: string[] = ['dashboard'];

  // SMS — critical only. Payload must match send-twilio-sms' schema, and the
  // channel is recorded only when the message was actually accepted.
  if (severity === 'critical' && JUSTIN_PHONE) {
    try {
      const res = await vendorFetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to_phone_e164: JUSTIN_PHONE,
          body: `🚨 Tidy KPI CRITICAL: ${message} — open /admin/kpis`,
          idempotency_key: `kpi-critical-${kpi_code}-${new Date().toISOString().slice(0, 13)}`,
          template_name: 'kpi-critical-alert',
          triggered_by: 'kpi-alert-dispatcher',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok && payload?.sent === true) channels.push('sms');
      else if (res.status === 202 && payload?.queued === true) channels.push('sms_queued');
      else {
        console.error('[dispatcher] SMS send failed:', res.status, JSON.stringify(payload).slice(0, 300));
        await supabase.from('admin_alerts').insert({
          alert_type: 'kpi_alert_sms_failed',
          title: `KPI critical SMS failed: ${kpi_code}`,
          body: `HTTP ${res.status} — ${String(payload?.error ?? '').slice(0, 200)}`,
          context: { kpi_code, severity },
        }).then(() => {}, () => {});
      }
    } catch (e) {
      console.error('[dispatcher] SMS send threw:', e);
    }
  }


  // Email — both severities → all admins
  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'admin');
  const adminIds = (roles ?? []).map((r) => r.user_id);

  if (adminIds.length > 0 && BREVO_API_KEY) {
    // Pull admin emails from auth.users via service role
    const emails: string[] = [];
    for (const uid of adminIds) {
      try {
        const { data } = await supabase.auth.admin.getUserById(uid);
        if (data.user?.email) emails.push(data.user.email);
      } catch {
        /* skip */
      }
    }

    const icon = severity === 'critical' ? '🚨' : '⚠️';
    const color = severity === 'critical' ? '#dc2626' : '#d97706';
    const html = `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
        <div style="background:#0f172a;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
          <div style="color:#f5c518;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Tidy KPI Alert</div>
          <div style="font-size:22px;font-weight:600;margin-top:4px;">${icon} ${severity.toUpperCase()}: ${kpi_code}</div>
        </div>
        <div style="background:#fff;border:1px solid #e2e8f0;border-top:0;padding:24px;border-radius:0 0 12px 12px;">
          <p style="margin:0 0 16px;color:#0f172a;font-size:15px;">${message}</p>
          <a href="https://jointidy.co/admin/kpis" style="display:inline-block;background:${color};color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Open KPI Command Center →</a>
          <p style="margin:20px 0 0;color:#64748b;font-size:12px;">Recovery playbook is one click away. Tap "Fix This" on any AUTO step.</p>
        </div>
      </div>
    `;
    const sent = await sendBrevoEmail(emails, `${icon} Tidy KPI ${severity}: ${kpi_code}`, html);
    if (sent) channels.push('email');
  }

  // Update alert row with channels notified
  await supabase
    .from('kpi_alerts')
    .update({ channels_notified: channels })
    .eq('kpi_code', kpi_code)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  return jsonResponse({ ok: true, channels });
});
