// Tidy — capacity-alert-check. Fires ONCE per crossing, not daily.
//
// A "crossing" is an open row in public.capacity_crossings for (service, level).
// While the row is open we stay quiet. When the service falls back to green the
// row is closed, so the next crossing alerts again.
//
// Channels: email (Brevo, ops mail) + SMS to JUSTIN_ALERT_PHONE. Run on a
// schedule with the service-role key.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { computeCapacityFromDb } from '../_shared/capacity.ts';
import { CAPACITY_SERVICE_DB_KEY, HIRING_CYCLE_DAYS } from '../_shared/capacity-config.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const JUSTIN_PHONE = Deno.env.get('JUSTIN_ALERT_PHONE') ?? '';
const ALERT_FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@jointidy.co';

async function adminEmails(supabase: ReturnType<typeof createClient>): Promise<string[]> {
  const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
  const emails: string[] = [];
  for (const r of roles ?? []) {
    try {
      const { data } = await supabase.auth.admin.getUserById((r as { user_id: string }).user_id);
      if (data.user?.email) emails.push(data.user.email);
    } catch { /* skip */ }
  }
  return emails;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const results = await computeCapacityFromDb(supabase);

    const { data: open } = await supabase
      .from('capacity_crossings')
      .select('id, service, level')
      .is('cleared_at', null);

    const openByService = new Map<string, { id: string; level: string }>();
    for (const row of open ?? []) {
      openByService.set(row.service as string, { id: row.id as string, level: row.level as string });
    }

    const notified: string[] = [];
    const closed: string[] = [];

    for (const r of results) {
      const dbKey = CAPACITY_SERVICE_DB_KEY[r.service];
      const existing = openByService.get(dbKey);

      if (r.status === 'green') {
        if (existing) {
          await supabase
            .from('capacity_crossings')
            .update({ cleared_at: new Date().toISOString() })
            .eq('id', existing.id);
          closed.push(dbKey);
        }
        continue;
      }

      // Already alerted at this level (or worse: red keeps the amber row open).
      if (existing && existing.level === r.status) continue;
      if (existing && existing.level === 'red' && r.status === 'amber') continue;

      // Escalation amber -> red closes the amber row and opens a red one.
      if (existing) {
        await supabase
          .from('capacity_crossings')
          .update({ cleared_at: new Date().toISOString() })
          .eq('id', existing.id);
      }

      const channels: string[] = [];
      const subject =
        r.status === 'red'
          ? `Tidy capacity RED: ${r.serviceName}`
          : `Tidy capacity AMBER: ${r.serviceName} — post the job today`;
      const body = [
        `${r.serviceName}: ${r.message}`,
        `Customers: ${r.activeCustomers} of ${r.maxAtCapacity} at capacity`,
        `Fill: ${r.fillPct === null ? 'no pro assigned' : `${Math.round(r.fillPct * 100)}%`}`,
        `Growth: ${r.growthPerMonth <= 0 ? 'not growing' : `${r.growthPerMonth}/mo`}`,
        `Hiring takes ${HIRING_CYCLE_DAYS} days.`,
      ].join('\n');

      if (JUSTIN_PHONE) {
        try {
          await supabase.functions.invoke('send-twilio-sms', {
            body: { to: JUSTIN_PHONE, message: `${subject} — ${r.message}` },
          });
          channels.push('sms');
        } catch (e) {
          console.error('[capacity-alert-check] sms failed', e);
        }
      }

      if (BREVO_API_KEY) {
        const emails = await adminEmails(supabase);
        if (emails.length > 0) {
          const sent = await sendBrevoEmail({
            to: emails,
            subject,
            htmlContent: `<pre style="font:14px/1.6 monospace">${body}</pre><p><a href="https://jointidy.co/admin/capacity">Open the capacity dashboard</a></p>`,
            marketing: false,
            sender: { name: 'Tidy Capacity Alerts', email: ALERT_FROM_EMAIL },
            label: 'capacity-alert-check',
          });
          if (sent.sent) channels.push('email');
        }
      }

      await supabase.from('capacity_crossings').insert({
        service: dbKey,
        level: r.status,
        fill_pct: r.fillPct,
        days_to_ceiling: r.daysToCeiling,
        demand_hours: r.demandHours,
        capacity_hours: r.capacityHours,
        active_customers: r.activeCustomers,
        notified_at: new Date().toISOString(),
        notify_channels: channels,
      });
      notified.push(`${dbKey}:${r.status}`);
    }

    return jsonResponse({ ok: true, notified, closed, services: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[capacity-alert-check] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
