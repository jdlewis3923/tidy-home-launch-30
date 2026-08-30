// Tidy — capacity + hiring computation from live data.
//
// Demand comes from ACTIVE subscriptions (the `services` text[] column).
// Capacity comes from pro_service_assignments, summing each pro's fractional
// share of time for that service — the first hire is cross-trained.
//
// Growth is net new customers in the trailing 60 days: signups minus
// cancellations. Per the owner's spec that count is used directly as
// growth_per_month, which is deliberately conservative (it alerts earlier).

import {
  CAPACITY_SERVICES,
  CAPACITY_SERVICE_DB_KEY,
  GROWTH_WINDOW_DAYS,
  computeCapacity,
  type CapacityResult,
  type CapacityService,
} from './capacity-config.ts';

// deno-lint-ignore no-explicit-any
type Client = any;

export async function computeCapacityFromDb(supabase: Client): Promise<CapacityResult[]> {
  const since = new Date(Date.now() - GROWTH_WINDOW_DAYS * 86_400_000).toISOString();

  const [{ data: subs, error: subErr }, { data: pros, error: proErr }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, services, status, created_at, canceled_at')
      .limit(10000),
    supabase
      .from('pro_service_assignments')
      .select('service, time_share, active')
      .eq('active', true)
      .limit(1000),
  ]);
  if (subErr) throw new Error(`subscriptions read failed: ${subErr.message}`);
  if (proErr) throw new Error(`pro_service_assignments read failed: ${proErr.message}`);

  const active: Record<CapacityService, number> = { cleaning: 0, lawn: 0, shine: 0 };
  const added: Record<CapacityService, number> = { cleaning: 0, lawn: 0, shine: 0 };
  const lost: Record<CapacityService, number> = { cleaning: 0, lawn: 0, shine: 0 };
  const proShare: Record<CapacityService, number> = { cleaning: 0, lawn: 0, shine: 0 };

  for (const svc of CAPACITY_SERVICES) {
    const dbKey = CAPACITY_SERVICE_DB_KEY[svc];
    for (const row of pros ?? []) {
      if (row.service === dbKey) proShare[svc] += Number(row.time_share ?? 0);
    }
    for (const sub of subs ?? []) {
      const services: string[] = Array.isArray(sub.services) ? sub.services : [];
      if (!services.includes(dbKey)) continue;
      if (sub.status === 'active') active[svc] += 1;
      if (sub.created_at && sub.created_at >= since) added[svc] += 1;
      if (sub.canceled_at && sub.canceled_at >= since) lost[svc] += 1;
    }
  }

  return CAPACITY_SERVICES.map((svc) =>
    computeCapacity({
      service: svc,
      activeCustomers: active[svc],
      assignedPros: proShare[svc],
      netNewCustomers: added[svc] - lost[svc],
    }),
  );
}
