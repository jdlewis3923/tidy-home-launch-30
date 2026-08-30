/**
 * CAPACITY CANON — the ONE place capacity + hiring math is tuned.
 *
 * Justin works a full-time job. He must not learn he is out of capacity from a
 * customer complaint, so every number below is deliberately conservative and
 * the alert fires at the COMFORT CEILING, not at 100%.
 *
 * The edge-function mirror lives at
 * `supabase/functions/_shared/capacity-config.ts`; `src/test/capacity.test.ts`
 * fails if the two diverge.
 */

/** One pro, one month, billable (not clock) hours. */
export const BILLABLE_HOURS_PER_PRO_PER_MONTH = 161;

/** Alert here, NOT at 100%. */
export const COMFORT_CEILING = 0.85;

/** post -> applications -> screen -> Checkr -> ICA signed -> first solo visit. */
export const HIRING_CYCLE_DAYS = 26;

/** Average days in a month, used to turn customer-headroom into days. */
export const DAYS_PER_MONTH = 30.4;

/** Trailing window used to measure growth. */
export const GROWTH_WINDOW_DAYS = 60;

export type CapacityService = 'cleaning' | 'lawn' | 'shine';

export const CAPACITY_SERVICES: CapacityService[] = ['cleaning', 'lawn', 'shine'];

/** Fulfilment hours consumed by ONE customer of that service in ONE month. */
export const HOURS_PER_CUSTOMER_PER_MONTH: Record<CapacityService, number> = {
  cleaning: 6.34,
  lawn: 1.96,
  shine: 2.89,
};

/** Display names. `shine` is Shine Complete (the detailing subscription). */
export const CAPACITY_SERVICE_NAMES: Record<CapacityService, string> = {
  cleaning: 'House Cleaning',
  lawn: 'Lawn Care',
  shine: 'Shine Complete',
};

/** The `service_type` enum value in the database for each capacity service. */
export const CAPACITY_SERVICE_DB_KEY: Record<CapacityService, 'cleaning' | 'lawn' | 'detailing'> = {
  cleaning: 'cleaning',
  lawn: 'lawn',
  shine: 'detailing',
};

export function capacityServiceFromDbKey(key: string): CapacityService | null {
  if (key === 'cleaning') return 'cleaning';
  if (key === 'lawn') return 'lawn';
  if (key === 'detailing') return 'shine';
  return null;
}

export type CapacityStatus = 'green' | 'amber' | 'red';

export interface CapacityInput {
  service: CapacityService;
  /** Active subscriptions that include this service. */
  activeCustomers: number;
  /**
   * Sum of pro time-shares assigned to this service. The first hire is
   * cross-trained, so this is fractional (e.g. 0.34 of one pro).
   */
  assignedPros: number;
  /** Net new customers in this service over the trailing 60 days. */
  netNewCustomers: number;
}

export interface CapacityResult {
  service: CapacityService;
  serviceName: string;
  activeCustomers: number;
  assignedPros: number;
  hoursPerCustomer: number;
  demandHours: number;
  capacityHours: number;
  /** demand / capacity. `null` when there are no pros at all. */
  fillPct: number | null;
  /** Customers you could still take before the 85% comfort ceiling. */
  headroomCustomers: number;
  /** Max customers this staffing can serve at 100%. */
  maxAtCapacity: number;
  /** Max customers before the comfort ceiling. */
  maxAtComfortCeiling: number;
  growthPerMonth: number;
  /** `null` when not growing (never divide by zero). */
  daysToCeiling: number | null;
  /** `null` when not growing. Negative means the job is already late. */
  postTheJobInDays: number | null;
  status: CapacityStatus;
  message: string;
  /** How many customers are past what this staffing can serve. */
  overBy: number;
}

/** Pure capacity + hiring math. No I/O — every consumer shares this. */
export function computeCapacity(input: CapacityInput): CapacityResult {
  const hoursPerCustomer = HOURS_PER_CUSTOMER_PER_MONTH[input.service];
  const demandHours = input.activeCustomers * hoursPerCustomer;
  const capacityHours = input.assignedPros * BILLABLE_HOURS_PER_PRO_PER_MONTH;

  const fillPct = capacityHours > 0 ? demandHours / capacityHours : null;
  const maxAtCapacity = Math.floor(capacityHours / hoursPerCustomer);
  const maxAtComfortCeiling = Math.floor((capacityHours * COMFORT_CEILING) / hoursPerCustomer);
  const headroomCustomers = (capacityHours * COMFORT_CEILING - demandHours) / hoursPerCustomer;

  const growthPerMonth = input.netNewCustomers;
  const growing = growthPerMonth > 0;
  const daysToCeiling = growing ? (headroomCustomers / growthPerMonth) * DAYS_PER_MONTH : null;
  const postTheJobInDays = daysToCeiling === null ? null : daysToCeiling - HIRING_CYCLE_DAYS;

  const overBy = Math.max(0, input.activeCustomers - maxAtCapacity);

  let status: CapacityStatus = 'green';
  let message: string;

  if (capacityHours <= 0) {
    if (input.activeCustomers > 0) {
      status = 'red';
      message = `Over capacity — ${input.activeCustomers} customer${
        input.activeCustomers === 1 ? '' : 's'
      } past what you can staff (no pro assigned)`;
    } else {
      message = 'No customers, no pro assigned';
    }
  } else if (fillPct !== null && fillPct >= 1) {
    status = 'red';
    message = `Over capacity — ${overBy} customer${overBy === 1 ? '' : 's'} past what you can staff`;
  } else if (!growing) {
    message = 'Not growing — no hire needed yet';
  } else if (daysToCeiling !== null && daysToCeiling <= HIRING_CYCLE_DAYS) {
    status = 'amber';
    message = `Post the job today — ceiling in ${Math.max(0, Math.round(daysToCeiling))} days, hiring takes ${HIRING_CYCLE_DAYS}`;
  } else {
    message = `Post the job in ${Math.round(postTheJobInDays ?? 0)} days`;
  }

  return {
    service: input.service,
    serviceName: CAPACITY_SERVICE_NAMES[input.service],
    activeCustomers: input.activeCustomers,
    assignedPros: input.assignedPros,
    hoursPerCustomer,
    demandHours,
    capacityHours,
    fillPct,
    headroomCustomers,
    maxAtCapacity,
    maxAtComfortCeiling,
    growthPerMonth,
    daysToCeiling,
    postTheJobInDays,
    status,
    message,
    overBy,
  };
}

const SEVERITY: Record<CapacityStatus, number> = { green: 0, amber: 1, red: 2 };

/** The service in the most trouble — what the top banner surfaces. */
export function worstService(results: CapacityResult[]): CapacityResult | null {
  if (results.length === 0) return null;
  return [...results].sort((a, b) => {
    const bySeverity = SEVERITY[b.status] - SEVERITY[a.status];
    if (bySeverity !== 0) return bySeverity;
    const aDays = a.daysToCeiling ?? Number.POSITIVE_INFINITY;
    const bDays = b.daysToCeiling ?? Number.POSITIVE_INFINITY;
    return aDays - bDays;
  })[0];
}
