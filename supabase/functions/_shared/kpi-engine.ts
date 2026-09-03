/**
 * KPI engine shared constants + helpers.
 *
 * Used by kpi-rollup, kpi-alerts and kpi-digest. Keeps service codes, launch
 * date and the small math utilities in one place so the three functions can
 * never drift.
 */

export const LAUNCH_DATE = '2026-05-26';

export type ServiceCode = 'house_clean' | 'car_wash' | 'car_detail';

export const SERVICE_CODES: ServiceCode[] = ['house_clean', 'car_wash', 'car_detail'];

export const SERVICE_NAMES: Record<ServiceCode, string> = {
  house_clean: 'House Cleaning',
  car_wash: 'Car Wash',
  car_detail: 'Car Detailing',
};

/** `service_type` / subscription service key each code maps to in the DB. */
export const SERVICE_DB_KEYS: Record<ServiceCode, string[]> = {
  house_clean: ['cleaning', 'house_clean', 'house_cleaning'],
  car_wash: ['wash', 'car_wash'],
  car_detail: ['detailing', 'detail', 'car_detail', 'shine'],
};

/** Fulfilment minutes one customer of that service consumes in one week. */
export const MINUTES_PER_SUB_WEEK: Record<ServiceCode, number> = {
  house_clean: 88,   // 6.34 h / month
  car_wash: 27,      // 1.96 h / month
  car_detail: 40,    // 2.89 h / month
};

/** Typical on-site minutes for one visit of that service. */
export const MINUTES_PER_VISIT: Record<ServiceCode, number> = {
  house_clean: 180,
  car_wash: 45,
  car_detail: 150,
};

/** Which constant holds the hiring lead time for that service. */
export const LEAD_DAYS_FIELD: Record<ServiceCode, 'hire_lead_days_house' | 'hire_lead_days_detail'> = {
  house_clean: 'hire_lead_days_house',
  car_wash: 'hire_lead_days_house',
  car_detail: 'hire_lead_days_detail',
};

export const FUNNEL_ZIPS = ['33156', '33183', '33186'];

export interface KpiConstants {
  rev_sub: number;
  pay_sub: number;
  gp_sub: number;
  churn_target: number;
  subs_per_pro: number;
  max_hires_mo: number;
  cost_per_hanger: number;
  cust_per_5k: number;
  hire_lead_days_house: number;
  hire_lead_days_detail: number;
  hire_buffer_days: number;
  overhead_mo: number;
  target_y1_profit: number;
  doors_33156: number;
  doors_33183: number;
  doors_33186: number;
}

export const DEFAULT_CONSTANTS: KpiConstants = {
  rev_sub: 242, pay_sub: 109, gp_sub: 125.68, churn_target: 0.04,
  subs_per_pro: 65, max_hires_mo: 3, cost_per_hanger: 0.17, cust_per_5k: 26,
  hire_lead_days_house: 21, hire_lead_days_detail: 35, hire_buffer_days: 14,
  overhead_mo: 900, target_y1_profit: 150000,
  doors_33156: 8420, doors_33183: 8337, doors_33186: 16356,
};

export const DAY_MS = 86_400_000;

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

export function ymd(d: Date | string): string {
  return (typeof d === 'string' ? new Date(d) : d).toISOString().slice(0, 10);
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Safe division: null when the denominator is zero or missing. */
export function ratio(num: number, den: number): number | null {
  if (!den) return null;
  return num / den;
}

/** Fractional months between the launch date and now. */
export function monthsElapsed(from = LAUNCH_DATE): number {
  const ms = Date.now() - new Date(from).getTime();
  return Math.max(0, ms / (DAY_MS * 30.4375));
}

/** Deep read of a dotted path inside the metrics jsonb. */
export function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
