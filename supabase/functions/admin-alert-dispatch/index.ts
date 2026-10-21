import '../_shared/http.ts';
/**
 * admin-alert-dispatch — the only thing that contacts the owner.
 *
 *  mode 'urgent'  (fired by a database trigger the moment an urgent alert is
 *                  written): text + email now if it is 9 AM–9 PM ET, or if the
 *                  alert may wake the owner at night. Otherwise it waits for
 *                  the top of the 9 AM digest.
 *  mode 'hourly'  (cron, top of every hour): one reminder for urgent alerts
 *                  still open after 4 hours; any urgent alert the trigger
 *                  missed; and at 9 AM / 9 PM ET the "Today" / "Tonight" digest.
 *  mode 'test_urgent' | 'test_digest' (admin only): proves the channels work.
 *
 * Alert rows are written first by everyone else; this never creates or loses one.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { ownerEmail } from '../_shared/owner-email.ts';
import { vendorFetch } from '../_shared/http.ts';
import { loadLaunchConfig } from '../_shared/launch-config.ts';
import { renderTemplate } from '../_shared/socialPlanner.ts';
import { visibleDigestAlerts, realCompletedApplications } from '../_shared/admin-digest-rules.ts';
import { comingUp as roadmapComingUp, kickoffText, milestoneLine, type Initiative as RInitiative } from '../_shared/roadmap-rules.ts';

const SITE = 'https://jointidy.co';
const OWNER_EMAIL = 'hello@jointidy.co';
const OWNER_PHONE = Deno.env.get('JUSTIN_ALERT_PHONE') ?? '+17868291141';
const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

type Alert = {
  id: string; alert_type: string; level: string; category: string | null; title: string; body: string | null;
  action_label: string | null; action_url: string | null; due_date: string | null; created_at: string;
  tier: string | null; night_ok: boolean; what: string | null; why_today: string | null; if_ignored: string | null;
  notified_at: string | null; reminded_at: string | null; resolved_at: string | null; snoozed_until: string | null;
  context?: Record<string, unknown> | null;
};

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** ET wall clock. */
function et(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  return { hour, date: `${p.year}-${p.month}-${p.day}` };
}
export const isDaytime = (d = new Date()) => { const h = et(d).hour; return h >= 9 && h < 21; };
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** UTC instant of 00:00 ET on an ET date (good enough at hour precision). */
const etMidnightUtc = (iso: string) => { const probe = new Date(`${iso}T12:00:00Z`); const off = 12 - et(probe).hour; return new Date(Date.parse(`${iso}T00:00:00Z`) + off * 3_600_000).toISOString(); };

/** WHAT / WHY TODAY / IF IGNORED / DO — four lines, nothing else. */
function fourLines(a: Alert) {
  return {
    what: a.what ?? a.title,
    why: a.why_today ?? (a.due_date ? `Due ${a.due_date}` : a.body ?? 'Needs a decision today'),
    ifIgnored: a.if_ignored ?? 'It stays broken until someone acts',
    doLabel: a.action_label ?? 'Open alert',
    doUrl: `${SITE}${a.action_url ?? '/admin/alerts'}`,
  };
}

async function sendUrgent(admin: SupabaseClient, a: Alert, reminder: boolean) {
  const f = fourLines(a);
  const prefix = reminder ? 'STILL OPEN' : 'URGENT';
  const smsBody = `Tidy ${prefix}\nWHAT: ${f.what}\nWHY TODAY: ${f.why}\nIF IGNORED: ${f.ifIgnored}\nDO: ${f.doUrl}`;
  let sms = 'not_sent';
  try {
    const res = await vendorFetch(`${URL_}/functions/v1/send-twilio-sms`, {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_phone_e164: OWNER_PHONE, body: smsBody.slice(0, 600), idempotency_key: `admin-alert:${a.id}:${reminder ? 'r' : 'n'}`, template_name: 'admin_urgent_alert', triggered_by: 'admin-alert-dispatch', skip_window: true, admin_channel: 'urgent' }),
    });
    const out = await res.json().catch(() => ({}));
    sms = out?.sent ? 'sent' : `failed:${out?.error ?? res.status}`;
  } catch (e) { sms = `failed:${(e as Error).message}`; }
  const mail = await sendBrevoEmail({
    to: OWNER_EMAIL, marketing: false, adminChannel: 'urgent', label: 'admin-alert-dispatch',
    subject: `${reminder ? 'Still open' : 'Urgent'}: ${f.what}`.slice(0, 150),
    htmlContent: ownerEmail({
      date: et().date, edition: reminder ? 'Still open after 4 hours' : 'Urgent',
      attention: [{ text: f.what, url: f.doUrl, label: f.doLabel }],
      unresolved: [{ text: f.what, url: f.doUrl, label: f.doLabel }],
      sections: [{ title: 'Why today', items: [{ text: f.why }] }, { title: 'If ignored', red: true, items: [{ text: f.ifIgnored }] }],
    }),
    tags: ['admin-urgent'],
  }).catch((e) => ({ sent: false, reason: (e as Error).message }));
  const result = `sms:${sms};email:${mail.sent ? 'sent' : `failed:${(mail as { reason?: string }).reason}`}`;
  await admin.from('admin_alerts').update(reminder ? { reminded_at: new Date().toISOString(), notify_result: result } : { notified_at: new Date().toISOString(), notify_result: result }).eq('id', a.id);
  return result;
}

const canSendNow = (a: Alert) => isDaytime() || a.night_ok;
const open = (a: Alert) => !a.resolved_at && !(a.snoozed_until && Date.parse(a.snoozed_until) > Date.now());

async function digest(admin: SupabaseClient, edition: 'today' | 'tonight', force = false, preview = false) {
  const { date: today } = et();
  if (!force && !preview) {
    const { error } = await admin.from('admin_digest_runs').insert({ edition, run_date: today });
    if (error) return { skipped: 'already_sent' };
  }
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [{ data: alerts, error: alertError }, { data: testP, error: testPError }, { data: testA, error: testAError }] = await Promise.all([
    admin.from('admin_alerts').select('*').is('resolved_at', null).neq('tier', 'dashboard').order('created_at', { ascending: false }).limit(1000),
    admin.from('contractor_pipeline').select('applicant_id').eq('is_test', true),
    admin.from('applicants').select('id').eq('is_test_row', true),
  ]);
  if (alertError || testPError || testAError) throw new Error(alertError?.message ?? testPError?.message ?? testAError?.message);
  const testIds = new Set<string>([...(testP ?? []).map((p) => p.applicant_id), ...(testA ?? []).map((a) => a.id)]);
  const all = visibleDigestAlerts((alerts ?? []) as Alert[], testIds);
  const urgentOpen = all.filter((a) => a.tier === 'urgent');
  const recent = all.filter((a) => a.tier !== 'urgent' && a.created_at >= since);
  const mustDo = all.filter((a) => a.tier !== 'urgent' && ((a.due_date && a.due_date <= today) || a.level === 'action') && a.created_at >= since);
  const dayStart = edition === 'today' ? etMidnightUtc(addDays(today, -1)) : etMidnightUtc(today);
  const dayEnd = edition === 'today' ? etMidnightUtc(today) : new Date().toISOString();
  const count = async (t: string, col: string, extra?: (q: any) => any) => {
    let q = admin.from(t).select('*', { count: 'exact', head: true }).gte(col, dayStart).lt(col, dayEnd);
    if (extra) q = extra(q);
    const { count: c } = await q; return c ?? 0;
  };
  const reservations = await count('reservations', 'created_at', (q) => q.eq('is_test_row', false));
  const { data: reset, error: resetError } = await admin.from('app_settings').select('value').eq('key', 'reporting_reset_at').maybeSingle();
  if (resetError) throw resetError;
  const baseline = typeof reset?.value === 'string' ? reset.value : dayStart;
  const scans = await count('qr_scans', 'created_at', (q) => q.gte('created_at', baseline));
  const launch = await loadLaunchConfig(admin as never);
  const conversionOpen = !!launch.cleaning?.conversion_date && today >= launch.cleaning.conversion_date;
  const operationsOpen = !!launch.cleaning?.first_visit_date && today >= launch.cleaning.first_visit_date;
  const visitsDone = operationsOpen ? await count('visits', 'completed_at', (q) => q.eq('is_sample', false)) : 0;
  const [{ data: periodVisits, error: visitError }, { data: members, error: memberError }] = await Promise.all([
    admin.from('visits').select('service, status, assigned_pro_id').eq('is_sample', false).gte('scheduled_start', dayStart).lt('scheduled_start', dayEnd).not('status', 'in', '(canceled,skipped)'),
    admin.from('subscriptions').select('user_id').eq('status', 'active'),
  ]);
  if (visitError || memberError) throw new Error(visitError?.message ?? memberError?.message);
  const actualVisits = (operationsOpen ? periodVisits ?? [] : []).filter((v) => !testIds.has(v.assigned_pro_id ?? ''));
  const operations = [['Cleaning', 'cleaning'], ['Lawn', 'lawn'], ['Car Care', 'detailing']].map(([service, key]) => {
    const jobs = actualVisits.filter((v) => v.service === key);
    return { service, total: jobs.length, completed: jobs.filter((v) => v.status === 'complete').length };
  });
  const { data: inv } = await admin.from('invoices').select('amount_cents').eq('status', 'paid').gte('paid_at', dayStart).lt('paid_at', dayEnd);
  const revenue = (conversionOpen ? inv ?? [] : []).reduce((s, r) => s + (r.amount_cents ?? 0), 0);
  const numbers = [`${reservations} reservations`, `${scans} QR scans`, `$${(revenue / 100).toFixed(0)} revenue`, `${visitsDone} visits done`];
  const anyNumbers = reservations + scans + revenue + visitsDone > 0;

  const sections: { title: string; red?: boolean; items: { text: string; url?: string; label?: string }[] }[] = [];
  const { data: completed, error: completionError } = await admin.from('contractor_pipeline')
    .select('applicant_id, service, apply_submitted_at, is_test, archived').gte('apply_submitted_at', dayStart).lt('apply_submitted_at', dayEnd);
  if (completionError) throw new Error(completionError.message);
  const applications = realCompletedApplications(completed ?? [], testIds, (r) => r.applicant_id);
  const { data: names, error: nameError } = applications.length
    ? await admin.from('applicants').select('id, first_name, last_name').in('id', applications.map((p) => p.applicant_id))
    : { data: [], error: null };
  if (nameError) throw new Error(nameError.message);
  const nameById = new Map((names ?? []).map((a) => [a.id, `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim()]));
  sections.push({ title: 'Applications completed', items: applications.map((a) => ({
    text: `${nameById.get(a.applicant_id) || 'Candidate'} · Submitted on Tidy · ${new Date(a.apply_submitted_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET · ${a.service === 'car_care' ? 'Car Care' : a.service}`,
    url: `${SITE}/admin/pipeline/${a.applicant_id}`, label: 'Review application + photos',
  })) });
  const item = (a: Alert) => ({ text: a.what ?? a.title, url: a.action_url ? `${SITE}${a.action_url}` : undefined, label: a.action_label ?? 'Open' });
  if (edition === 'today') {
    // Growth roadmap goes first: kickoffs from the last day, milestones, then 14-day "Coming up".
    const { data: rm } = await admin.from('roadmap_initiatives').select('*, items:roadmap_items(id, task, owner, lead_days, done)').order('sort');
    const inits = (rm ?? []) as (RInitiative & { kickoff_sent_at: string | null })[];
    const kick = inits.filter((i) => i.kickoff_sent_at && (force || i.kickoff_sent_at >= since) && i.items.length);
    sections.unshift({ title: 'New initiative starting', items: kick.map((i) => ({ text: kickoffText(i), url: `${SITE}/admin/roadmap`, label: 'Open roadmap' })) });
    sections.push({ title: 'Coming up', items: [
      ...inits.map((i) => milestoneLine(i, today)).filter((x): x is string => !!x).map((text) => ({ text })),
      ...roadmapComingUp(inits, today).map((r) => ({ text: `${r.due} · ${r.i.name}: ${r.x.task} (${r.x.owner})`, url: `${SITE}/admin/roadmap`, label: 'Open' })),
    ] });
    sections.push({ title: 'Must do today', items: mustDo.map(item) });
    sections.push({ title: 'Unresolved urgent', red: true, items: urgentOpen.map(item) });
    // Nextdoor can't be auto-posted: today's post, with its copy, image and a Mark posted button.
    const { data: nd } = await admin.from('social_launch_posts').select('id, caption, template_copy, image_url, scheduled_for, status')
      .eq('channel', 'nextdoor').is('archived_at', null).is('posted_at', null)
      .gte('scheduled_for', etMidnightUtc(today)).lt('scheduled_for', etMidnightUtc(addDays(today, 1)));
    const lc = await loadLaunchConfig(admin as never);
    const anchors = { launch: lc.cleaning?.first_visit_date ?? null, conversion: lc.cleaning?.conversion_date ?? null, carLaunch: lc.car?.first_visit_date ?? null, hangerDrop1: (lc.global?.hanger_drops ?? []).map((d) => d.start).sort()[0] ?? null };
    sections.push({ title: 'Post to Nextdoor today (6 PM)', items: (nd ?? []).map((p) => {
      const copy = renderTemplate((p.template_copy ?? p.caption ?? '').trim(), anchors, today);
      return {
      text: copy ? `${copy}${p.image_url ? `\n\nImage: ${p.image_url}` : ''}` : 'Needs a post — no copy written for this slot yet',
      url: `${SITE}/admin/social?post=${p.id}`, label: 'Copy + Mark posted',
    }; }) });
    // Car care opens on demand: running count until the threshold, then the advance line.
    const { data: car } = await admin.rpc('car_launch_status');
    const cs = car as { count: number; threshold: number; reached_at: string | null; first_visit_date: string | null } | null;
    if (cs && !cs.first_visit_date) {
      sections.push({ title: 'Car care', red: !!cs.reached_at, items: [cs.reached_at
        ? { text: `Car care reached ${cs.threshold} reservations. Advance your car Pro today.`, url: `${SITE}/admin/pipeline?service=detailing`, label: 'Open the pipeline' }
        : { text: `Car care: ${cs.count} of ${cs.threshold} reservations.` }] });
    }
    sections.push({ title: 'Yesterday in numbers', items: anyNumbers ? [{ text: numbers.join(' · ') }] : [] });
    // Coming up: calendar tasks + launch dates in the next 7 days.
    const next7 = addDays(today, 7);
    const { data: tasks } = await admin.from('calendar_tasks').select('title, next_due_date').is('done_at', null).gte('next_due_date', today).lte('next_due_date', next7).order('next_due_date');
    const cfg = await loadLaunchConfig(admin).catch(() => null);
    const coming: { text: string }[] = (tasks ?? []).map((t) => ({ text: `${t.next_due_date} · ${t.title}` }));
    if (cfg) {
      for (const [scope, row] of Object.entries(cfg).filter(([k]) => k !== 'global') as unknown as [string, Record<string, unknown>][]) {
        for (const [k, label] of [['conversion_date', 'conversion day'], ['first_visit_date', 'first visits'], ['pro_callback_date', 'Pro hire date'], ['pro_ready_by', 'Pro must be active']] as const) {
          const v = row?.[k] as string | null; if (v && v >= today && v <= next7) coming.push({ text: `${v} · ${scope} ${label}` });
        }
      }
      for (const d of ((cfg.global as { hanger_drops?: unknown } | undefined)?.hanger_drops ?? []) as { start: string; end: string }[]) if (d.start >= today && d.start <= next7) coming.push({ text: `${d.start} · door hanger drop starts` });
    }
    coming.sort((a, b) => a.text.localeCompare(b.text));
    sections.push({ title: 'Next 7 days', items: coming });
    // Day 5 with equipment proof incomplete: one-tap Hold / Decline (reason preset "No equipment", editable). Never auto-declined.
    const { data: overdue } = await admin.rpc('pipeline_proof_overdue');
    const fmtD = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
    sections.push({ title: 'Proof overdue', items: ((overdue ?? []) as { applicant_id: string; name: string; service: string; sent_at: string }[]).flatMap((o) => [
      { text: `Proof overdue: ${o.name} (${o.service}), sent ${fmtD(o.sent_at)}`, url: `${SITE}/admin/pipeline/${o.applicant_id}?action=hold`, label: 'Hold' },
      { text: `Decline ${o.name} — No equipment`, url: `${SITE}/admin/pipeline/${o.applicant_id}?action=decline&reason=No%20equipment`, label: 'Decline' },
    ]) });
    // Demand report three days before cleaning/lawn conversion and on conversion day.
    const conv = (cfg as Record<string, { conversion_date?: string | null }> | null)?.cleaning?.conversion_date ?? null;
    if (conv && (today === conv || today === addDays(conv, -3))) {
      const { data: dem } = await admin.rpc('sched_demand_rows');
      const rows = (dem ?? []) as { service: string; zip: string; day: string; share: number; flagged: boolean; fit_pct: number }[];
      const fit = new Map<string, number>(); for (const r of rows) fit.set(`${r.service} ${r.zip}`, r.fit_pct);
      sections.push({ title: 'Demand vs. claimed days (calendar locks soon)', red: rows.some((r) => r.flagged), items: [
        ...[...fit].map(([k, p]) => ({ text: `${k}: ${p}% of reservations fit a claimed day` })),
        ...rows.filter((r) => r.flagged).map((r) => ({ text: `UNCOVERED: ${r.service} ${r.zip} ${r.day} — ${r.share}% of preferences, no Pro claim`, url: `${SITE}/admin/demand`, label: 'Open demand' })),
        ...(rows.length ? [] : [{ text: 'No reservation preferences yet.', url: `${SITE}/admin/demand`, label: 'Open demand' }]),
      ] });
    }
  } else {
    const openToday = [...urgentOpen, ...recent];
    sections.push({ title: 'Still open from today', red: urgentOpen.length > 0, items: openToday.map(item) });
    sections.push({ title: 'Today in numbers', items: anyNumbers ? [{ text: numbers.join(' · ') }] : [] });
    const tmr = addDays(today, 1);
    const { data: tv } = await admin.from('visits').select('assigned_pro_id').gte('scheduled_start', etMidnightUtc(tmr)).lt('scheduled_start', etMidnightUtc(addDays(tmr, 1))).not('status', 'in', '(canceled,skipped)');
    const pros = new Set((tv ?? []).map((v) => v.assigned_pro_id).filter(Boolean)).size;
    const noPro = (tv ?? []).filter((v) => !v.assigned_pro_id).length;
    const tmrItems = (tv ?? []).length ? [{ text: `${(tv ?? []).length} visits · ${pros} Pros on route${noPro ? ` · ${noPro} without a Pro` : ''}` }] : [];
    const { data: dueT } = await admin.from('calendar_tasks').select('title').is('done_at', null).eq('next_due_date', tmr);
    for (const t of dueT ?? []) tmrItems.push({ text: `Due: ${t.title}` });
    sections.push({ title: 'Tomorrow', items: tmrItems });
    // First-visit probation (in place of a skills test): each completed probation visit, photos one tap away.
    const { data: prob } = await admin.rpc('pipeline_probation_checks', { _since: etMidnightUtc(today) });
    sections.push({ title: 'Probation checks', items: ((prob ?? []) as { name: string; visit_id: string; n: number }[]).map((v) => ({
      text: `Probation check: ${v.name}, visit ${v.n} of 3`, url: `${SITE}/admin/photos?visit=${v.visit_id}`, label: 'Photos',
    })) });
    // More than 3 urgent today → say so, so the noisy ones can be re-tiered.
    const urgentToday = urgentOpen.filter((a) => a.created_at >= etMidnightUtc(today));
    if (urgentToday.length > 3) sections.push({ title: `${urgentToday.length} urgent alerts today — re-tier the noisy ones?`, red: true, items: urgentToday.map((u) => ({ text: `${u.title} (${u.alert_type})`, url: `${SITE}/admin/alerts#tiers`, label: 'Change tier' })) });
  }

  const shown = sections.filter((s) => s.items.length);
  const nothing = edition === 'today' && !mustDo.length;
  const heading = edition === 'today' ? 'Today' : 'Tonight';
  const pulse = { revenue, bookings: reservations, households: new Set((members ?? []).map((s) => s.user_id)).size, pros: new Set(actualVisits.map((v) => v.assigned_pro_id).filter(Boolean)).size };
  const html = ownerEmail({ date: today, edition: heading, pulse, operations, attention: [...urgentOpen, ...mustDo].map(item), unresolved: all.map(item), sections: shown.filter((s) => !['Must do today', 'Unresolved urgent', 'Still open from today', 'Yesterday in numbers', 'Today in numbers'].includes(s.title)) });
  if (preview) return { edition, preview: true, sections: shown, completed_applications: applications.length, open_alerts: all.length, html };
  const mail = shown.length || nothing
    ? await sendBrevoEmail({
        to: OWNER_EMAIL, marketing: false, adminChannel: 'digest', label: 'admin-digest',
        subject: `TIDY / The Daily Signal · ${heading}${urgentOpen.length ? ` · ${urgentOpen.length} unresolved` : ''}`,
        htmlContent: html,
        tags: ['admin-digest'],
      }).catch((e) => ({ sent: false, reason: (e as Error).message }))
    : { sent: false, reason: 'empty' };
  let sms = 'skipped';
  if (edition === 'today') {
    const line1 = nothing ? 'Nothing needs you today.' : `${mustDo.length} to do today`;
    const line2 = urgentOpen.length ? `${urgentOpen.length} unresolved urgent` : (anyNumbers ? `Yesterday: ${numbers.slice(0, 2).join(', ')}` : 'No unresolved urgent items');
    const res = await vendorFetch(`${URL_}/functions/v1/send-twilio-sms`, {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_phone_e164: OWNER_PHONE, body: `Tidy Today\n${line1}\n${line2}\n${SITE}/admin/alerts`, idempotency_key: `admin-digest:${today}${force ? `:${Date.now()}` : ''}`, template_name: 'admin_digest_today', triggered_by: 'admin-alert-dispatch', skip_window: true, admin_channel: 'digest' }),
    }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    sms = out?.sent ? 'sent' : `failed:${out?.error ?? res?.status ?? 'network'}`;
  }
  const emailResult = mail.sent ? 'sent' : `failed:${(mail as { reason?: string }).reason}`;
  await admin.from('email_send_log').insert({
    template_name: 'admin-digest', channel: 'email', recipient: OWNER_EMAIL,
    triggered_by: 'admin-alert-dispatch', status: mail.sent ? 'sent' : 'failed',
    brevo_message_id: (mail as { messageId?: string }).messageId ?? null,
    error_message: mail.sent ? null : (mail as { reason?: string }).reason ?? 'unknown',
    payload: { edition, open_alerts: all.length, completed_applications: applications.length },
  });
  if (!force) await admin.from('admin_digest_runs').update({ email_result: emailResult, sms_result: sms, body: { sections: shown } }).eq('edition', edition).eq('run_date', today);
  return { edition, email: emailResult, sms, sections: shown.map((s) => `${s.title} (${s.items.length})`), nothing };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const cron = await isCronAuthorized(req);
  const auth = cron ? { ok: true as const } : await requireServiceOrAdmin(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({})) as { mode?: string; alert_id?: string; edition?: 'today' | 'tonight' };
  const mode = body.mode ?? 'hourly';

  if (mode === 'urgent' && body.alert_id) {
    const { data } = await admin.from('admin_alerts').select('*').eq('id', body.alert_id).maybeSingle();
    const a = data as Alert | null;
    if (!a || a.tier !== 'urgent' || a.notified_at || !open(a)) return json({ ok: true, skipped: 'not_pending' });
    if (!canSendNow(a)) return json({ ok: true, held: 'overnight_to_9am' });
    return json({ ok: true, result: await sendUrgent(admin, a, false) });
  }

  if (mode === 'test_urgent') {
    const { data, error } = await admin.from('admin_alerts').insert({
      alert_type: 'test_urgent', level: 'critical', category: 'site', tier: 'urgent', night_ok: true,
      title: 'Test urgent alert', what: 'Test urgent alert from /admin/alerts', why_today: 'You pressed "Send test"',
      if_ignored: 'Nothing — this is a test', action_label: 'Open alerts', action_url: '/admin/alerts',
      dedupe_key: `test_urgent:${Date.now()}`,
    }).select('id').single();
    return json({ ok: !error, alert_id: data?.id, error: error?.message, note: 'Sent by the database trigger within seconds.' });
  }
  if (mode === 'test_digest') return json({ ok: true, ...(await digest(admin, body.edition ?? 'today', true)) });
  if (mode === 'preview_digest') return json({ ok: true, ...(await digest(admin, body.edition ?? 'tonight', false, true)) });

  // hourly
  const out: Record<string, unknown> = {};
  const { data: rows } = await admin.from('admin_alerts').select('*').eq('tier', 'urgent').is('resolved_at', null).limit(200);
  let sent = 0, reminded = 0;
  for (const a of ((rows ?? []) as Alert[]).filter(open)) {
    if (!a.notified_at && canSendNow(a)) { await sendUrgent(admin, a, false); sent++; continue; }
    if (a.notified_at && !a.reminded_at && Date.now() - Date.parse(a.notified_at) >= 4 * 3_600_000 && canSendNow(a)) { await sendUrgent(admin, a, true); reminded++; }
  }
  out.sent = sent; out.reminded = reminded;
  const h = et().hour;
  // Overnight urgent items are folded into the 9 AM digest — mark them notified so they don't also text at 9:01.
  if (h === 9) {
    out.digest = await digest(admin, 'today');
    await admin.from('admin_alerts').update({ notified_at: new Date().toISOString(), notify_result: 'in_9am_digest' }).eq('tier', 'urgent').is('notified_at', null).is('resolved_at', null);
  }
  if (h === 21) out.digest = await digest(admin, 'tonight');
  return json({ ok: true, ...out });
});
