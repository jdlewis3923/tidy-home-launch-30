/**
 * kpi-digest — Sends scheduled KPI digest emails to admins.
 *
 * Five digest variants (selected via ?variant= query param or body):
 *   - morning_pulse  (daily 7am)  : open alerts, today's visits, MRR, signups
 *   - midday_check   (daily 12pm) : conversion + ads checkpoint
 *   - evening_close  (daily 6pm)  : day-rollup, completion %, inbox
 *   - weekly_review  (Mon 8am)    : weekly trend across all 38 KPIs
 *   - launch_window  (Fri 5pm)    : 90-day launch progress vs targets
 *
 * Auth: service-role only via x-cron-key (called from pg_cron).
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const ALERT_FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@jointidy.co';

type Variant = 'morning_pulse' | 'midday_check' | 'evening_close' | 'weekly_review' | 'launch_window';

const VARIANT_META: Record<Variant, { subject: (date: string) => string; kpis: string[] }> = {
  morning_pulse: {
    subject: (d) => `☀️ Tidy Morning Pulse · ${d}`,
    kpis: ['active_subs', 'mrr', 'visits_today', 'daily_signups', 'inbox_open', 'edge_errors'],
  },
  midday_check: {
    subject: (d) => `⏱ Tidy Midday Check · ${d}`,
    kpis: ['daily_signups', 'signup_conversion', 'site_sessions', 'ads_spend_daily', 'ads_ctr', 'promo_redemption'],
  },
  evening_close: {
    subject: (d) => `🌙 Tidy Evening Close · ${d}`,
    kpis: ['visit_completion', 'on_time_arrival', 'inbox_open', 'failed_payments', 'edge_errors', 'webhook_delivery'],
  },
  weekly_review: {
    subject: (d) => `📊 Tidy Weekly Review · week of ${d}`,
    kpis: [
      'active_subs','mrr','daily_signups','signup_conversion','plan_distribution',
      'visit_completion','on_time_arrival','customer_no_show','churn_rate','ltv',
      'google_reviews_weekly','avg_star_rating','failed_payments','payment_recovery',
    ],
  },
  launch_window: {
    subject: (d) => `🚀 Tidy 90-Day Launch · ${d}`,
    kpis: ['active_subs', 'mrr', 'daily_signups', 'cac', 'ltv', 'churn_rate', 'avg_star_rating'],
  },
};

async function getAdminEmails(s: SupabaseClient): Promise<string[]> {
  const { data: roles } = await s.from('user_roles').select('user_id').eq('role', 'admin');
  const ids = (roles ?? []).map((r) => r.user_id);
  const emails: string[] = [];
  for (const uid of ids) {
    try {
      const { data } = await s.auth.admin.getUserById(uid);
      if (data.user?.email) emails.push(data.user.email);
    } catch { /* skip */ }
  }
  return emails;
}

function statusColor(status: string): string {
  if (status === 'green') return '#059669';
  if (status === 'warn') return '#d97706';
  if (status === 'critical') return '#dc2626';
  return '#94a3b8';
}

function statusEmoji(status: string): string {
  if (status === 'green') return '🟢';
  if (status === 'warn') return '🟡';
  if (status === 'critical') return '🔴';
  return '⚪';
}

async function sendBrevoEmail(to: string[], subject: string, html: string) {
  if (!BREVO_API_KEY || to.length === 0) return false;
  const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Tidy Operating System', email: ALERT_FROM_EMAIL },
      to: to.map((email) => ({ email })),
      subject,
      htmlContent: html,
    }),
  });
  return resp.ok;
}

function buildEmailHtml(
  variant: Variant,
  rows: Array<{ name: string; code: string; value: string; status: string; target: string }>,
  openAlerts: number,
): string {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const variantTitle = variant.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const rowsHtml = rows
    .map(
      (r) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;">
        ${statusEmoji(r.status)} <strong>${r.name}</strong>
        <div style="color:#64748b;font-size:11px;margin-top:2px;">target: ${r.target}</div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:15px;font-weight:600;color:${statusColor(r.status)};text-align:right;white-space:nowrap;">
        ${r.value}
      </td>
    </tr>`,
    )
    .join('');

  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:24px;">
      <div style="background:#0f172a;color:#fff;padding:24px;border-radius:12px 12px 0 0;">
        <div style="color:#f5c518;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Tidy · Operating System</div>
        <div style="font-size:24px;font-weight:600;margin-top:4px;">${variantTitle}</div>
        <div style="color:#94a3b8;font-size:13px;margin-top:4px;">${today}</div>
      </div>
      <div style="background:#fff;padding:0;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:0;">
        ${
          openAlerts > 0
            ? `<div style="background:#fef2f2;color:#991b1b;padding:14px 20px;border-bottom:1px solid #fecaca;font-size:14px;font-weight:600;">⚠️ ${openAlerts} open alert${openAlerts > 1 ? 's' : ''} — open command center</div>`
            : ''
        }
        <table style="width:100%;border-collapse:collapse;">${rowsHtml}</table>
        <div style="padding:20px;text-align:center;">
          <a href="https://jointidy.co/admin/kpis" style="display:inline-block;background:#f5c518;color:#0f172a;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;">Open KPI Command Center →</a>
        </div>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:11px;margin:16px 0 0;">Tidy Home Concierge · Miami</p>
    </div>
  `;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // Auth: service-role via x-cron-key OR POST body cron_key
  const cronKey = req.headers.get('x-cron-key');
  if (cronKey !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let variant: Variant = 'morning_pulse';
  try {
    const url = new URL(req.url);
    const v = url.searchParams.get('variant');
    if (v && v in VARIANT_META) variant = v as Variant;
    else if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      if (body.variant && body.variant in VARIANT_META) variant = body.variant;
    }
  } catch { /* default */ }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const codes = VARIANT_META[variant].kpis;
    // Pull defs + latest snapshots for these codes
    const [{ data: defs }, { data: snaps }, { count: openAlertsCount }] = await Promise.all([
      supabase
        .from('kpi_definitions')
        .select('code, name, target_label')
        .in('code', codes),
      supabase
        .from('kpi_snapshots')
        .select('kpi_code, value, value_text, status, computed_at')
        .in('kpi_code', codes)
        .order('computed_at', { ascending: false })
        .limit(200),
      supabase
        .from('kpi_alerts')
        .select('*', { count: 'exact', head: true })
        .is('resolved_at', null),
    ]);

    const latestByCode = new Map<string, { value: number | null; value_text: string | null; status: string }>();
    for (const s of snaps ?? []) {
      if (!latestByCode.has(s.kpi_code)) {
        latestByCode.set(s.kpi_code, {
          value: s.value,
          value_text: s.value_text,
          status: s.status,
        });
      }
    }
    // Preserve KPI ordering from variant config
    const defByCode = new Map((defs ?? []).map((d) => [d.code, d]));
    const rows = codes
      .map((c) => {
        const d = defByCode.get(c);
        const snap = latestByCode.get(c);
        return {
          name: d?.name ?? c,
          code: c,
          value: snap?.value_text ?? (snap?.value !== null && snap?.value !== undefined ? String(snap.value) : '—'),
          status: snap?.status ?? 'unknown',
          target: d?.target_label ?? '—',
        };
      });

    const html = buildEmailHtml(variant, rows, openAlertsCount ?? 0);
    const subject = VARIANT_META[variant].subject(
      new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    );

    const recipients = await getAdminEmails(supabase);
    const sent = await sendBrevoEmail(recipients, subject, html);

    return jsonResponse({
      ok: sent,
      variant,
      recipients: recipients.length,
      kpis_in_digest: rows.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[kpi-digest] failed:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
