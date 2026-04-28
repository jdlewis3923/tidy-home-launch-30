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
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Tidy KPI Alerts', email: ALERT_FROM_EMAIL },
        to: to.map((email) => ({ email })),
        subject,
        htmlContent: html,
      }),
    });
    return resp.ok;
  } catch {
    return false;
  }
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

  // SMS — critical only
  if (severity === 'critical' && JUSTIN_PHONE) {
    try {
      await supabase.functions.invoke('send-twilio-sms', {
        body: {
          to: JUSTIN_PHONE,
          message: `🚨 Tidy KPI CRITICAL: ${message} — open /admin/kpis`,
        },
      });
      channels.push('sms');
    } catch (e) {
      console.error('[dispatcher] SMS send failed:', e);
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
