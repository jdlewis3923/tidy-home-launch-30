import '../_shared/http.ts';
/**
 * hiring-calendar — 6:50 AM America/New_York.
 *
 * Computes each calendar task's next due date from settings.launch_date (offset
 * tasks) or its fixed_rule (recurring tasks), then raises the heads-up alert
 * heads_up_days early and the real alert on the due date. Recurring tasks roll
 * forward once their alert is done.
 *
 * Alerts are written to the database only. No email is sent from here; the
 * digest job is the delivery channel and its failure never hides a task.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { writeAlert } from '../_shared/alerts.ts';

interface TaskRow {
  id: string;
  offset_days_from_launch: number | null;
  fixed_rule: string | null;
  title: string;
  body: string | null;
  heads_up_days: number | null;
  next_due_date: string | null;
  done_at: string | null;
  recurring: boolean | null;
}

const DAY_MS = 86_400_000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today in America/New_York, as a plain date. */
function easternToday(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${parts}T00:00:00Z`);
}

/** Next occurrence of a fixed rule: 'yearly:09-30', 'quarterly:01-15,04-15', 'monthly:01'. */
function nextFixed(rule: string, today: Date): string | null {
  const [kind, list] = rule.split(':');
  const year = today.getUTCFullYear();
  const candidates: Date[] = [];

  if (kind === 'monthly') {
    const day = Number(list);
    for (let m = today.getUTCMonth(); m <= today.getUTCMonth() + 12; m++) {
      candidates.push(new Date(Date.UTC(year, m, day)));
    }
  } else {
    for (const md of (list ?? '').split(',')) {
      const [mm, dd] = md.split('-').map(Number);
      if (!mm || !dd) continue;
      candidates.push(new Date(Date.UTC(year, mm - 1, dd)));
      candidates.push(new Date(Date.UTC(year + 1, mm - 1, dd)));
    }
  }
  const next = candidates.filter((d) => d.getTime() >= today.getTime()).sort((a, b) => +a - +b)[0];
  return next ? isoDate(next) : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // Scheduled dispatches present the cron credential; admins call it by hand.
  const cron = await isCronAuthorized(req);
  const auth = cron ? { ok: true as const } : await requireServiceOrAdmin(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  const today = easternToday();

  const { data: launchSetting } = await admin
    .from('app_settings').select('value').eq('key', 'launch_date').maybeSingle();
  const rawLaunch = (launchSetting?.value ?? null) as string | null;
  const launch = rawLaunch ? new Date(`${String(rawLaunch).replace(/"/g, '').slice(0, 10)}T00:00:00Z`) : null;

  const { data: tasks } = await admin
    .from('calendar_tasks')
    .select('id, offset_days_from_launch, fixed_rule, title, body, heads_up_days, next_due_date, done_at, recurring');

  let dueAlerts = 0;
  let headsUp = 0;
  let dated = 0;

  for (const task of (tasks ?? []) as TaskRow[]) {
    let due: string | null = task.next_due_date;

    if (task.offset_days_from_launch != null) {
      due = launch ? isoDate(new Date(launch.getTime() + task.offset_days_from_launch * DAY_MS)) : null;
    } else if (task.fixed_rule) {
      // Recompute only when the stored date has passed or is missing.
      if (!due || new Date(`${due}T00:00:00Z`).getTime() < today.getTime()) {
        due = nextFixed(task.fixed_rule, today);
      }
    }

    if (due !== task.next_due_date) {
      await admin.from('calendar_tasks').update({ next_due_date: due }).eq('id', task.id);
      dated += 1;
    }
    if (!due || task.done_at) continue;

    const dueTime = new Date(`${due}T00:00:00Z`).getTime();
    const daysOut = Math.round((dueTime - today.getTime()) / DAY_MS);
    const lead = task.heads_up_days ?? 7;

    if (daysOut <= 0) {
      const ok = await writeAlert(admin, {
        level: 'action', category: 'calendar',
        title: task.title,
        body: task.body,
        action_label: 'Mark done', action_url: '/admin/alerts',
        due_date: due,
        dedupe_key: `calendar_due_${task.id}_${due}`,
      });
      if (ok) dueAlerts += 1;
    } else if (daysOut <= lead) {
      const ok = await writeAlert(admin, {
        level: 'warning', category: 'calendar',
        title: `In ${daysOut} day${daysOut === 1 ? '' : 's'}: ${task.title}`,
        body: task.body,
        action_label: 'Open the calendar', action_url: '/admin/alerts',
        due_date: due,
        dedupe_key: `calendar_headsup_${task.id}_${due}`,
      });
      if (ok) headsUp += 1;
    }
  }

  // Business policy renewal: 45 days before the bound policy expires.
  let policyAlerts = 0;
  const { data: gates } = await admin
    .from('service_gates')
    .select('service, business_policy_required, business_policy_expires')
    .eq('business_policy_required', true);
  for (const gate of gates ?? []) {
    const expires = gate.business_policy_expires as string | null;
    if (!expires) continue;
    const daysOut = Math.round((new Date(`${expires}T00:00:00Z`).getTime() - today.getTime()) / DAY_MS);
    if (daysOut > 45) continue;
    const ok = await writeAlert(admin, {
      level: daysOut <= 0 ? 'critical' : 'action',
      category: 'insurance',
      title: daysOut <= 0
        ? `The ${gate.service} business policy has expired`
        : `Renew the ${gate.service} business policy — ${daysOut} days left`,
      body: `The bound business policy for ${gate.service} expires ${expires}. Car care cannot stay live without it.`,
      action_label: 'Open service gates', action_url: '/admin/site-status',
      due_date: expires,
      dedupe_key: `business_policy_renewal_${gate.service}_${expires}`,
    });
    if (ok) policyAlerts += 1;
  }

  return new Response(
    JSON.stringify({ ok: true, launch_date: rawLaunch, tasks: (tasks ?? []).length, dated, dueAlerts, headsUp, policyAlerts }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
