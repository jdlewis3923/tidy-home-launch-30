/**
 * Shared smart-alert filter used by compute-kpi.
 *
 * Combines noise rules (kpi_noise_rules table) + predictive lead-time
 * regression (last 7 days of kpi_snapshots) + recent action checks
 * to decide whether a status change should fire an alert NOW, fire
 * a predictive alert, or be suppressed.
 *
 * Returns: { fire: boolean, severity, suppression_reason?, prediction_tier?,
 *            hours_to_deadline?, top_actions[], dedup_hash }
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export interface KpiDef {
  code: string;
  direction: string;
  target_value: number | null;
  warn_threshold: number | null;
  critical_threshold: number | null;
  playbook?: Array<{ step: string; action_type: 'AUTO' | 'MANUAL' | 'INFO'; action_key?: string }>;
}

export interface FilterInput {
  def: KpiDef;
  current_value: number | null;
  current_status: 'green' | 'warn' | 'critical' | 'unknown';
  prev_status: 'green' | 'warn' | 'critical' | 'unknown';
}

export interface FilterResult {
  fire: boolean;
  severity: 'warn' | 'critical';
  suppression_reason?: string;
  prediction_tier?: 'red' | 'orange' | 'yellow';
  hours_to_deadline?: number;
  top_actions: Array<{ step: string; action_type: string; action_key?: string }>;
  dedup_hash: string;
  estimated_impact_cents?: number;
}

// Simple hash for dedup
function hashKey(kpi: string, severity: string, dayBucket: string): string {
  return `${kpi}|${severity}|${dayBucket}`;
}

function isWeekend(d = new Date()): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function isQuietHourET(start: number, end: number, d = new Date()): boolean {
  // Convert to ET (UTC-5 standard / UTC-4 DST). Approximate UTC-5.
  const etHour = (d.getUTCHours() - 5 + 24) % 24;
  if (start === end) return false;
  if (start < end) return etHour >= start && etHour < end;
  return etHour >= start || etHour < end; // wrap
}

// Returns true if recovery action ran for this KPI in the last N hours
async function recentRecoveryAction(s: SupabaseClient, kpi: string, hours: number): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { count } = await s
    .from('kpi_action_log')
    .select('*', { count: 'exact', head: true })
    .eq('kpi_code', kpi)
    .eq('status', 'completed')
    .gte('created_at', since);
  return (count ?? 0) > 0;
}

// Returns true if an unresolved alert with same dedup hash exists in last 24h
async function recentDuplicateAlert(s: SupabaseClient, dedup: string, hours: number): Promise<boolean> {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  const { count } = await s
    .from('kpi_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('dedup_hash', dedup)
    .gte('created_at', since);
  return (count ?? 0) > 0;
}

// Linear regression slope over last N snapshots
function linearSlope(points: Array<{ t: number; v: number }>): number {
  if (points.length < 3) return 0;
  const n = points.length;
  const meanT = points.reduce((a, p) => a + p.t, 0) / n;
  const meanV = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.v - meanV);
    den += (p.t - meanT) ** 2;
  }
  return den === 0 ? 0 : num / den; // value units per ms
}

// Get last 7d of snapshots and project hours-to-warn/critical
async function projectLeadTime(
  s: SupabaseClient,
  def: KpiDef,
  currentValue: number,
): Promise<{ hours_to_warn: number | null; hours_to_critical: number | null; trend: 'up' | 'down' | 'flat' }> {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await s
    .from('kpi_snapshots')
    .select('value, computed_at')
    .eq('kpi_code', def.code)
    .gte('computed_at', since)
    .order('computed_at', { ascending: true })
    .limit(200);
  const points = (data ?? [])
    .filter((r) => r.value !== null)
    .map((r) => ({ t: new Date(r.computed_at).getTime(), v: Number(r.value) }));
  if (points.length < 3) return { hours_to_warn: null, hours_to_critical: null, trend: 'flat' };
  const slope = linearSlope(points); // units per ms
  const trend: 'up' | 'down' | 'flat' = Math.abs(slope) < 1e-12 ? 'flat' : slope > 0 ? 'up' : 'down';

  const project = (target: number | null): number | null => {
    if (target === null || slope === 0) return null;
    const direction = def.direction;
    // heading toward "bad" if lower_is_better and slope>0, or higher_is_better and slope<0
    const movingBad =
      (direction === 'lower_is_better' && slope > 0) ||
      (direction === 'higher_is_better' && slope < 0);
    if (!movingBad) return null;
    const msToReach = (target - currentValue) / slope;
    if (msToReach <= 0) return 0;
    return msToReach / 3600000;
  };
  return {
    hours_to_warn: project(def.warn_threshold),
    hours_to_critical: project(def.critical_threshold),
    trend,
  };
}

export async function shouldAlert(
  s: SupabaseClient,
  input: FilterInput,
): Promise<FilterResult> {
  const { def, current_value, current_status, prev_status } = input;
  const dayBucket = new Date().toISOString().slice(0, 10);
  const baseSeverity: 'warn' | 'critical' =
    current_status === 'critical' ? 'critical' : 'warn';
  const dedup = hashKey(def.code, baseSeverity, dayBucket);
  const playbook = def.playbook ?? [];
  const topActions = playbook.slice(0, 3);

  const result: FilterResult = {
    fire: false,
    severity: baseSeverity,
    top_actions: topActions,
    dedup_hash: dedup,
  };

  // ── Suppression checks ────────────────────────────────────────────────

  // Info-only playbook → no actionable steps → suppress
  if (playbook.length > 0 && playbook.every((p) => p.action_type === 'INFO')) {
    result.suppression_reason = 'info_only_playbook';
    return result;
  }

  // Load active noise rules
  const { data: rules } = await s
    .from('kpi_noise_rules')
    .select('rule_key, config, applies_to_kpis, enabled')
    .eq('enabled', true);

  const applies = (rule: { applies_to_kpis: string[] | null }) =>
    !rule.applies_to_kpis || rule.applies_to_kpis.length === 0 ||
    rule.applies_to_kpis.includes(def.code);

  for (const rule of rules ?? []) {
    if (!applies(rule)) continue;
    const cfg = (rule.config ?? {}) as Record<string, unknown>;
    if (rule.rule_key === 'weekend_signups' && isWeekend()) {
      result.suppression_reason = 'weekend_scheduler_off';
      return result;
    }
    if (rule.rule_key === 'billing_cycle_mrr') {
      const dayOfMonth = new Date().getUTCDate();
      const days = (cfg.days_of_month as number[] | undefined) ?? [1, 2, 3];
      if (days.includes(dayOfMonth)) {
        result.suppression_reason = 'stripe_billing_cycle';
        return result;
      }
    }
    if (rule.rule_key === 'quiet_hours_uptime') {
      if (isQuietHourET((cfg.start_hour_et as number) ?? 21, (cfg.end_hour_et as number) ?? 9)) {
        result.suppression_reason = 'quiet_hours';
        return result;
      }
    }
  }

  // Dedup within 24h
  if (await recentDuplicateAlert(s, dedup, 24)) {
    result.suppression_reason = 'duplicate_within_24h';
    return result;
  }

  // Recovery in progress — check if action ran recently AND value is improving
  if (await recentRecoveryAction(s, def.code, 4) && current_value !== null) {
    const { trend } = await projectLeadTime(s, def, current_value);
    const trendingGood =
      (def.direction === 'higher_is_better' && trend === 'up') ||
      (def.direction === 'lower_is_better' && trend === 'down');
    if (trendingGood) {
      result.suppression_reason = 'recovery_in_progress';
      return result;
    }
  }

  // ── Predictive lead-time tier ─────────────────────────────────────────

  if (current_status === 'critical') {
    result.fire = true;
    result.severity = 'critical';
    result.prediction_tier = 'red';
    result.hours_to_deadline = 0;
    return result;
  }

  if (current_value !== null) {
    const { hours_to_warn, hours_to_critical } = await projectLeadTime(s, def, current_value);
    if (hours_to_critical !== null && hours_to_critical <= 72) {
      result.fire = true;
      result.severity = 'critical';
      result.prediction_tier = 'orange';
      result.hours_to_deadline = hours_to_critical;
      return result;
    }
    if (hours_to_warn !== null && hours_to_warn <= 48) {
      result.fire = true;
      result.severity = 'warn';
      result.prediction_tier = 'yellow';
      result.hours_to_deadline = hours_to_warn;
      return result;
    }
  }

  // Status transition (warn→critical or green→warn) without prediction
  if (current_status === 'warn' && prev_status !== 'warn' && prev_status !== 'critical') {
    result.fire = true;
    result.severity = 'warn';
    return result;
  }

  return result;
}
