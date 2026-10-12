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
import { loadLaunchConfig } from '../_shared/launch-config.ts';
import { fmtLaunchDate } from '../_shared/launch.ts';

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

  // Offset tasks (print runs, drops) count from the first door hanger drop in launch_config.
  const cfg = await loadLaunchConfig(admin);
  const rawLaunch = cfg.global?.hanger_drops?.[0]?.start ?? null;
  const launch = rawLaunch ? new Date(`${rawLaunch.slice(0, 10)}T00:00:00Z`) : null;
  const todayIso = isoDate(today);

  // Hire deadlines from launch_config. Urgent on the morning they fall due.
  let hireAlerts = 0;
  const home = cfg.cleaning?.pro_callback_date;
  if (home && todayIso === home) {
    for (const svc of ['lawn', 'cleaning'] as const) {
      const first = fmtLaunchDate(cfg[svc]?.first_visit_date);
      const ok = await writeAlert(admin, {
        level: 'critical', category: 'calendar',
        title: `Advance your #1 ${svc} Pro today`,
        body: `WHAT: ${svc === 'lawn' ? 'Lawn' : 'Cleaning'} needs its first Pro advanced today.\nWHY TODAY: Pros must be active by ${fmtLaunchDate(cfg[svc]?.pro_ready_by)} for first visits ${first}.\nIF IGNORED: the ${first} ${svc} launch slips.\nDO: open the pipeline.`,
        action_label: 'Open the pipeline', action_url: `/admin/pipeline?service=${svc}`,
        due_date: home, dedupe_key: `hire_deadline_${svc}_${home}`,
      });
      if (ok) hireAlerts += 1;
    }
  }
  const carDue = cfg.car?.pro_callback_date;
  if (carDue && todayIso === carDue) {
    const { count } = await admin.from('reservations').select('id', { count: 'exact', head: true })
      .contains('services', ['detailing']).not('status', 'eq', 'canceled');
    const enough = (count ?? 0) >= 10;
    const ok = await writeAlert(admin, {
      level: 'critical', category: 'calendar',
      title: enough ? 'Advance your #1 car care Pro today' : `Car care below 10 reservations (${count ?? 0}) — decide today`,
      body: enough
        ? `WHAT: Car care has ${count} reservations; advance your first car care Pro today.\nWHY TODAY: Pros must be active by ${fmtLaunchDate(cfg.car?.pro_ready_by)} for first visits ${fmtLaunchDate(cfg.car?.first_visit_date)}.\nIF IGNORED: the car care launch slips.\nDO: open the pipeline.`
        : `WHAT: Car care has ${count ?? 0} reservations, under the 10 needed to hire.\nWHY TODAY: today is the car care hire date.\nIF IGNORED: the ${fmtLaunchDate(cfg.car?.first_visit_date)} car care launch is undecided.\nDO: decide whether to launch car care.`,
      action_label: 'Open the pipeline', action_url: '/admin/pipeline?service=detailing',
      due_date: carDue, dedupe_key: `hire_deadline_car_${carDue}`,
    });
    if (ok) hireAlerts += 1;
  }

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
    JSON.stringify({ ok: true, launch_date: rawLaunch, hireAlerts, tasks: (tasks ?? []).length, dated, dueAlerts, headsUp, policyAlerts }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
