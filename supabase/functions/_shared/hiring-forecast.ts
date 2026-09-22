import '../_shared/http.ts';
// Tidy — next-hire forecast.
//
// trigger_count = active pros x route capacity x hire_trigger_pct.
// Growth comes from the trailing 28 days of net active-customer change; with
// less than 28 days of history we fall back to the launch model ramp.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { writeAlert } from './alerts.ts';
import { activeProCount, type GateService } from './hiring-gates.ts';

const DEFAULT_CAPACITY: Record<GateService, number> = { cleaning: 22, lawn: 52, car_care: 47 };
const SERVICE_MIX: Record<GateService, number> = { cleaning: 0.35, lawn: 0.45, car_care: 0.2 };
const MODEL_RAMP = [3, 6, 10, 14, 18, 21, 24, 27, 30, 33, 36, 39];
const MONTHLY_CHURN = 0.043;

const LABEL: Record<GateService, string> = {
  cleaning: 'House cleaning',
  lawn: 'Lawn care',
  car_care: 'Car care',
};

export interface ServiceForecast {
  service: GateService;
  active_customers: number;
  pros: number;
  capacity: number;
  trigger_count: number;
  growth_per_day: number;
  growth_source: 'actual_28d' | 'model_ramp';
  forecast_trigger_date: string | null;
  post_by_date: string | null;
  status: string;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function setting<T>(admin: SupabaseClient, key: string, fallback: T): Promise<T> {
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value ?? fallback) as T;
}

/**
 * Active subscription count for a service.
 *
 * subscriptions.services is a service_type[] whose car member is 'detailing'.
 * Car care also counts anyone carrying the car-wash add-on (car_service_code).
 */
async function activeCustomers(admin: SupabaseClient, service: GateService): Promise<number> {
  const { data } = await admin
    .from('subscriptions')
    .select('id, status, services, car_service_code')
    .in('status', ['active', 'trialing', 'past_due']);

  const member = service === 'car_care' ? 'detailing' : service;
  return (data ?? []).filter((r: Record<string, unknown>) => {
    const services = (r.services as string[] | null) ?? [];
    if (services.includes(member)) return true;
    return service === 'car_care' && !!r.car_service_code;
  }).length;
}

/** Net change in active customers across the trailing 28 days, per day. */
async function growthPerDay(
  admin: SupabaseClient,
  service: GateService,
  current: number,
): Promise<{ per_day: number; source: 'actual_28d' | 'model_ramp'; month_index: number }> {
  const { data: oldest } = await admin
    .from('subscriptions')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1);

  const first = oldest?.[0]?.created_at ? new Date(oldest[0].created_at as string) : null;
  const daysOfHistory = first ? (Date.now() - first.getTime()) / 86_400_000 : 0;
  const monthIndex = Math.max(0, Math.min(11, Math.floor(daysOfHistory / 30)));

  if (daysOfHistory >= 28) {
    const since = new Date(Date.now() - 28 * 86_400_000).toISOString();
    const { count: added } = await admin
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since);
    const net = (added ?? 0) * SERVICE_MIX[service] - current * MONTHLY_CHURN * (28 / 30);
    return { per_day: net / 28, source: 'actual_28d', month_index: monthIndex };
  }

  const grossAdds = MODEL_RAMP[monthIndex] * SERVICE_MIX[service];
  const net = grossAdds - current * MONTHLY_CHURN;
  return { per_day: net / 30, source: 'model_ramp', month_index: monthIndex };
}

export async function forecastService(
  admin: SupabaseClient,
  service: GateService,
): Promise<ServiceForecast> {
  const capacityMap = await setting<Record<string, number>>(admin, 'route_capacity', DEFAULT_CAPACITY);
  const pct = Number(await setting<number>(admin, 'hire_trigger_pct', 0.85));
  const capacity = Number(capacityMap?.[service] ?? DEFAULT_CAPACITY[service]);

  const pros = await activeProCount(admin, service);
  const customers = await activeCustomers(admin, service);
  const trigger = Math.round(pros * capacity * pct);
  const growth = await growthPerDay(admin, service, customers);

  let forecastDate: string | null = null;
  let postBy: string | null = null;
  if (growth.per_day > 0) {
    const days = Math.max(0, Math.ceil((trigger - customers) / growth.per_day));
    forecastDate = iso(new Date(Date.now() + days * 86_400_000));
    postBy = iso(new Date(Date.now() + (days - 30) * 86_400_000));
  }

  // The open opening for this service, if any.
  const { data: openRows } = await admin
    .from('hiring_openings')
    .select('*')
    .eq('service', service)
    .not('status', 'in', '("filled","cancelled")')
    .order('slot_number', { ascending: true });

  const opening = openRows?.[0] ?? null;
  let status = opening?.status ?? 'not_needed_yet';

  if (opening && !['posted', 'interviewing'].includes(status)) {
    if (forecastDate) {
      const daysOut = Math.round(
        (new Date(forecastDate).getTime() - Date.now()) / 86_400_000,
      );
      if (daysOut <= 30) status = 'post_today';
      else if (daysOut <= 37) status = 'post_soon';
      else status = 'not_needed_yet';
    } else {
      status = 'not_needed_yet';
    }

    await admin
      .from('hiring_openings')
      .update({
        status,
        forecast_trigger_date: forecastDate,
        post_by_date: postBy,
        trigger_reason: `${customers} active customers vs trigger ${trigger} (${pros} pro(s) x ${capacity} x ${pct})`,
      })
      .eq('id', opening.id);

    if (status === 'post_soon') {
      await writeAlert(admin, {
        level: 'warning',
        category: 'hiring',
        title: `${LABEL[service]} hire is coming up`,
        body: `Forecast trigger ${forecastDate}. Post by ${postBy}.`,
        action_label: 'Open Applicants',
        action_url: '/admin/applicants',
        due_date: postBy,
        dedupe_key: `hiring_post_soon_${service}_${opening.id}`,
        context: { service, forecast_trigger_date: forecastDate },
      });
    }
    if (status === 'post_today') {
      const { data: tpl } = await admin
        .from('job_listing_templates')
        .select('title, body')
        .eq('service', service)
        .maybeSingle();
      await writeAlert(admin, {
        level: 'action',
        category: 'hiring',
        title: `Post the ${LABEL[service].toLowerCase()} job on Indeed today`,
        body: tpl?.body ?? `Listing template missing for ${service}.`,
        action_label: 'Open Indeed',
        action_url: 'https://employers.indeed.com/jobs',
        due_date: iso(new Date()),
        dedupe_key: `hiring_post_today_${service}_${opening.id}`,
        context: { service, opening_id: opening.id, listing_title: tpl?.title ?? null },
      });
    }
  }

  // Over capacity with no hire in progress.
  const inProgress = opening && ['posted', 'interviewing', 'post_today'].includes(opening.status);
  if (customers > pros * capacity && !inProgress) {
    await writeAlert(admin, {
      level: 'critical',
      category: 'capacity',
      title: `${LABEL[service]} route is over capacity with no hire in progress`,
      body: `${customers} active customers against ${pros} pro(s) x ${capacity} capacity.`,
      action_label: 'Open Applicants',
      action_url: '/admin/applicants',
      dedupe_key: `hiring_over_capacity_${service}`,
      context: { service, customers, pros, capacity },
    });
  }

  // Posted 7 days with a thin A/B pool.
  if (opening?.status === 'posted' && opening.posted_at) {
    const postedDays = (Date.now() - new Date(opening.posted_at as string).getTime()) / 86_400_000;
    if (postedDays >= 7) {
      const { count } = await admin
        .from('applicants')
        .select('id', { count: 'exact', head: true })
        .eq('service', service)
        .eq('queue_state', 'not_contacted')
        .in('hiring_tier', ['A', 'B']);
      if ((count ?? 0) < 3) {
        await writeAlert(admin, {
          level: 'warning',
          category: 'hiring',
          title: `Few good ${LABEL[service].toLowerCase()} applicants — boost or re-word the Indeed post`,
          body: `${count ?? 0} untouched A/B applicants after ${Math.round(postedDays)} days posted.`,
          action_label: 'Open Indeed',
          action_url: 'https://employers.indeed.com/jobs',
          dedupe_key: `hiring_thin_pool_${service}_${opening.id}`,
          context: { service, ab_applicants: count ?? 0 },
        });
      }
    }
  }

  return {
    service,
    active_customers: customers,
    pros,
    capacity,
    trigger_count: trigger,
    growth_per_day: Number(growth.per_day.toFixed(3)),
    growth_source: growth.source,
    forecast_trigger_date: forecastDate,
    post_by_date: postBy,
    status,
  };
}

/** Founder hours per month, and the ops-coordinator trigger. */
export async function forecastOpsCoordinator(admin: SupabaseClient): Promise<{
  founder_hours: number;
  triggered: boolean;
}> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count: newCustomers } = await admin
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since);
  const { count: activeCust } = await admin
    .from('subscriptions')
    .select('id', { count: 'exact', head: true })
    .in('status', ['active', 'trialing', 'past_due']);

  let pros = 0;
  for (const svc of ['cleaning', 'lawn', 'car_care'] as GateService[]) {
    pros += await activeProCount(admin, svc);
  }

  const hours = 0.5 * (newCustomers ?? 0) + 1.5 * pros + 0.15 * (activeCust ?? 0);
  const triggered = hours > 35;

  if (triggered) {
    const { data: existing } = await admin
      .from('hiring_openings')
      .select('id, status')
      .eq('service', 'ops_coordinator')
      .not('status', 'in', '("filled","cancelled")')
      .maybeSingle();

    if (existing) {
      if (!['posted', 'interviewing'].includes(existing.status as string)) {
        await admin.from('hiring_openings').update({
          status: 'post_today',
          trigger_reason: `founder hours forecast ${hours.toFixed(1)}/month`,
        }).eq('id', existing.id);
      }
    } else {
      await admin.from('hiring_openings').insert({
        service: 'ops_coordinator',
        slot_number: 1,
        status: 'post_today',
        trigger_reason: `founder hours forecast ${hours.toFixed(1)}/month`,
      });
    }

    await writeAlert(admin, {
      level: 'action',
      category: 'hiring',
      title: 'Post the operations coordinator job today',
      body: `Founder admin hours forecast at ${hours.toFixed(1)} per month, past the 35-hour line. Part-time, about 20 hrs/week, about $22/hr.`,
      action_label: 'Open Indeed',
      action_url: 'https://employers.indeed.com/jobs',
      dedupe_key: 'hiring_post_today_ops_coordinator',
      context: { founder_hours: hours },
    });
  }

  // Checkr continuous monitoring, one time, at ten Active pros.
  if (pros >= 10) {
    await writeAlert(admin, {
      level: 'action',
      category: 'hiring',
      title: 'Turn on Checkr continuous monitoring ($1.70 per person per month)',
      body: `${pros} Active pros on the roster.`,
      dedupe_key: 'checkr_continuous_monitoring',
      context: { active_pros: pros },
    });
  }

  return { founder_hours: Number(hours.toFixed(1)), triggered };
}
