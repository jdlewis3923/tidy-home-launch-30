/**
 * compute-kpi — Computes the ~14 DB-sourced KPIs and writes snapshots.
 *
 * Sources covered (Supabase + Stripe via local tables):
 *   active_subs, mrr, daily_signups, signup_conversion, plan_distribution,
 *   promo_redemption, checkout_abandonment (best-effort), visits_today,
 *   visit_completion, customer_no_show, same_day_reschedule, inbox_open,
 *   edge_errors, webhook_delivery, failed_payments, payment_recovery,
 *   coupon_spend.
 *
 * External-API KPIs (GA4, Google Ads, Meta, Jobber GraphQL, Twilio status,
 * Brevo) are written as `unknown` placeholders here — turn 4 wires those.
 *
 * Triggers an alert row + dispatcher call for every KPI flipping warn→critical
 * or coming back green.
 *
 * Auth: callable by service-role (cron) OR admin user. Pass header
 * `x-cron-key: <SUPABASE_SERVICE_ROLE_KEY>` to skip JWT.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

type KpiStatus = 'green' | 'warn' | 'critical' | 'unknown';

interface KpiDef {
  code: string;
  direction: string;
  target_value: number | null;
  warn_threshold: number | null;
  critical_threshold: number | null;
}

interface ComputedKpi {
  code: string;
  value: number | null;
  value_text?: string | null;
  context?: Record<string, unknown>;
  // Optional explicit status override (for ramp KPIs that need period-aware logic)
  explicit_status?: KpiStatus;
}

// ─── status evaluation ───
function evaluate(def: KpiDef, value: number | null, override?: KpiStatus): KpiStatus {
  if (override) return override;
  if (value === null || value === undefined) return 'unknown';
  const { direction, warn_threshold, critical_threshold, target_value } = def;

  if (direction === 'lower_is_better') {
    if (critical_threshold !== null && value >= critical_threshold) return 'critical';
    if (warn_threshold !== null && value >= warn_threshold) return 'warn';
    return 'green';
  }
  if (direction === 'higher_is_better') {
    if (critical_threshold !== null && value <= critical_threshold) return 'critical';
    if (warn_threshold !== null && value <= warn_threshold) return 'warn';
    return 'green';
  }
  // range / unknown direction → fallback by distance from target
  if (target_value !== null) {
    const diff = Math.abs(value - target_value) / Math.max(1, Math.abs(target_value));
    if (diff > 0.5) return 'critical';
    if (diff > 0.2) return 'warn';
    return 'green';
  }
  return 'unknown';
}

// ─── individual KPI computers ───

async function kActiveSubs(s: SupabaseClient): Promise<ComputedKpi> {
  const { count } = await s
    .from('subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'active');
  return { code: 'active_subs', value: count ?? 0, value_text: `${count ?? 0} subs` };
}

async function kMrr(s: SupabaseClient): Promise<ComputedKpi> {
  const { data } = await s
    .from('subscriptions')
    .select('monthly_total_cents')
    .eq('status', 'active');
  const cents = (data ?? []).reduce(
    (acc, r) => acc + (r.monthly_total_cents ?? 0),
    0,
  );
  const dollars = Math.round(cents / 100);
  return {
    code: 'mrr',
    value: dollars,
    value_text: `$${dollars.toLocaleString()}`,
    context: { active_subs: data?.length ?? 0 },
  };
}

async function kDailySignups(s: SupabaseClient): Promise<ComputedKpi> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count } = await s
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', start.toISOString());
  return { code: 'daily_signups', value: count ?? 0 };
}

async function kSignupConversion(s: SupabaseClient): Promise<ComputedKpi> {
  // 7-day window: subs created / profiles created
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [{ count: profiles }, { count: subs }] = await Promise.all([
    s.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', since),
    s.from('subscriptions').select('*', { count: 'exact', head: true }).gte('created_at', since),
  ]);
  if (!profiles || profiles === 0) {
    return { code: 'signup_conversion', value: null, value_text: 'No signups yet (7d)' };
  }
  const pct = Math.round(((subs ?? 0) / profiles) * 1000) / 10;
  return {
    code: 'signup_conversion',
    value: pct,
    context: { profiles_7d: profiles, subs_7d: subs },
  };
}

async function kPlanDistribution(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await s
    .from('subscriptions')
    .select('services, bundle_discount_pct')
    .gte('created_at', since);
  const total = data?.length ?? 0;
  if (total === 0) return { code: 'plan_distribution', value: null, value_text: 'No new subs (7d)' };
  const bundles = (data ?? []).filter(
    (r) => (r.services?.length ?? 0) >= 2 || (r.bundle_discount_pct ?? 0) > 0,
  ).length;
  const pct = Math.round((bundles / total) * 1000) / 10;
  return { code: 'plan_distribution', value: pct, context: { total, bundles } };
}

async function kPromoRedemption(s: SupabaseClient): Promise<ComputedKpi> {
  // Best-effort: % of recent subs with bundle/credit discount
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await s
    .from('subscriptions')
    .select('id, bundle_discount_pct')
    .gte('created_at', since);
  const total = data?.length ?? 0;
  if (total === 0) return { code: 'promo_redemption', value: null, value_text: 'No new subs (7d)' };
  const redeemed = (data ?? []).filter((r) => (r.bundle_discount_pct ?? 0) > 0).length;
  const pct = Math.round((redeemed / total) * 1000) / 10;
  return { code: 'promo_redemption', value: pct };
}

async function kVisitsToday(s: SupabaseClient): Promise<ComputedKpi> {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10);
  const { count } = await s
    .from('visits')
    .select('*', { count: 'exact', head: true })
    .eq('visit_date', ymd);
  return { code: 'visits_today', value: count ?? 0 };
}

async function kVisitCompletion(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await s
    .from('visits')
    .select('status')
    .gte('visit_date', since);
  const total = data?.length ?? 0;
  if (total === 0) return { code: 'visit_completion', value: null, value_text: 'No visits today' };
  const completed = (data ?? []).filter((r) => r.status === 'completed').length;
  const pct = Math.round((completed / total) * 1000) / 10;
  return { code: 'visit_completion', value: pct, context: { total, completed } };
}

async function kCustomerNoShow(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await s.from('visits').select('status').gte('visit_date', since);
  const total = data?.length ?? 0;
  if (total === 0) return { code: 'customer_no_show', value: null, value_text: 'No visits (7d)' };
  const noShows = (data ?? []).filter((r) => r.status === 'no_show').length;
  const pct = Math.round((noShows / total) * 1000) / 10;
  return { code: 'customer_no_show', value: pct };
}

async function kSameDayReschedule(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await s.from('visits').select('status').gte('visit_date', since);
  const total = data?.length ?? 0;
  if (total === 0) return { code: 'same_day_reschedule', value: null, value_text: 'No visits (7d)' };
  const rescheds = (data ?? []).filter((r) => r.status === 'rescheduled' || r.status === 'canceled').length;
  const pct = Math.round((rescheds / total) * 1000) / 10;
  return { code: 'same_day_reschedule', value: pct };
}

async function kInboxOpen(s: SupabaseClient): Promise<ComputedKpi> {
  const { count, data } = await s
    .from('support_conversations')
    .select('id, last_message_at', { count: 'exact' })
    .eq('status', 'open')
    .order('last_message_at', { ascending: true })
    .limit(50);
  const oldestMs = data?.[0]?.last_message_at
    ? Date.now() - new Date(data[0].last_message_at).getTime()
    : 0;
  const oldestHours = Math.round(oldestMs / 3600000);
  return {
    code: 'inbox_open',
    value: count ?? 0,
    context: { oldest_open_hours: oldestHours },
  };
}

async function kEdgeErrors(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await s
    .from('integration_logs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'error')
    .gte('created_at', since);
  return { code: 'edge_errors', value: count ?? 0 };
}

async function kWebhookDelivery(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await s
    .from('integration_logs')
    .select('status')
    .gte('created_at', since)
    .limit(2000);
  const total = data?.length ?? 0;
  if (total === 0) return { code: 'webhook_delivery', value: null, value_text: 'No traffic (1h)' };
  const ok = (data ?? []).filter((r) => r.status === 'success').length;
  const pct = Math.round((ok / total) * 1000) / 10;
  return { code: 'webhook_delivery', value: pct, context: { total, ok } };
}

async function kFailedPayments(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, data } = await s
    .from('invoices')
    .select('amount_cents', { count: 'exact' })
    .eq('status', 'failed')
    .gte('created_at', since);
  const dollars = Math.round(
    ((data ?? []).reduce((a, r) => a + (r.amount_cents ?? 0), 0)) / 100,
  );
  return {
    code: 'failed_payments',
    value: count ?? 0,
    value_text: `${count ?? 0} ($${dollars})`,
    context: { dollars },
  };
}

async function kPaymentRecovery(s: SupabaseClient): Promise<ComputedKpi> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: failed } = await s
    .from('invoices')
    .select('user_id')
    .eq('status', 'failed')
    .gte('created_at', since);
  if (!failed || failed.length === 0) {
    return { code: 'payment_recovery', value: null, value_text: 'No failures (7d)' };
  }
  const userIds = [...new Set(failed.map((f) => f.user_id))];
  const { data: paid } = await s
    .from('invoices')
    .select('user_id')
    .eq('status', 'paid')
    .in('user_id', userIds)
    .gte('paid_at', since);
  const recoveredUsers = new Set((paid ?? []).map((p) => p.user_id));
  const pct = Math.round((recoveredUsers.size / userIds.length) * 1000) / 10;
  return { code: 'payment_recovery', value: pct };
}

async function kCouponSpend(s: SupabaseClient): Promise<ComputedKpi> {
  // Approximation: bundle discount % weighted by MRR vs gross MRR
  const { data } = await s
    .from('subscriptions')
    .select('monthly_total_cents, bundle_discount_pct')
    .eq('status', 'active');
  const net = (data ?? []).reduce((a, r) => a + (r.monthly_total_cents ?? 0), 0);
  if (net === 0) return { code: 'coupon_spend', value: null, value_text: 'No active subs' };
  const discount = (data ?? []).reduce(
    (a, r) =>
      a + ((r.monthly_total_cents ?? 0) * (r.bundle_discount_pct ?? 0)) / 100,
    0,
  );
  const pct = Math.round((discount / (net + discount)) * 1000) / 10;
  return { code: 'coupon_spend', value: pct };
}

// External-API placeholders (turn 4 will replace these)
const EXTERNAL_PLACEHOLDERS: ComputedKpi[] = [
  { code: 'site_sessions', value: null, value_text: 'GA4 wiring pending' },
  { code: 'ads_spend_daily', value: null, value_text: 'Ads API pending' },
  { code: 'ads_ctr', value: null, value_text: 'Ads API pending' },
  { code: 'cac', value: null, value_text: 'Ads API pending' },
  { code: 'traffic_distribution', value: null, value_text: 'GA4 wiring pending' },
  { code: 'ig_growth', value: null, value_text: 'Meta API pending' },
  { code: 'fb_growth', value: null, value_text: 'Meta API pending' },
  { code: 'nextdoor', value: null, value_text: 'Manual entry' },
  { code: 'checkout_abandonment', value: null, value_text: 'Stripe sessions pending' },
  { code: 'funnel_drop', value: null, value_text: 'GA4 wiring pending' },
  { code: 'on_time_arrival', value: null, value_text: 'Jobber GraphQL pending' },
  { code: 'crew_utilization', value: null, value_text: 'Jobber GraphQL pending' },
  { code: 'churn_rate', value: null, value_text: 'Stripe events pending' },
  { code: 'ltv', value: null, value_text: 'Stripe events pending' },
  { code: 'nps', value: null, value_text: 'Manual / survey pending' },
  { code: 'google_reviews_weekly', value: null, value_text: 'GBP API pending' },
  { code: 'avg_star_rating', value: null, value_text: 'GBP API pending' },
  { code: 'rating_delta', value: null, value_text: 'GBP API pending' },
  { code: 'nextdoor_recs', value: null, value_text: 'Manual entry' },
  { code: 'gross_margin', value: null, value_text: 'Crew cost data pending' },
  { code: 'ai_assistant_uptime', value: null, value_text: 'Twilio status pending' },
  { code: 'message_delivery', value: null, value_text: 'Brevo/Twilio pending' },
];

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // Auth: service role via x-cron-key OR admin via JWT
  const cronKey = req.headers.get('x-cron-key');
  const isCron = cronKey && cronKey === SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (!isCron) {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
    const { data: ok } = await supabase.rpc('has_role', {
      _user_id: userData.user.id,
      _role: 'admin',
    });
    if (ok !== true) return jsonResponse({ ok: false, error: 'forbidden' }, 403);
  }

  try {
    // Load definitions
    const { data: defs, error: defErr } = await supabase
      .from('kpi_definitions')
      .select('code, direction, target_value, warn_threshold, critical_threshold')
      .eq('enabled', true);
    if (defErr) throw defErr;
    const defMap = new Map<string, KpiDef>(
      (defs ?? []).map((d) => [d.code, d as KpiDef]),
    );

    // Compute all DB-sourced KPIs
    const computers = [
      kActiveSubs, kMrr, kDailySignups, kSignupConversion, kPlanDistribution,
      kPromoRedemption, kVisitsToday, kVisitCompletion, kCustomerNoShow,
      kSameDayReschedule, kInboxOpen, kEdgeErrors, kWebhookDelivery,
      kFailedPayments, kPaymentRecovery, kCouponSpend,
    ];
    const results = await Promise.allSettled(computers.map((fn) => fn(supabase)));

    const computed: ComputedKpi[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') computed.push(r.value);
    }
    computed.push(...EXTERNAL_PLACEHOLDERS);

    // Build snapshot rows + detect status changes for alerting
    const snapRows = [];
    const alertsToFire: { code: string; severity: 'warn' | 'critical'; message: string; value: number | null }[] = [];

    // Latest prior snapshot per code (for transition detection)
    const codes = computed.map((c) => c.code);
    const { data: prior } = await supabase
      .from('kpi_snapshots')
      .select('kpi_code, status, computed_at')
      .in('kpi_code', codes)
      .order('computed_at', { ascending: false })
      .limit(500);
    const priorStatus = new Map<string, KpiStatus>();
    for (const p of prior ?? []) {
      if (!priorStatus.has(p.kpi_code)) priorStatus.set(p.kpi_code, p.status as KpiStatus);
    }

    for (const c of computed) {
      const def = defMap.get(c.code);
      if (!def) continue;
      const status = evaluate(def, c.value, c.explicit_status);
      snapRows.push({
        kpi_code: c.code,
        value: c.value,
        value_text: c.value_text ?? null,
        status,
        context: c.context ?? {},
      });
      const prev = priorStatus.get(c.code) ?? 'unknown';
      // Alert when crossing into warn or critical (or escalating)
      if (
        (status === 'critical' && prev !== 'critical') ||
        (status === 'warn' && prev !== 'warn' && prev !== 'critical')
      ) {
        alertsToFire.push({
          code: c.code,
          severity: status,
          value: c.value,
          message: `${c.code} → ${status.toUpperCase()} (value: ${c.value_text ?? c.value ?? 'n/a'})`,
        });
      }
      // Auto-resolve open alerts when back to green
      if (status === 'green' && (prev === 'warn' || prev === 'critical')) {
        await supabase
          .from('kpi_alerts')
          .update({ resolved_at: new Date().toISOString() })
          .eq('kpi_code', c.code)
          .is('resolved_at', null);
      }
    }

    // Insert snapshots
    if (snapRows.length > 0) {
      const { error: snapErr } = await supabase.from('kpi_snapshots').insert(snapRows);
      if (snapErr) throw new Error(`snapshot insert failed: ${snapErr.message}`);
    }

    // Fire alerts (async — don't block response)
    if (alertsToFire.length > 0) {
      await Promise.allSettled(
        alertsToFire.map(async (a) => {
          await supabase.from('kpi_alerts').insert({
            kpi_code: a.code,
            severity: a.severity,
            value: a.value,
            message: a.message,
            channels_notified: ['dashboard'],
          });
          // Dispatcher (fire-and-forget; SMS only for critical)
          await supabase.functions.invoke('kpi-alert-dispatcher', {
            body: { kpi_code: a.code, severity: a.severity, message: a.message },
          });
        }),
      );
    }

    return jsonResponse({
      ok: true,
      computed: snapRows.length,
      alerts_fired: alertsToFire.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[compute-kpi] failed:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
