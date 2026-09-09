/**
 * Tidy — Dashboard data hook.
 *
 * Centralized read for the customer command center. Joins the current
 * Supabase session against `profiles`, `subscriptions`, `visits` and
 * `invoices` so the dashboard can render live "everything is handled"
 * state without each card re-querying.
 *
 * Returns derived aggregates the UI cares about (next visit, last visit,
 * upcoming list, plan summary, next billing) so components stay dumb.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Profile = Tables<'profiles'>;
type Subscription = Tables<'subscriptions'>;
/**
 * Customer-visible visit shape. Contractor pay columns (visit_pay_cents,
 * contractor_pay_cents) are deliberately absent — they are also revoked from
 * the Data API role, so a customer cannot reach them by any route.
 */
export const CUSTOMER_VISIT_COLUMNS =
  'id, user_id, subscription_id, service, service_type, visit_date, time_window, status, notes, scheduled_start, scheduled_end, street, zip, customer_first_name, assigned_pro_id, crew_name, jobber_visit_id, completed_at, on_my_way_at, is_sample, size_tier, cadence, surcharge_applied, visit_kind, created_at, updated_at';

/**
 * Customer-visible subscription columns. Never `select('*')` here: a star
 * select would ship any future pay/internal column straight to the browser.
 */
export const CUSTOMER_SUBSCRIPTION_COLUMNS =
  'id, user_id, services, frequency, monthly_total_cents, status, next_billing_date, stripe_subscription_id, stripe_customer_id, pause_collection, latest_invoice_attempt_count, assigned_pro_id, band_source, band_verified_at, created_at, updated_at, bundle_discount_pct, card_brand, card_last4, cancel_at_period_end, canceled_at, paused_until, band, size, sizes_json, founding_rate_locked, founding_free_addon_first_visit, founding_free_addon_fulfilled_at, founding_review_promised, free_car_washes_per_month, founding_zip, free_addons_per_month, preferred_pro_id, has_water_spigot, has_electrical_outlet, washing_allowed, car_service_code, size_tier, cadence, surcharge_applied, surcharge_cents, plan_lines, stripe_status';


type Visit = Pick<
  Tables<'visits'>,
  | 'id' | 'user_id' | 'subscription_id' | 'service' | 'service_type' | 'visit_date'
  | 'time_window' | 'status' | 'notes' | 'scheduled_start' | 'scheduled_end' | 'street'
  | 'zip' | 'customer_first_name' | 'assigned_pro_id' | 'crew_name' | 'jobber_visit_id'
  | 'completed_at' | 'on_my_way_at' | 'is_sample' | 'size_tier' | 'cadence'
  | 'surcharge_applied' | 'visit_kind' | 'created_at' | 'updated_at'
>;
type Invoice = Tables<'invoices'>;

export type DashboardData = {
  loading: boolean;
  isAuthed: boolean;
  firstName: string;
  initials: string;
  profile: Profile | null;
  subscription: Subscription | null;
  visits: Visit[];                // all visits, asc by date
  upcoming: Visit[];              // future / today, scheduled or skipped
  nextVisit: Visit | null;
  lastCompleted: Visit | null;
  nextInvoice: Invoice | null;
  invoices: Invoice[];
  refetch: () => void;
};

const SERVICE_LABEL: Record<string, string> = {
  cleaning: 'House Cleaning',
  lawn: 'Lawn Care',
  detailing: 'Shine Complete',
};

export const serviceLabel = (s: string) => SERVICE_LABEL[s] ?? s;

let dashboardCache: Omit<DashboardData, 'loading' | 'refetch'> | null = null;

export function useDashboardData(): DashboardData {
  const [state, setState] = useState<DashboardData>(() => ({
    loading: dashboardCache === null,
    ...(dashboardCache ?? {
      isAuthed: false,
      firstName: '',
      initials: '',
      profile: null,
      subscription: null,
      visits: [],
      upcoming: [],
      nextVisit: null,
      lastCompleted: null,
      nextInvoice: null,
      invoices: [],
    }),
    refetch: () => {},
  }));

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, isAuthed: false }));
        return;
      }

      const [profileRes, subRes, visitsRes, invRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase
          .from('subscriptions')
          // Explicit columns only — never star-select this table.
          .select(CUSTOMER_SUBSCRIPTION_COLUMNS)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('visits')
          // Explicit columns only. Contractor pay (visit_pay_cents,
          // contractor_pay_cents) must never reach a customer's browser, and
          // those columns are also revoked from the Data API role.
          .select(CUSTOMER_VISIT_COLUMNS)
          .eq('user_id', user.id)
          .order('visit_date', { ascending: true }),
        supabase
          .from('invoices')
          .select('*')
          .eq('user_id', user.id)
          .order('invoice_date', { ascending: false }),
      ]);

      const profile = profileRes.data ?? null;
      const subscription = (subRes.data ?? null) as Subscription | null;
      const visits = visitsRes.data ?? [];
      const invoices = invRes.data ?? [];

      const todayISO = new Date().toISOString().slice(0, 10);
      const upcoming = visits.filter(
        (v) => v.visit_date >= todayISO && (v.status === 'scheduled' || v.status === 'skipped')
      );
      const nextVisit = upcoming.find((v) => v.status === 'scheduled') ?? null;
      const lastCompleted =
        [...visits].reverse().find((v) => v.status === 'complete') ??
        // fall back to most recent past scheduled (so "Last Service" still
        // has something to show on day 1).
        [...visits].reverse().find((v) => v.visit_date < todayISO) ??
        null;
      const nextInvoice =
        invoices.find((i) => i.status === 'pending') ?? invoices[0] ?? null;

      const meta = (user.user_metadata ?? {}) as Record<string, string>;
      const firstName =
        profile?.first_name ||
        meta.first_name ||
        (user.email ? user.email.split('@')[0] : 'friend');
      const lastName = profile?.last_name || meta.last_name || '';
      const initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`
        .trim()
        .toUpperCase() || (user.email?.[0]?.toUpperCase() ?? 'T');

      if (!cancelled) {
        const next = {
          isAuthed: true,
          firstName,
          initials,
          profile,
          subscription,
          visits,
          upcoming,
          nextVisit,
          lastCompleted,
          nextInvoice,
          invoices,
        };
        dashboardCache = next;
        setState({
          loading: false,
          ...next,
          refetch: () => load(),
        });
      }
    };

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** Friendly "Tomorrow / Today / Mon May 16" for a YYYY-MM-DD string. */
export function relativeDateLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const today = new Date();
  const target = new Date(iso + 'T12:00:00');
  const diffDays = Math.round(
    (target.getTime() - new Date(today.toDateString()).getTime()) / 86_400_000
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return target.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });
}

export function formatMoney(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}
