/**
 * kpi-alerts — evaluates every enabled alert_rule against the newest
 * kpi_snapshot and writes alert_event rows.
 *
 * Runs right after kpi-rollup on the same pg_cron schedule (11:00 / 22:00 UTC).
 *
 * Rules:
 *  - only rules whose digest matches the current window (or 'both') evaluate
 *  - min_sample below threshold  -> skip silently
 *  - an open event for the same rule inside cooldown_hours -> skip
 *  - ANTI-COLLISION: of the events that fired, at most ONE per domain is left
 *    un-suppressed (lowest priority number wins, ties red > amber > info).
 *    Suppressed ones are still inserted with suppressed_in_digest = true, so
 *    nothing is lost. UNASSIGNED_JOB ignores the grouping and always emits.
 *  - capacity rules read FORWARD-horizon metrics only; profit / funnel / trust
 *    rules read TRAILING-window metrics only.
 *  - auto-resolve: any open event whose condition is no longer true is closed.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { DAY_MS, num, round } from '../_shared/kpi-engine.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

type Row = Record<string, any>;

interface Verdict {
  fires: boolean;
  headline?: string;
  detail?: string;
  metric_value?: number | null;
  threshold_value?: number | null;
  /** Sample size used for the min_sample gate. */
  sample?: number;
}

const SEVERITY_RANK: Record<string, number> = { red: 0, amber: 1, info: 2 };

/** Every evaluator receives the snapshot metrics and the rule row. */
type Evaluator = (m: Row, rule: Row) => Verdict;

const quiet: Verdict = { fires: false };

function svcEntries(m: Row): Array<[string, Row]> {
  return Object.entries((m.capacity?.services ?? {}) as Record<string, Row>);
}

const EVALUATORS: Record<string, Evaluator> = {
  // ── CAPACITY (forward horizon only) ──
  HIRE_NOW_HOUSE: (m) => {
    const s = m.capacity?.services?.house_clean as Row | undefined;
    const rw = num(s?.runway_weeks);
    if (rw === null) return quiet;
    const eff = rw - (s!.lead_days as number) / 7 - (s!.buffer_days as number) / 7;
    return eff < 5 - (s!.lead_days as number) / 7
      ? {
          fires: true,
          headline: 'House-cleaning capacity runs out in under 5 weeks',
          detail: `Runway ${rw} weeks · hire by ${s!.hire_by_date ?? 'now'} · ${s!.pros_certified} certified Pro(s), ${s!.active_subs} active subs.`,
          metric_value: rw, threshold_value: 5,
        }
      : quiet;
  },
  HIRE_NOW_DETAIL: (m) => {
    const s = m.capacity?.services?.car_detail as Row | undefined;
    const rw = num(s?.runway_weeks);
    if (num(s?.active_subs) === 0 && (s?.pros_certified ?? 0) === 0) {
      return { fires: true, headline: 'Detail-certified Pro needed', detail: 'No detail-certified Pro is live yet. Detail lead time is 5 weeks.', metric_value: 0, threshold_value: 1 };
    }
    if (rw === null) return quiet;
    const eff = rw - (s!.lead_days as number) / 7 - (s!.buffer_days as number) / 7;
    return eff < 0
      ? { fires: true, headline: 'Detail-certified Pro needed', detail: `Detail runway ${rw} weeks · hire by ${s!.hire_by_date ?? 'now'}.`, metric_value: rw, threshold_value: (s!.lead_days as number) / 7 }
      : quiet;
  },
  UNASSIGNED_JOB: (m) => {
    const n = num(m.capacity?.unassigned_jobs_72h) ?? 0;
    if (n <= 0) return quiet;
    const list = ((m.capacity?.unassigned_jobs ?? []) as Row[])
      .slice(0, 5)
      .map((v) => `${v.customer_name ?? 'Job'} — ${String(v.scheduled_at ?? '').slice(0, 16).replace('T', ' ')}`)
      .join('; ');
    return { fires: true, headline: `${n} job(s) within 72h have no Pro assigned`, detail: list, metric_value: n, threshold_value: 0 };
  },
  PRO_OVERBOOKED: (m) => {
    const over = svcEntries(m).filter(([, s]) => (num(s.utilization_pct) ?? 0) > 85);
    if (!over.length) return quiet;
    const worst = over.sort((a, b) => (num(b[1].utilization_pct) ?? 0) - (num(a[1].utilization_pct) ?? 0))[0];
    return {
      fires: true,
      headline: 'A Pro is over 85% booked for the next 14 days',
      detail: `${worst[1].service_name}: ${worst[1].utilization_pct}% booked over the next 14 days.`,
      metric_value: num(worst[1].utilization_pct), threshold_value: 85,
    };
  },
  PIPELINE_DRY: (m) => {
    const pipeline = (m.capacity?.pipeline ?? []) as Row[];
    const inFlight = pipeline
      .filter((p) => !['rejected', 'active', 'hired', 'withdrawn'].includes(String(p.stage)))
      .reduce((a, p) => a + (num(p.count) ?? 0), 0);
    const need = svcEntries(m).some(([, s]) => {
      const rw = num(s.runway_weeks);
      return rw !== null && rw <= 60 / 7;
    });
    return need && inFlight === 0
      ? { fires: true, headline: 'Hiring pipeline cannot cover the next 60 days', detail: 'No applicants in flight while capacity runs out inside 60 days.', metric_value: inFlight, threshold_value: 1 }
      : quiet;
  },

  // ── PROFIT (trailing windows only) ──
  BEHIND_PLAN: (m) => {
    const d = num(m.profit?.plan_delta_dollars);
    if (d === null || d >= 0) return quiet;
    return {
      fires: true,
      headline: `Cumulative profit is behind plan by $${Math.abs(round(d)).toLocaleString()}`,
      detail: `Actual $${round(num(m.profit?.cum_profit_actual) ?? 0).toLocaleString()} vs plan $${round(num(m.profit?.cum_profit_planned) ?? 0).toLocaleString()} · ${m.profit?.days_behind_plan ?? '?'} days behind the curve.`,
      metric_value: round(d), threshold_value: 0,
    };
  },
  AHEAD_PLAN: (m) => {
    const d = num(m.profit?.plan_delta_dollars);
    if (d === null || d <= 0) return quiet;
    return {
      fires: true,
      headline: `Ahead of the plan curve by $${round(d).toLocaleString()}`,
      detail: 'Pull the next hire forward.',
      metric_value: round(d), threshold_value: 0,
    };
  },
  CHURN_SPIKE: (m) => {
    const v = num(m.profit?.churn_rate_30d);
    const sample = num(m.profit?.churn_sample_30d) ?? 0;
    if (v === null) return { fires: false, sample };
    return v > 6
      ? { fires: true, headline: `30-day churn at ${v}%`, detail: `Above the 6% ceiling on a sample of ${sample}.`, metric_value: v, threshold_value: 6, sample }
      : { fires: false, sample };
  },

  // ── FUNNEL (trailing windows only) ──
  ZIP_UNDERPERFORM: (m) => {
    const zips = Object.entries((m.funnel?.zips ?? {}) as Record<string, Row>)
      .map(([zip, z]) => ({ zip, pct: num(z.scan_to_paid_pct), scans: num(z.scans_30d) ?? 0 }))
      .filter((z) => z.pct !== null && z.scans > 0);
    const sample = zips.reduce((a, z) => a + z.scans, 0);
    if (zips.length < 2) return { fires: false, sample };
    const best = Math.max(...zips.map((z) => z.pct!));
    const worst = zips.sort((a, b) => a.pct! - b.pct!)[0];
    return best > 0 && worst.pct! < best * 0.6
      ? { fires: true, headline: `ZIP ${worst.zip} converts below 60% of the best ZIP`, detail: `${worst.zip} at ${worst.pct}% scan→paid vs best ${round(best, 2)}%.`, metric_value: worst.pct, threshold_value: round(best * 0.6, 2), sample }
      : { fires: false, sample };
  },
  CAC_DRIFT: (m) => {
    const cac = num(m.funnel?.total?.cac);
    const sample = num(m.funnel?.total?.paid_30d) ?? 0;
    if (cac === null) return { fires: false, sample };
    return cac > 55
      ? { fires: true, headline: `CAC at $${cac}`, detail: 'Above the $55 ceiling. Pause the next print run.', metric_value: cac, threshold_value: 55, sample }
      : { fires: false, sample };
  },
  SCAN_DROUGHT: (m) => {
    const dry = Object.entries((m.funnel?.zips ?? {}) as Record<string, Row>)
      .filter(([, z]) => (num(z.hangers_dropped_cum) ?? 0) > 0 && ((num(z.days_since_last_scan) ?? 999) >= 7));
    if (!dry.length) return quiet;
    return {
      fires: true,
      headline: `No scans for 7+ days in ZIP ${dry.map(([z]) => z).join(', ')}`,
      detail: 'Distribution likely failed. Spot-check the drop.',
      metric_value: num(dry[0][1].days_since_last_scan), threshold_value: 7,
    };
  },
  TERRITORY_SATURATED: (m) => {
    const sat = Object.entries((m.funnel?.zips ?? {}) as Record<string, Row>)
      .filter(([, z]) => (num(z.coverage_passes) ?? 0) > 2.5);
    if (!sat.length) return quiet;
    return {
      fires: true,
      headline: `ZIP ${sat.map(([z]) => z).join(', ')} passed 2.5 coverage passes`,
      detail: 'Expand ZIPs.',
      metric_value: num(sat[0][1].coverage_passes), threshold_value: 2.5,
    };
  },

  // ── TRUST (trailing windows only) ──
  REVIEW_VELOCITY: (m) => {
    const v = num(m.trust?.named_5star_30d) ?? 0;
    return v < 4
      ? { fires: true, headline: `Only ${v} named 5-star review(s) in 30 days`, detail: 'Proof bands stay empty. Run the ask script.', metric_value: v, threshold_value: 4 }
      : quiet;
  },
  RATING_DIP: (m) => {
    const pros = ((m.trust?.pros ?? []) as Row[]).filter((p) => (num(p.sample) ?? 0) >= 10);
    const sample = pros.reduce((a, p) => a + (num(p.sample) ?? 0), 0);
    const dipped = pros.filter((p) => (num(p.last10_avg_rating) ?? 5) < 4.3);
    if (!dipped.length) return { fires: false, sample };
    return {
      fires: true,
      headline: `${dipped[0].name} last 10 jobs average ${dipped[0].last10_avg_rating}`,
      detail: 'Ride along on the next visit.',
      metric_value: num(dipped[0].last10_avg_rating), threshold_value: 4.3, sample,
    };
  },
  FIRST_VISIT_FAIL: (m) => {
    const v = num(m.trust?.first_visit_perfect_pct_30d);
    const sample = num(m.trust?.completed_jobs_30d) ?? 0;
    if (v === null) return { fires: false, sample };
    return v < 90
      ? { fires: true, headline: `First-visit-perfect rate at ${v}%`, detail: 'Review checklist compliance.', metric_value: v, threshold_value: 90, sample }
      : { fires: false, sample };
  },

  // ── PLUMBING ──
  ZAPIER_QUOTA: (m) => {
    const v = num(m.plumbing?.zapier_task_usage_pct);
    if (v === null) return quiet;
    return v > 90
      ? { fires: true, headline: `Zapier at ${v}% of the 750-task plan`, detail: 'Turn off non-critical Zaps or upgrade.', metric_value: v, threshold_value: 90 }
      : quiet;
  },
  CONNECT_BLOCKED: (m) => {
    const n = num(m.plumbing?.pros_payouts_disabled_with_owed_bonus) ?? 0;
    return n > 0
      ? { fires: true, headline: `${n} Pro(s) owed money with payouts disabled`, detail: ((m.plumbing?.pros_payouts_disabled_names ?? []) as string[]).join(', '), metric_value: n, threshold_value: 0 }
      : quiet;
  },
  CARD_DECLINE: (m) => {
    const v = num(m.plumbing?.card_decline_rate_30d);
    const sample = num(m.plumbing?.card_sample_30d) ?? 0;
    if (v === null) return { fires: false, sample };
    return v > 3
      ? { fires: true, headline: `Card decline rate at ${v}%`, detail: `Above 3% on ${sample} charges. Run dunning.`, metric_value: v, threshold_value: 3, sample }
      : { fires: false, sample };
  },
  INSURANCE_EXPIRY: (m) => {
    const n = num(m.plumbing?.coi_expiring_30d) ?? 0;
    return n > 0
      ? { fires: true, headline: `${n} COI(s) expire within 30 days`, detail: ((m.plumbing?.coi_expiring_names ?? []) as string[]).join(', '), metric_value: n, threshold_value: 0 }
      : quiet;
  },
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
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
    if (!snap) return jsonResponse({ ok: false, error: 'no snapshot yet' }, 409);

    const win = (body.window === 'am' || body.window === 'pm')
      ? (body.window as 'am' | 'pm')
      : ((snap.window as 'am' | 'pm') ?? (new Date().getUTCHours() < 16 ? 'am' : 'pm'));
    const m = (snap.metrics ?? {}) as Row;

    const { data: rules } = await supabase.from('alert_rule')
      .select('*').eq('enabled', true).order('priority');

    const { data: openEvents } = await supabase.from('alert_event')
      .select('id, rule_code, fired_at, status').eq('status', 'open');

    const verdicts = new Map<string, Verdict>();
    const candidates: Array<{ rule: Row; v: Verdict }> = [];
    let skippedSample = 0;
    let skippedCooldown = 0;

    for (const rule of (rules ?? []) as Row[]) {
      const evaluator = EVALUATORS[String(rule.code)];
      if (!evaluator) continue;
      const v = evaluator(m, rule);
      verdicts.set(String(rule.code), v);

      const digest = String(rule.digest ?? 'both');
      if (digest !== 'both' && digest !== win) continue;
      if (!v.fires) continue;

      const minSample = Number(rule.min_sample ?? 0);
      if (minSample > 0 && (v.sample ?? 0) < minSample) { skippedSample++; continue; }

      const cooldownMs = Number(rule.cooldown_hours ?? 72) * 3600_000;
      const recentOpen = (openEvents ?? []).some(
        (e) => e.rule_code === rule.code && Date.now() - new Date(e.fired_at as string).getTime() < cooldownMs,
      );
      if (recentOpen) { skippedCooldown++; continue; }

      candidates.push({ rule, v });
    }

    // ── ANTI-COLLISION: one un-suppressed event per domain per run ──
    const winners = new Set<Row>();
    const byDomain = new Map<string, Array<{ rule: Row; v: Verdict }>>();
    for (const c of candidates) {
      if (c.rule.code === 'UNASSIGNED_JOB') { winners.add(c.rule); continue; } // always emits
      const d = String(c.rule.domain ?? 'other');
      const list = byDomain.get(d) ?? [];
      list.push(c);
      byDomain.set(d, list);
    }
    for (const list of byDomain.values()) {
      list.sort((a, b) => {
        const p = Number(a.rule.priority ?? 9) - Number(b.rule.priority ?? 9);
        if (p !== 0) return p;
        return (SEVERITY_RANK[String(a.rule.severity)] ?? 9) - (SEVERITY_RANK[String(b.rule.severity)] ?? 9);
      });
      winners.add(list[0].rule);
    }

    const rows = candidates.map(({ rule, v }) => ({
      rule_code: rule.code,
      severity: rule.severity,
      digest: win,
      headline: v.headline ?? rule.title,
      detail: [v.detail, rule.action_text].filter(Boolean).join(' — '),
      metric_value: v.metric_value ?? null,
      threshold_value: v.threshold_value ?? null,
      suppressed_in_digest: !winners.has(rule),
      status: 'open',
    }));

    if (rows.length) {
      const { error } = await supabase.from('alert_event').insert(rows);
      if (error) throw error;
    }

    // ── auto-resolve: open events whose condition is no longer true ──
    const stale = (openEvents ?? []).filter((e) => {
      const v = verdicts.get(String(e.rule_code));
      return v !== undefined && !v.fires;
    });
    if (stale.length) {
      await supabase.from('alert_event')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .in('id', stale.map((e) => e.id));
    }

    return jsonResponse({
      ok: true,
      window: win,
      snapshot_id: snap.id,
      evaluated: (rules ?? []).length,
      fired: rows.filter((r) => !r.suppressed_in_digest).length,
      suppressed: rows.filter((r) => r.suppressed_in_digest).length,
      skipped_min_sample: skippedSample,
      skipped_cooldown: skippedCooldown,
      auto_resolved: stale.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[kpi-alerts] failed:', msg);
    return jsonResponse({ ok: false, error: msg }, 500);
  }
});
