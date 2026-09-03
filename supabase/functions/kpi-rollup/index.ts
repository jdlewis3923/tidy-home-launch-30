/**
 * kpi-rollup — computes the whole KPI picture and writes ONE kpi_snapshot row.
 *
 * Scheduled twice daily by pg_cron: 11:00 UTC (window 'am') and 22:00 UTC
 * (window 'pm'). Capacity metrics look FORWARD only; profit, funnel and trust
 * metrics look at TRAILING windows only — the two never share a day of data.
 *
 * Auth: service role via `x-cron-key`, or an admin JWT.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import {
  DEFAULT_CONSTANTS, KpiConstants, LAUNCH_DATE, LEAD_DAYS_FIELD, MINUTES_PER_SUB_WEEK,
  MINUTES_PER_VISIT, SERVICE_CODES, SERVICE_DB_KEYS, SERVICE_NAMES, ServiceCode,
  FUNNEL_ZIPS, DAY_MS, daysAgoIso, monthsElapsed, ratio, round, ymd,
} from '../_shared/kpi-engine.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GP_MARGIN = DEFAULT_CONSTANTS.gp_sub / DEFAULT_CONSTANTS.rev_sub;

type Row = Record<string, unknown>;

function matchesService(code: ServiceCode, value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return SERVICE_DB_KEYS[code].includes(value.toLowerCase());
}

function subHasService(sub: Row, code: ServiceCode): boolean {
  const services = (sub.services as string[] | null) ?? [];
  if (code === 'house_clean') return services.some((s) => matchesService(code, s));
  const car = services.some((s) => ['car', 'detailing', 'shine', 'car_wash', 'wash'].includes(String(s).toLowerCase()));
  if (!car) return false;
  const csc = String(sub.car_service_code ?? '').toLowerCase();
  if (code === 'car_wash') return csc ? matchesService('car_wash', csc) : false;
  return csc ? matchesService('car_detail', csc) : true;
}

async function loadConstants(s: SupabaseClient): Promise<KpiConstants> {
  const { data } = await s.from('kpi_constant').select('*').limit(1).maybeSingle();
  return { ...DEFAULT_CONSTANTS, ...((data ?? {}) as Partial<KpiConstants>) };
}

// ───────────────────────── PROFIT ─────────────────────────
async function profitBlock(s: SupabaseClient, c: KpiConstants) {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [{ data: subs }, { data: paidMtd }, { data: paidAll }, { data: drops }, { data: plan }] =
    await Promise.all([
      s.from('subscriptions').select('id, monthly_total_cents, services, car_service_code, created_at, status, canceled_at'),
      s.from('invoices').select('amount_cents').eq('status', 'paid').gte('paid_at', monthStart.toISOString()),
      s.from('invoices').select('amount_cents').eq('status', 'paid').gte('paid_at', `${LAUNCH_DATE}T00:00:00Z`),
      s.from('hanger_drop').select('cost, zip, quantity, dropped_on'),
      s.from('kpi_plan').select('*').order('plan_month'),
    ]);

  const active = (subs ?? []).filter((r) => r.status === 'active');
  const mrr = round(active.reduce((a, r) => a + ((r.monthly_total_cents as number) ?? 0), 0) / 100);
  const gpMtd = round(((paidMtd ?? []).reduce((a, r) => a + ((r.amount_cents as number) ?? 0), 0) / 100) * GP_MARGIN);
  const cumGp = round(((paidAll ?? []).reduce((a, r) => a + ((r.amount_cents as number) ?? 0), 0) / 100) * GP_MARGIN);
  const cumSpend = round((drops ?? []).reduce((a, r) => a + Number(r.cost ?? 0), 0));

  const months = monthsElapsed();
  const cumProfitActual = round(cumGp - cumSpend - months * c.overhead_mo);

  const monthLabel = new Date().toISOString().slice(0, 7);
  const planRows = (plan ?? []) as Row[];
  const current = planRows.find((r) => r.month_label === monthLabel);
  const planMonth = (current?.plan_month as number) ?? null;
  const cumPlanned = current ? Number(current.cum_profit_planned) : null;

  const deltaDollars = cumPlanned === null ? null : round(cumProfitActual - cumPlanned);
  const deltaPct = cumPlanned ? round((cumProfitActual - cumPlanned) / Math.abs(cumPlanned) * 100, 1) : null;

  // Where does today's actual profit sit on the planned curve?
  let daysBehind: number | null = null;
  if (planRows.length) {
    const pts = planRows.map((r) => ({
      v: Number(r.cum_profit_planned),
      // each plan row is achieved by the END of its month
      t: new Date(`${r.month_label as string}-01T00:00:00Z`).getTime() + 30.4375 * DAY_MS,
    }));
    let curveMs: number | null = null;
    if (cumProfitActual <= pts[0].v) {
      curveMs = pts[0].t;
    } else if (cumProfitActual >= pts[pts.length - 1].v) {
      curveMs = pts[pts.length - 1].t;
    } else {
      for (let i = 1; i < pts.length; i++) {
        if (cumProfitActual <= pts[i].v) {
          const span = pts[i].v - pts[i - 1].v || 1;
          const frac = (cumProfitActual - pts[i - 1].v) / span;
          curveMs = pts[i - 1].t + frac * (pts[i].t - pts[i - 1].t);
          break;
        }
      }
    }
    if (curveMs !== null) daysBehind = round((Date.now() - curveMs) / DAY_MS, 1);
  }

  // churn (trailing 30d) — used by profit rules
  const since30 = Date.now() - 30 * DAY_MS;
  const canceled30 = (subs ?? []).filter(
    (r) => r.canceled_at && new Date(r.canceled_at as string).getTime() >= since30,
  ).length;
  const churnDen = active.length + canceled30;
  const churn30 = ratio(canceled30, churnDen);

  const adds30 = (subs ?? []).filter(
    (r) => new Date(r.created_at as string).getTime() >= since30,
  ).length;
  const addsYesterday = (subs ?? []).filter((r) => {
    const t = new Date(r.created_at as string).getTime();
    return t >= Date.now() - 2 * DAY_MS && t < Date.now() - DAY_MS;
  }).length;
  const churnYesterday = (subs ?? []).filter((r) => {
    if (!r.canceled_at) return false;
    const t = new Date(r.canceled_at as string).getTime();
    return t >= Date.now() - 2 * DAY_MS && t < Date.now() - DAY_MS;
  }).length;

  return {
    profit: {
      active_subs: active.length,
      mrr,
      gp_month_to_date: gpMtd,
      cum_gp_since_launch: cumGp,
      cum_marketing_spend: cumSpend,
      months_elapsed: round(months, 2),
      cum_profit_actual: cumProfitActual,
      plan_month: planMonth,
      cum_profit_planned: cumPlanned,
      plan_delta_dollars: deltaDollars,
      plan_delta_pct: deltaPct,
      days_behind_plan: daysBehind,
      churn_rate_30d: churn30 === null ? null : round(churn30 * 100, 2),
      churn_sample_30d: churnDen,
      adds_30d: adds30,
      adds_yesterday: addsYesterday,
      churn_yesterday: churnYesterday,
    },
    _subs: subs ?? [],
    _cumSpend: cumSpend,
    _drops: (drops ?? []) as Row[],
    _cumGp: cumGp,
  };
}

// ───────────────────────── CAPACITY (forward horizon only) ─────────────────────────
async function capacityBlock(s: SupabaseClient, c: KpiConstants, subs: Row[]) {
  const now = Date.now();
  const in14 = new Date(now + 14 * DAY_MS).toISOString();
  const in72 = new Date(now + 3 * DAY_MS).toISOString();

  const [{ data: pros }, { data: assignments }, { data: booked }, { data: unassigned }, { data: pipeline }] =
    await Promise.all([
      s.from('applicants')
        .select('id, first_name, last_name, contractor_id, service, wash_only, available_minutes_week, current_stage, stage_entered_at, compliance_complete, training_passed, equipment_approved, contracts_signed, stripe_connect_complete'),
      s.from('pro_service_assignments').select('applicant_id, contractor_id, service, time_share, active').eq('active', true),
      s.from('pro_visits').select('contractor_id, service_type, scheduled_at, status')
        .gte('scheduled_at', new Date(now).toISOString()).lte('scheduled_at', in14),
      s.from('pro_visits').select('id, jobber_visit_id, service_type, scheduled_at, customer_name, contractor_id, status')
        .is('contractor_id', null).gte('scheduled_at', new Date(now).toISOString()).lte('scheduled_at', in72),
      s.from('applicants').select('current_stage, stage_entered_at'),
    ]);

  const certified = (pros ?? []).filter(
    (p) => p.contractor_id &&
      p.compliance_complete && p.training_passed && p.equipment_approved &&
      p.contracts_signed && p.stripe_connect_complete,
  );

  const services: Record<string, unknown> = {};
  for (const code of SERVICE_CODES) {
    const eligible = certified.filter((p) => {
      const assigned = (assignments ?? []).filter(
        (a) => a.applicant_id === p.id || a.contractor_id === p.contractor_id,
      );
      if (assigned.length) return assigned.some((a) => matchesService(code, a.service));
      if (code === 'car_detail' && p.wash_only) return false;
      return matchesService(code, p.service) || code === 'house_clean';
    });

    const shareFor = (p: Row) => {
      const a = (assignments ?? []).find(
        (x) => (x.applicant_id === p.id || x.contractor_id === p.contractor_id) && matchesService(code, x.service),
      );
      const share = a ? Number(a.time_share ?? 1) : 1;
      return share > 1 ? share / 100 : share;
    };

    const capacityMinutes = round(
      eligible.reduce((a, p) => a + (Number(p.available_minutes_week) || 0) * shareFor(p), 0),
    );

    const bookedMinutes = round(
      (booked ?? []).filter((v) => matchesService(code, v.service_type) && v.status !== 'canceled').length *
        MINUTES_PER_VISIT[code] / 2,
    );

    const activeSubs = subs.filter((r) => r.status === 'active' && subHasService(r, code)).length;
    const since28 = now - 28 * DAY_MS;
    const new28 = subs.filter((r) => subHasService(r, code) && new Date(r.created_at as string).getTime() >= since28).length;
    const churned28 = subs.filter(
      (r) => subHasService(r, code) && r.canceled_at && new Date(r.canceled_at as string).getTime() >= since28,
    ).length;
    const weeklyNetAdds = round((new28 - churned28) / 4, 2);

    const avgMinutesPerSubWeek = MINUTES_PER_SUB_WEEK[code];
    const capacitySubsEquiv = round(capacityMinutes / avgMinutesPerSubWeek, 1);
    const headroom = capacitySubsEquiv - activeSubs;
    const runwayWeeks = weeklyNetAdds > 0 ? round(headroom / weeklyNetAdds, 1) : null;

    const leadDays = c[LEAD_DAYS_FIELD[code]];
    const hireByMs = runwayWeeks === null ? null : now + runwayWeeks * 7 * DAY_MS - leadDays * DAY_MS - c.hire_buffer_days * DAY_MS;

    services[code] = {
      service_name: SERVICE_NAMES[code],
      pros_certified: eligible.length,
      capacity_minutes_week: capacityMinutes,
      booked_minutes_week_next14: bookedMinutes,
      utilization_pct: capacityMinutes ? round((bookedMinutes / capacityMinutes) * 100, 1) : null,
      weekly_net_adds: weeklyNetAdds,
      avg_minutes_per_sub_week: avgMinutesPerSubWeek,
      capacity_subs_equiv: capacitySubsEquiv,
      active_subs: activeSubs,
      runway_weeks: runwayWeeks,
      hire_by_date: hireByMs === null ? null : ymd(new Date(hireByMs)),
      lead_days: leadDays,
      buffer_days: c.hire_buffer_days,
    };
  }

  const stageMap = new Map<string, { count: number; totalDays: number }>();
  for (const p of pipeline ?? []) {
    const stage = String(p.current_stage ?? 'unknown');
    const days = p.stage_entered_at ? (now - new Date(p.stage_entered_at as string).getTime()) / DAY_MS : 0;
    const e = stageMap.get(stage) ?? { count: 0, totalDays: 0 };
    e.count += 1;
    e.totalDays += days;
    stageMap.set(stage, e);
  }

  return {
    capacity: {
      services,
      unassigned_jobs_72h: (unassigned ?? []).length,
      unassigned_jobs: (unassigned ?? []).map((v) => ({
        jobber_visit_id: v.jobber_visit_id,
        service_type: v.service_type,
        scheduled_at: v.scheduled_at,
        customer_name: v.customer_name,
      })),
      pipeline: [...stageMap.entries()].map(([stage, e]) => ({
        stage, count: e.count, avg_days_in_stage: round(e.totalDays / e.count, 1),
      })),
    },
  };
}

// ───────────────────────── FUNNEL (trailing windows only) ─────────────────────────
async function funnelBlock(s: SupabaseClient, c: KpiConstants, drops: Row[]) {
  const [{ data: scans }] = await Promise.all([
    s.from('qr_scan').select('zip, scanned_at, converted_quote, converted_paid').gte('scanned_at', daysAgoIso(120)),
  ]);
  const { data: lastScans } = await s.from('qr_scan').select('zip, scanned_at').order('scanned_at', { ascending: false }).limit(500);

  const doors: Record<string, number> = {
    '33156': c.doors_33156, '33183': c.doors_33183, '33186': c.doors_33186,
  };
  const now = Date.now();

  const build = (zip: string | null) => {
    const inZip = <T extends Row>(rows: T[]) => (zip ? rows.filter((r) => r.zip === zip) : rows);
    const zScans = inZip((scans ?? []) as Row[]);
    const zDrops = inZip(drops);
    const hangersCum = zDrops.reduce((a, r) => a + Number(r.quantity ?? 0), 0);
    const spend = zDrops.reduce((a, r) => a + Number(r.cost ?? 0), 0);
    const scans30 = zScans.filter((r) => new Date(r.scanned_at as string).getTime() >= now - 30 * DAY_MS);
    const scans7 = zScans.filter((r) => new Date(r.scanned_at as string).getTime() >= now - 7 * DAY_MS);
    const quoteStarts = scans30.filter((r) => r.converted_quote).length;
    const paid30 = scans30.filter((r) => r.converted_paid).length;
    const last = inZip((lastScans ?? []) as Row[])[0];
    const doorsFor = zip ? (doors[zip] ?? 0) : Object.values(doors).reduce((a, b) => a + b, 0);
    return {
      hangers_dropped_cum: hangersCum,
      marketing_spend_cum: round(spend),
      scans_30d: scans30.length,
      scans_7d: scans7.length,
      scan_rate: hangersCum ? round((scans30.length / hangersCum) * 100, 2) : null,
      quote_starts_30d: quoteStarts,
      quotes_completed_30d: quoteStarts,
      paid_30d: paid30,
      scan_to_paid_pct: scans30.length ? round((paid30 / scans30.length) * 100, 2) : null,
      cac: paid30 ? round(spend / paid30) : null,
      days_since_last_scan: last ? round((now - new Date(last.scanned_at as string).getTime()) / DAY_MS, 1) : null,
      coverage_passes: doorsFor ? round(hangersCum / doorsFor, 2) : null,
    };
  };

  const zips: Record<string, unknown> = {};
  for (const z of FUNNEL_ZIPS) zips[z] = build(z);
  return { funnel: { zips, total: build(null) } };
}

// ───────────────────────── TRUST (trailing windows only) ─────────────────────────
async function trustBlock(s: SupabaseClient) {
  const since30 = daysAgoIso(30);
  const [{ data: reviews }, { data: ratings }, { data: visits }, { data: attaches }] = await Promise.all([
    s.from('reviews').select('stars, reviewer_name, posted_at, status').gte('posted_at', since30),
    s.from('visit_ratings').select('stars, rating, contractor_id, created_at, excluded_from_average').gte('created_at', since30),
    s.from('pro_visits').select('id, contractor_id, status, completed_at, customer_rating, condition_flagged, photos_count, photos_expected')
      .eq('status', 'complete').gte('completed_at', since30),
    s.from('addon_attaches').select('id, attached_at').gte('attached_at', since30),
  ]);

  const named5 = (reviews ?? []).filter(
    (r) => r.stars === 5 && String(r.reviewer_name ?? '').trim().length > 0 && r.status !== 'rejected',
  ).length;

  const scored = (ratings ?? [])
    .filter((r) => !r.excluded_from_average)
    .map((r) => ({ ...r, v: Number(r.stars ?? r.rating ?? 0) }))
    .filter((r) => r.v > 0);
  const avg30 = scored.length ? round(scored.reduce((a, r) => a + r.v, 0) / scored.length, 2) : null;
  const le3 = scored.filter((r) => r.v <= 3).length;

  const completed = visits ?? [];
  const perfect = completed.filter(
    (v) => !v.condition_flagged && (Number(v.customer_rating ?? 5) >= 4.5) &&
      (Number(v.photos_count ?? 0) >= Number(v.photos_expected ?? 0)),
  ).length;

  // per-Pro last 10 ratings
  const { data: recent } = await s.from('visit_ratings')
    .select('contractor_id, stars, rating, created_at, excluded_from_average')
    .not('contractor_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(2000);
  const byPro = new Map<string, number[]>();
  for (const r of recent ?? []) {
    if (r.excluded_from_average) continue;
    const v = Number(r.stars ?? r.rating ?? 0);
    if (!v) continue;
    const id = String(r.contractor_id);
    const arr = byPro.get(id) ?? [];
    if (arr.length < 10) arr.push(v);
    byPro.set(id, arr);
  }
  const proIds = [...byPro.keys()];
  const { data: proRows } = proIds.length
    ? await s.from('applicants').select('contractor_id, first_name, last_name').in('contractor_id', proIds)
    : { data: [] as Row[] };
  const nameFor = (id: string) => {
    const p = (proRows ?? []).find((x) => String(x.contractor_id) === id);
    return p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : id;
  };

  return {
    trust: {
      named_5star_30d: named5,
      avg_rating_30d: avg30,
      ratings_le3_30d: le3,
      ratings_sample_30d: scored.length,
      completed_jobs_30d: completed.length,
      first_visit_perfect_pct_30d: completed.length ? round((perfect / completed.length) * 100, 1) : null,
      addon_attach_rate_30d: completed.length ? round(((attaches ?? []).length / completed.length) * 100, 1) : null,
      pros: [...byPro.entries()].map(([id, arr]) => ({
        contractor_id: id,
        name: nameFor(id),
        sample: arr.length,
        last10_avg_rating: round(arr.reduce((a, b) => a + b, 0) / arr.length, 2),
      })),
    },
  };
}

// ───────────────────────── PLUMBING ─────────────────────────
async function plumbingBlock(s: SupabaseClient) {
  const since30 = daysAgoIso(30);
  const in30 = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10);

  const [{ data: bonuses }, { data: invoices }, { data: coi }] = await Promise.all([
    s.from('pro_bonuses').select('pro_id, amount_cents, status').neq('status', 'paid'),
    s.from('invoices').select('status, created_at').gte('created_at', since30),
    s.from('applicants').select('first_name, last_name, coi_expires_at, contractor_id')
      .not('coi_expires_at', 'is', null).lte('coi_expires_at', in30),
  ]);

  const owedIds = [...new Set((bonuses ?? []).map((b) => String(b.pro_id)))].filter(Boolean);
  const { data: owedPros } = owedIds.length
    ? await s.from('applicants').select('first_name, last_name, contractor_id, stripe_connect_complete').in('contractor_id', owedIds)
    : { data: [] as Row[] };
  const blocked = (owedPros ?? []).filter((p) => !p.stripe_connect_complete);

  const paid = (invoices ?? []).filter((r) => r.status === 'paid').length;
  const failed = (invoices ?? []).filter((r) => r.status === 'failed').length;

  return {
    plumbing: {
      pros_payouts_disabled_with_owed_bonus: blocked.length,
      pros_payouts_disabled_names: blocked.map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()),
      card_decline_rate_30d: paid + failed ? round((failed / (paid + failed)) * 100, 2) : null,
      card_sample_30d: paid + failed,
      coi_expiring_30d: (coi ?? []).length,
      coi_expiring_names: (coi ?? []).map((p) => `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()),
      zapier_task_usage_pct: null,
    },
  };
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
  try { body = await req.json(); } catch { /* cron may send no body */ }
  const win = body.window === 'am' || body.window === 'pm'
    ? (body.window as 'am' | 'pm')
    : (new Date().getUTCHours() < 16 ? 'am' : 'pm');

  try {
    const c = await loadConstants(supabase);
    const p = await profitBlock(supabase, c);
    const [cap, fun, tr, pl] = await Promise.all([
      capacityBlock(supabase, c, p._subs),
      funnelBlock(supabase, c, p._drops),
      trustBlock(supabase),
      plumbingBlock(supabase),
    ]);

    // ── composites ──
    const svc = cap.capacity.services as Record<string, Row>;
    const runways = Object.values(svc)
      .map((v) => {
        const rw = v.runway_weeks as number | null;
        if (rw === null) return null;
        return round(rw - (v.lead_days as number) / 7 - (v.buffer_days as number) / 7, 1);
      })
      .filter((v): v is number => v !== null);

    const spend90 = p._drops
      .filter((d) => new Date(String(d.dropped_on)).getTime() >= Date.now() - 90 * DAY_MS)
      .reduce((a, d) => a + Number(d.cost ?? 0), 0);
    const { data: newSubs90 } = await supabase.from('subscriptions')
      .select('monthly_total_cents').gte('created_at', daysAgoIso(90)).eq('status', 'active');
    const gp90 = round(((newSubs90 ?? []).reduce((a, r) => a + ((r.monthly_total_cents as number) ?? 0), 0) / 100) * GP_MARGIN * 3);

    const trust = tr.trust as Row;
    const metrics = {
      window: win,
      computed_at: new Date().toISOString(),
      constants: c,
      ...p.profit && { profit: p.profit },
      ...cap,
      ...fun,
      ...tr,
      ...pl,
      composites: {
        runway_to_capacity_weeks: runways.length ? Math.min(...runways) : null,
        marketing_efficiency: spend90 ? round(gp90 / spend90, 2) : null,
        marketing_spend_90d: round(spend90),
        gp_90d_new_cohort: gp90,
        trust_index: (trust.completed_jobs_30d as number)
          ? round((trust.named_5star_30d as number) / (trust.completed_jobs_30d as number), 3)
          : null,
      },
    };

    const { data: snap, error } = await supabase.from('kpi_snapshot')
      .insert({ window: win, metrics, computed_by: 'kpi-rollup' })
      .select('id, captured_at')
      .single();
    if (error) throw error;

    return jsonResponse({ ok: true, snapshot_id: snap.id, window: win, captured_at: snap.captured_at });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[kpi-rollup] failed:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
