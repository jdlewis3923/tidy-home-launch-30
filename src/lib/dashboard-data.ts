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
type Visit = Tables<'visits'>;
type Invoice = Tables<'invoices'>;

export type DashboardData = {
  loading: boolean;
  isAuthed: boolean;
  firstName: string;
  initials: string;
  profile: Profile | null;
  subscription: Subscription | null;
  visits: Visit[];                // all visits, asc by date
  upcoming: Visit[];              // future / today, scheduled
  nextVisit: Visit | null;
  lastCompleted: Visit | null;
  nextInvoice: Invoice | null;
  invoices: Invoice[];
};

const SERVICE_LABEL: Record<string, string> = {
  cleaning: 'House Cleaning',
  lawn: 'Lawn Care',
  detailing: 'Car Detailing',
};

export const serviceLabel = (s: string) => SERVICE_LABEL[s] ?? s;

export function useDashboardData(): DashboardData {
  const [state, setState] = useState<DashboardData>({
    loading: true,
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
  });

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
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('visits')
          .select('*')
          .eq('user_id', user.id)
          .order('visit_date', { ascending: true }),
        supabase
          .from('invoices')
          .select('*')
          .eq('user_id', user.id)
          .order('invoice_date', { ascending: false }),
      ]);

      const profile = profileRes.data ?? null;
      const subscription = subRes.data ?? null;
      const visits = visitsRes.data ?? [];
      const invoices = invRes.data ?? [];

      const todayISO = new Date().toISOString().slice(0, 10);
      const upcoming = visits.filter(
        (v) => v.visit_date >= todayISO && v.status === 'scheduled'
      );
      const nextVisit = upcoming[0] ?? null;
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
        setState({
          loading: false,
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
