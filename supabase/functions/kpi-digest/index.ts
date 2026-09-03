/**
 * kpi-digest — one owner email per run, through the existing Brevo setup and
 * the existing Tidy branded template (brandedEmailHtml). No new design.
 *
 * AM (11:00 UTC) is FORWARD-LOOKING: today's jobs, unassigned jobs, capacity
 * runway with hire-by dates, plumbing blockers, one line per open capacity alert.
 *
 * PM (22:00 UTC) is BACKWARD-LOOKING: yesterday's adds and churn, cumulative
 * profit vs plan with days ahead/behind, the funnel table by ZIP, trust metrics,
 * one line per open profit / funnel / trust alert.
 *
 * Both open with a single status line. If nothing fired we still send, with
 * "No alerts. Here are the numbers." The send is never skipped.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { brandedEmailHtml, sendBrevoEmail } from '../_shared/notifyJustin.ts';
import { DAY_MS, round } from '../_shared/kpi-engine.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const OWNER_EMAIL = Deno.env.get('KPI_DIGEST_TO') ?? 'admin@jointidy.co';
const APP_URL = 'https://jointidy.co';

type Row = Record<string, any>;

const money = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${n}%`);
const val = (n: unknown) => (n === null || n === undefined ? '—' : String(n));

function statusLine(p: Row): string {
  const d = typeof p?.plan_delta_dollars === 'number' ? p.plan_delta_dollars : null;
  const days = typeof p?.days_behind_plan === 'number' ? p.days_behind_plan : null;
  if (d === null) return 'ON TRACK — no plan row for this month yet.';
  if (Math.abs(d) < 250) return 'ON TRACK';
  if (d > 0) return `AHEAD by ${money(d)}`;
  return `BEHIND by ${money(Math.abs(d))}${days !== null ? ` and ${Math.abs(round(days, 1))} days` : ''}`;
}

function table(headers: string[], rows: string[][]): string {
  const th = headers
    .map((h) => `<th align="left" style="padding:6px 8px;border-bottom:2px solid #f5c518;font-size:12px;color:#0f172a">${h}</th>`)
    .join('');
  const tr = rows
    .map(
      (r) =>
        `<tr>${r
          .map((cell) => `<td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569">${cell}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:10px 0"><tr>${th}</tr>${tr}</table>`;
}

function alertLines(events: Row[]): string {
  if (!events.length) return '<p style="margin:8px 0"><strong>No alerts. Here are the numbers.</strong></p>';
  return `<ul style="margin:8px 0 0;padding-left:18px">${events
    .map(
      (e) =>
        `<li style="margin-bottom:6px"><strong style="color:${
          e.severity === 'red' ? '#b91c1c' : e.severity === 'amber' ? '#b45309' : '#0f172a'
        }">${String(e.severity ?? '').toUpperCase()}</strong> — ${e.headline ?? e.rule_code}${
          e.detail ? `<br/><span style="color:#64748b;font-size:13px">${e.detail}</span>` : ''
        }</li>`,
    )
    .join('')}</ul>`;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!(await isCronAuthorized(req))) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    const { data: ok } = await supabase.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
    if (ok !== true) return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* cron sends no body */ }

  try {
    const { data: snap } = await supabase.from('kpi_snapshot')
      .select('id, window, captured_at, metrics')
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const win = (body.window === 'am' || body.window === 'pm')
      ? (body.window as 'am' | 'pm')
      : ((snap?.window as 'am' | 'pm') ?? (new Date().getUTCHours() < 16 ? 'am' : 'pm'));

    const m = ((snap?.metrics ?? {}) as Row);
    const p = (m.profit ?? {}) as Row;
    const cap = (m.capacity ?? {}) as Row;
    const fun = (m.funnel ?? {}) as Row;
    const trust = (m.trust ?? {}) as Row;
    const plumb = (m.plumbing ?? {}) as Row;

    // Open, un-suppressed events from the last 24h
    const { data: events } = await supabase.from('alert_event')
      .select('rule_code, severity, headline, detail, fired_at, status, suppressed_in_digest')
      .eq('status', 'open')
      .eq('suppressed_in_digest', false)
      .gte('fired_at', new Date(Date.now() - DAY_MS).toISOString())
      .order('fired_at', { ascending: false });

    const { data: rules } = await supabase.from('alert_rule').select('code, domain');
    const domainOf = (code: string) => rules?.find((r) => r.code === code)?.domain ?? 'other';
    const inDomains = (domains: string[]) =>
      (events ?? []).filter((e) => domains.includes(String(domainOf(String(e.rule_code)))));

    const status = statusLine(p);
    let heading: string;
    let bodyHtml: string;

    if (win === 'am') {
      const capacityAlerts = inDomains(['capacity']);
      const plumbingAlerts = inDomains(['plumbing']);
      const urgent = [...capacityAlerts, ...plumbingAlerts][0];
      heading = urgent ? String(urgent.headline) : 'Nothing urgent today';

      const svc = (cap.services ?? {}) as Record<string, Row>;
      bodyHtml = `
        <p style="margin:0 0 14px;font-weight:700;color:#0f172a">${status}</p>
        <h2 style="font-size:16px;margin:18px 0 4px">Today</h2>
        <p style="margin:0">Unassigned jobs in the next 72h: <strong>${val(cap.unassigned_jobs_72h)}</strong></p>
        ${((cap.unassigned_jobs ?? []) as Row[]).length
          ? table(['Job', 'Service', 'When'], (cap.unassigned_jobs as Row[]).slice(0, 10).map((v) => [
              val(v.customer_name), val(v.service_type), String(v.scheduled_at ?? '').slice(0, 16).replace('T', ' '),
            ]))
          : ''}
        <h2 style="font-size:16px;margin:18px 0 4px">Capacity runway (forward)</h2>
        ${table(['Service', 'Pros', 'Util', 'Runway (wks)', 'Hire by'],
          Object.values(svc).map((s) => [
            val(s.service_name), val(s.pros_certified), pct(s.utilization_pct), val(s.runway_weeks), val(s.hire_by_date),
          ]))}
        <h2 style="font-size:16px;margin:18px 0 4px">Hiring pipeline</h2>
        ${table(['Stage', 'Count', 'Avg days in stage'],
          ((cap.pipeline ?? []) as Row[]).map((r) => [val(r.stage), val(r.count), val(r.avg_days_in_stage)]))}
        <h2 style="font-size:16px;margin:18px 0 4px">Plumbing blockers</h2>
        <p style="margin:0">Payouts blocked with money owed: <strong>${val(plumb.pros_payouts_disabled_with_owed_bonus)}</strong>
          ${(plumb.pros_payouts_disabled_names ?? []).length ? `(${(plumb.pros_payouts_disabled_names as string[]).join(', ')})` : ''}<br/>
          COIs expiring in 30 days: <strong>${val(plumb.coi_expiring_30d)}</strong>
          ${(plumb.coi_expiring_names ?? []).length ? `(${(plumb.coi_expiring_names as string[]).join(', ')})` : ''}</p>
        <h2 style="font-size:16px;margin:18px 0 4px">Open alerts</h2>
        ${alertLines([...capacityAlerts, ...plumbingAlerts])}
      `;
    } else {
      const pmAlerts = inDomains(['profit', 'funnel', 'trust']);
      heading = pmAlerts.length ? String(pmAlerts[0].headline) : 'Yesterday in numbers';

      const zips = Object.entries((fun.zips ?? {}) as Record<string, Row>);
      bodyHtml = `
        <p style="margin:0 0 14px;font-weight:700;color:#0f172a">${status}</p>
        <h2 style="font-size:16px;margin:18px 0 4px">Yesterday</h2>
        <p style="margin:0">Adds: <strong>${val(p.adds_yesterday)}</strong> · Churn: <strong>${val(p.churn_yesterday)}</strong>
          · Active subs: <strong>${val(p.active_subs)}</strong> · MRR: <strong>${money(p.mrr)}</strong></p>
        <h2 style="font-size:16px;margin:18px 0 4px">Profit vs plan</h2>
        ${table(['Actual', 'Plan', 'Delta', 'Days'], [[
          money(p.cum_profit_actual), money(p.cum_profit_planned),
          money(p.plan_delta_dollars), val(p.days_behind_plan),
        ]])}
        <h2 style="font-size:16px;margin:18px 0 4px">Funnel by ZIP (trailing 30d)</h2>
        ${table(['ZIP', 'Hangers', 'Scans 30d', 'Paid 30d', 'Scan→Paid', 'CAC', 'Passes'],
          zips.map(([zip, z]) => [
            zip, val(z.hangers_dropped_cum), val(z.scans_30d), val(z.paid_30d),
            pct(z.scan_to_paid_pct), money(z.cac), val(z.coverage_passes),
          ]))}
        <h2 style="font-size:16px;margin:18px 0 4px">Trust</h2>
        <p style="margin:0">Named 5-star (30d): <strong>${val(trust.named_5star_30d)}</strong>
          · Avg rating: <strong>${val(trust.avg_rating_30d)}</strong>
          · Ratings ≤3: <strong>${val(trust.ratings_le3_30d)}</strong>
          · First-visit perfect: <strong>${pct(trust.first_visit_perfect_pct_30d)}</strong>
          · Add-on attach: <strong>${pct(trust.addon_attach_rate_30d)}</strong></p>
        <h2 style="font-size:16px;margin:18px 0 4px">Open alerts</h2>
        ${alertLines(pmAlerts)}
      `;
    }

    const subject = `Tidy ${win.toUpperCase()} digest — ${status}`;
    const html = brandedEmailHtml({
      heading,
      bodyHtml,
      ctaUrl: `${APP_URL}/admin/kpis`,
      ctaLabel: 'Open the dashboard',
    });

    const messageId = await sendBrevoEmail({
      toEmail: OWNER_EMAIL,
      toName: 'Justin',
      subject,
      htmlContent: html,
      tags: [`kpi-digest-${win}`],
      templateName: `kpi_digest_${win}`,
      triggeredBy: 'kpi-digest',
      marketing: false,
    });

    return jsonResponse({
      ok: true,
      window: win,
      snapshot_id: snap?.id ?? null,
      alerts_included: (events ?? []).length,
      sent: !!messageId,
      message_id: messageId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[kpi-digest] failed:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
