import '../_shared/http.ts';
// Tidy — admin alert writer.
//
// Rule from the hiring/launch autopilot spec: the database is the primary and
// only required delivery channel. Email is a second channel that may fail; a
// failed email must never make an alert disappear, and must never crash the
// caller. So this function only ever writes a row, deduped on dedupe_key.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type AlertLevel = 'action' | 'warning' | 'critical';
export type AlertCategory = 'hiring' | 'site' | 'calendar' | 'capacity' | 'insurance';

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
      },
      { onConflict: 'dedupe_key' },
    );
    if (error) {
      console.error('writeAlert failed', alert.dedupe_key, error.message);
      return false;
    }
    // Critical alerts also go out immediately. The row already exists, so a
    // failed send is logged and swallowed — it can never unwrite the alert.
    if (alert.level === 'critical') {
      try {
        const { sendBrevoEmail } = await import('./brevo-send.ts');
        const res = await sendBrevoEmail({
          to: 'hello@jointidy.co',
          marketing: false,
          sender: { name: 'Tidy Operating System', email: Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@jointidy.co' },
          subject: `Tidy critical: ${alert.title}`,

          htmlContent:
            `<p><strong>${alert.title}</strong></p><p>${alert.body ?? ''}</p>` +
            (alert.action_url ? `<p><a href="https://jointidy.co${alert.action_url}">${alert.action_label ?? 'Open'}</a></p>` : ''),
          tags: ['admin-critical'],
          label: 'critical-alert',
        });
        if (!res.sent) {
          await admin.from('integration_logs').insert({
            source: 'brevo', event: 'critical_alert_email', status: 'error',
            error_message: res.reason ?? 'unknown', detail: { dedupe_key: alert.dedupe_key },
          });
        }
      } catch (err) {
        console.error('critical alert email failed', alert.dedupe_key, String(err));
      }
    }
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
