import '../_shared/http.ts';
// Tidy — admin alert writer.
//
// Rule from the hiring/launch autopilot spec: the database is the primary and
// only required delivery channel. Email is a second channel that may fail; a
// failed email must never make an alert disappear, and must never crash the
// caller. So this function only ever writes a row, deduped on dedupe_key.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type AlertLevel = 'action' | 'warning' | 'critical';
export type AlertCategory = 'hiring' | 'site' | 'calendar' | 'capacity' | 'insurance' | 'reservations' | 'operations' | 'money' | 'safety';
export type AlertTier = 'urgent' | 'digest' | 'dashboard';

export interface AlertInput {
  level: AlertLevel;
  category: AlertCategory;
  title: string;
  body?: string | null;
  action_label?: string | null;
  action_url?: string | null;
  due_date?: string | null;
  /** Stable key — the same alert never stacks. */
  dedupe_key: string;
  context?: Record<string, unknown> | null;
  /** Omit to use the tier set at /admin/alerts for this kind of alert. */
  tier?: AlertTier;
  /** Urgent only: may it text you between 9 PM and 9 AM? */
  night_ok?: boolean;
  /** Urgent alerts read as four lines: WHAT / WHY TODAY / IF IGNORED / DO. */
  what?: string;
  why_today?: string;
  if_ignored?: string;
}

/**
 * Upsert an alert. Returns true when a row now exists (new or already open).
 * Never throws: a failure here must not take down the job that raised it.
 */
export async function writeAlert(
  admin: SupabaseClient,
  alert: AlertInput,
): Promise<boolean> {
  try {
    const { error } = await admin.from('admin_alerts').upsert(
      {
        alert_type: `${alert.category}_${alert.level}`,
        level: alert.level,
        category: alert.category,
        title: alert.title,
        body: alert.body ?? null,
        action_label: alert.action_label ?? null,
        action_url: alert.action_url ?? null,
        due_date: alert.due_date ?? null,
        dedupe_key: alert.dedupe_key,
        context: alert.context ?? null,
        resolved_at: null,
        ...(alert.tier ? { tier: alert.tier } : {}),
        ...(alert.night_ok ? { night_ok: true } : {}),
        what: alert.what ?? null,
        why_today: alert.why_today ?? null,
        if_ignored: alert.if_ignored ?? null,
      },
      { onConflict: 'dedupe_key' },
    );
    if (error) {
      console.error('writeAlert failed', alert.dedupe_key, error.message);
      return false;
    }
    // Delivery is decided by tier in the database: urgent alerts are sent the
    // moment the row lands (admin-alert-dispatch); everything else waits for
    // the 9 AM / 9 PM digest or stays on the dashboard.
    return true;
  } catch (err) {
    console.error('writeAlert threw', alert.dedupe_key, String(err));
    return false;
  }
}

/** Resolve an alert by dedupe key. Silent on failure, by design. */
export async function resolveAlert(admin: SupabaseClient, dedupeKey: string): Promise<void> {
  try {
    await admin
      .from('admin_alerts')
      .update({ resolved_at: new Date().toISOString() })
      .eq('dedupe_key', dedupeKey)
      .is('resolved_at', null);
  } catch (err) {
    console.error('resolveAlert threw', dedupeKey, String(err));
  }
}
