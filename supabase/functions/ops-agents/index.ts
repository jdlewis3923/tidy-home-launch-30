import '../_shared/http.ts';
// Tidy OPS agents — one consolidated tick (every 15 min) runs each enabled agent when due.
// Agents handle checks and write exceptions (database-first). Messaging still goes only through
// the existing senders/ticks; this function never sends customer or Pro texts itself.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { isCronAuthorized } from '../_shared/cron-auth.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
type DB = ReturnType<typeof createClient>;
type Exc = { severity: 'urgent' | 'high' | 'normal' | 'info'; title: string; detail?: string; action_label?: string; action_url?: string; dedupe_key?: string };
type Ctx = { db: DB; test: boolean; now: Date; et: { hour: number; minute: number; dow: number; date: string } };
type Result = { checked: number; log: string[]; exceptions: Exc[] };

function etParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  const dows: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: Number(p.hour) % 24, minute: Number(p.minute), dow: dows[p.weekday], date: `${p.year}-${p.month}-${p.day}` };
}
const addDays = (date: string, n: number) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function meters(a: number, b: number, c: number, d: number) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function must<T extends { error: any }>(r: T): T { if (r.error) throw new Error(r.error.message ?? String(r.error)); return r; }
const testFilter = (q: any, col: string, test: boolean) => q.eq(col, test);

// Due rules in Eastern time; the tick runs every 15 minutes.
const DUE: Record<string, (e: Ctx['et']) => boolean> = {
  pay_reconciler: (e) => e.dow === 4 && e.hour === 18 && e.minute < 15,
  tomorrow_guard: (e) => e.hour === 18 && e.minute < 15,
  late_watcher: () => true,
  hiring_agent: () => true,
  size_verifier: (e) => e.minute < 15,
  plan_corrector: (e) => e.minute < 15,
  quality_watcher: (e) => e.minute < 15,
  billing_agent: (e) => e.minute < 15,
  system_health: (e) => e.minute < 15,
  pro_compliance: (e) => e.hour === 7 && e.minute < 15,
  capacity_hire: (e) => e.hour === 7 && e.minute < 15,
  seal_first_visit: (e) => e.hour === 7 && e.minute < 15,
  digests: (e) => (e.hour === 9 || e.hour === 21) && e.minute < 15,
};

const AGENTS: Record<string, (c: Ctx) => Promise<Result>> = {
  async pay_reconciler({ db, test, et }) {
    const weekStart = addDays(et.date, -((et.dow + 6) % 7));
    const { data } = must(await testFilter(db.from('visits').select('id,visit_date,status,check_in_at,check_out_at,check_in_lat,check_in_lng,address_lat,address_lng,check_in_location_reason,budget_hours,contractor_pay_cents,customer_first_name').gte('visit_date', weekStart).lte('visit_date', et.date).eq('status', 'complete'), 'is_sample', test));
    const ex: Exc[] = []; const log: string[] = [];
    const {data:redos}=must(await db.from('redo_pay_decisions').select('*').eq('is_test',test).gte('decided_at',`${weekStart}T00:00:00Z`));
    for(const redo of redos??[]){
      const expected=redo.paid?Math.round(redo.original_rate_cents/2):0;
      const {data:actual,error}=await db.from('visits').select('visit_pay_cents').eq('id',redo.visit_id).single();if(error)throw error;
      const {data:prior, error:priorError}=await db.from('redo_pay_decisions').select('redo_id').eq('member_id',redo.member_id).eq('is_test',test).eq('paid',true).neq('redo_id',redo.redo_id).gt('decided_at',new Date(Date.parse(redo.decided_at)-60*86400000).toISOString()).lt('decided_at',redo.decided_at);if(priorError)throw priorError;
      if(redo.amount_cents!==expected||actual.visit_pay_cents!==expected||redo.paid===(!!prior?.length)||!redo.credited_at)ex.push({severity:'high',title:'Redo pay guardrail mismatch',detail:`${redo.redo_id}: expected ${expected} cents; one paid redo/member/60 days.`,action_url:'/admin/command#redos',dedupe_key:`redo-pay:${redo.redo_id}`});
      log.push(`${redo.redo_id}: ${redo.label}, ${redo.amount_cents} cents`);
    }
    for (const v of data ?? []) {
      const issues: string[] = [];
      if (!v.check_in_at || !v.check_out_at) issues.push('missing check-in or check-out');
      if (v.check_in_lat != null && v.address_lat != null) {
        const m = meters(v.check_in_lat, v.check_in_lng, v.address_lat, v.address_lng);
        if (m > 150 && !v.check_in_location_reason) issues.push(`checked in ${Math.round(m)} m away with no reason`);
      }
      // Owner rule (Oct 28): until the real-phone GPS test passes, geofence is noted, not blocking.
      log.push(`${v.id}: geofence GPS unverified`);
      if (v.check_in_at && v.check_out_at && v.budget_hours) {
        const hrs = (new Date(v.check_out_at).getTime() - new Date(v.check_in_at).getTime()) / 3.6e6;
        const pct = hrs / Number(v.budget_hours);
        if (pct < 0.5 || pct > 1.75) issues.push(`time on site ${Math.round(pct * 100)}% of budget`);
      }
      if (issues.length) ex.push({ severity: 'high', title: `Pay line held: ${v.customer_first_name ?? 'visit'} ${v.visit_date}`, detail: issues.join('; ') + '. Not paid until you approve.', action_label: 'Approve / Adjust', action_url: `/admin/pay?visit=${v.id}`, dedupe_key: `pay:${v.id}` });
    }
    log.unshift(`${(data ?? []).length} completed visits checked, ${ex.length} held`);
    return { checked: (data ?? []).length, log, exceptions: ex };
  },

  async size_verifier({ db, test, now }) {
    const cutoff = new Date(now.getTime() - 48 * 3.6e6).toISOString();
    const { data } = must(await testFilter(db.from('reservations').select('id,first_name,street,zip,created_at,services,cleaning_selected_size,cleaning_verified_at,lawn_selected_size,lawn_verified_at,converted_at').is('converted_at', null), 'is_test_row', test));
    const ex: Exc[] = [];
    for (const r of data ?? []) {
      const needClean = r.cleaning_selected_size && !r.cleaning_verified_at;
      const needLawn = r.lawn_selected_size && !r.lawn_verified_at;
      if ((needClean || needLawn) && r.created_at < cutoff) {
        const addr = encodeURIComponent(`${r.street ?? ''} ${r.zip ?? ''}`.trim());
        ex.push({ severity: 'normal', title: `Unverified ${needClean ? 'home' : 'lawn'} size over 48h: ${r.first_name ?? ''}`, detail: `Property appraiser: https://www.miamidade.gov/Apps/PA/propertysearch/#/?address=${addr}`, action_label: 'Verify size', action_url: needClean ? '/admin/cleaning-verification' : '/admin/lawn-verification', dedupe_key: `size:${r.id}` });
      }
    }
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} open reservations, ${ex.length} unverified after 48h`], exceptions: ex };
  },

  async plan_corrector({ db, now }) {
    const cutoff = new Date(now.getTime() - 48 * 3.6e6).toISOString();
    const { data } = must(await db.from('size_reviews').select('id,service,booked_size,observed_size,status,created_at,customer_responded_at').is('customer_responded_at', null).not('status', 'in', '(resolved,approved,declined,closed)'));
    const ex = (data ?? []).filter((s: any) => s.created_at < cutoff).map((s: any) => ({ severity: 'normal' as const, title: `Member hasn't answered size change (${s.service})`, detail: `${s.booked_size} → ${s.observed_size}. Never charged without approval.`, action_label: 'Review', action_url: '/admin/size-reviews', dedupe_key: `plan:${s.id}` }));
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} open size reports`], exceptions: ex };
  },

  async tomorrow_guard({ db, test, et }) {
    const tmr = addDays(et.date, 1);
    const { data } = must(await testFilter(db.from('visits').select('id,service,assigned_pro_id,subscription_id,customer_first_name,status').eq('visit_date', tmr).eq('status', 'scheduled'), 'is_sample', test));
    const ex: Exc[] = [];
    for (const v of data ?? []) {
      if (!v.assigned_pro_id) ex.push({ severity: 'urgent', title: `No Pro for tomorrow: ${v.customer_first_name ?? ''} (${v.service})`, action_label: 'Assign Pro', action_url: '/admin/schedule', dedupe_key: `tmr:${v.id}` });
    }
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} visits tomorrow (${tmr})`], exceptions: ex };
  },

  async late_watcher({ db, test, now, et }) {
    const { data } = must(await testFilter(db.from('visits').select('id,scheduled_start,check_in_at,customer_first_name,assigned_pro_id').eq('visit_date', et.date).eq('status', 'scheduled').is('check_in_at', null).not('scheduled_start', 'is', null), 'is_sample', test));
    const ex: Exc[] = [];
    for (const v of data ?? []) {
      const late = (now.getTime() - new Date(v.scheduled_start).getTime()) / 60000;
      if (late >= 30) ex.push({ severity: 'urgent', title: `Pro 30+ min late: ${v.customer_first_name ?? ''}`, detail: 'Member needs a new ETA.', action_label: 'Open visit', action_url: `/admin/visits/${v.id}`, dedupe_key: `late30:${v.id}` });
      else if (late >= 15) ex.push({ severity: 'high', title: `No check-in 15 min after window: ${v.customer_first_name ?? ''}`, action_label: 'Open visit', action_url: `/admin/visits/${v.id}`, dedupe_key: `late15:${v.id}` });
    }
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} not-yet-checked-in visits today`], exceptions: ex };
  },

  async quality_watcher({ db, now }) {
    const since = new Date(now.getTime() - 7 * 864e5).toISOString();
    const { data } = must(await db.from('visit_ratings').select('id,rating,stars,visit_id,created_at').gte('created_at', since));
    const low = (data ?? []).filter((r: any) => (r.rating ?? r.stars ?? 5) <= 3);
    const ex: Exc[] = [];
    for (const r of low) {
      const { count } = await db.from('redo_requests').select('id', { count: 'exact', head: true }).eq('visit_id', r.visit_id);
      if (!count) ex.push({ severity: 'high', title: `Low rating (${r.rating ?? r.stars}) without a redo`, action_label: 'Create redo', action_url: '/admin/redos', dedupe_key: `qual:${r.id}` });
    }
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} ratings this week, ${low.length} at 3 or below`], exceptions: ex };
  },

  async billing_agent({ db }) {
    const { data } = must(await db.from('subscriptions').select('id,status,stripe_status,latest_invoice_attempt_count,paused_until').in('stripe_status', ['past_due', 'unpaid', 'incomplete']));
    const ex = (data ?? []).map((s: any) => ({ severity: 'normal' as const, title: `Payment failing (${s.stripe_status}, attempt ${s.latest_invoice_attempt_count ?? 0})`, detail: 'Day-7 pause and auto-unpause run in the member billing tick.', action_label: 'Open billing', action_url: '/admin/billing', dedupe_key: `bill:${s.id}:${s.latest_invoice_attempt_count ?? 0}` }));
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} subscriptions with failed payments`], exceptions: ex };
  },

  async pro_compliance({ db, et }) {
    const { data } = must(await db.from('contractor_insurance').select('id,applicant_id,expiration_date,verification_status').not('expiration_date', 'is', null).lte('expiration_date', addDays(et.date, 30)));
    const ex = (data ?? []).map((c: any) => {
      const expired = c.expiration_date < et.date; const d7 = c.expiration_date <= addDays(et.date, 7);
      return { severity: expired ? 'urgent' as const : d7 ? 'high' as const : 'normal' as const, title: expired ? 'Pro insurance expired — no new visits' : `Pro insurance expires ${c.expiration_date}`, action_label: 'Open Pro', action_url: `/admin/applicants/${c.applicant_id}`, dedupe_key: `coi:${c.id}:${expired ? 'x' : d7 ? '7' : '30'}` };
    });
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} certificates within 30 days of expiry`], exceptions: ex };
  },

  async capacity_hire({ db, test }) {
    const { data } = must(await testFilter(db.from('reservations').select('services').is('converted_at', null), 'is_test_row', test));
    const counts: Record<string, number> = {};
    for (const r of data ?? []) for (const s of (Array.isArray(r.services) ? r.services : [])) counts[String(s)] = (counts[String(s)] ?? 0) + 1;
    const ex = Object.entries(counts).filter(([, n]) => n >= 10).map(([s, n]) => ({ severity: 'normal' as const, title: `${n} reservations for ${s} — advance that service's Pro`, action_label: 'Open pipeline', action_url: '/admin/pipeline', dedupe_key: `cap:${s}:${Math.floor(n / 10)}` }));
    return { checked: (data ?? []).length, log: [`Reservations by service: ${JSON.stringify(counts)}`], exceptions: ex };
  },

  async hiring_agent({ db, now }) {
    const since = new Date(now.getTime() - 24 * 3.6e6).toISOString();
    const { data } = must(await db.from('applicants').select('id,first_name,last_name,service,created_at,first_texted_at,is_test_row').gte('created_at', since).eq('is_test_row', false));
    const ex = (data ?? []).filter((a: any) => !a.first_texted_at && now.getTime() - new Date(a.created_at).getTime() > 5 * 60000)
      .map((a: any) => ({ severity: 'normal' as const, title: `New applicant not texted yet: ${a.first_name ?? ''} ${a.last_name ?? ''}`, detail: `${a.service ?? ''}. Texts wait for your approved list and quiet hours.`, action_label: 'Open applicant', action_url: `/admin/applicants/${a.id}`, dedupe_key: `hire:${a.id}` }));
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} new applicants in last 24h`], exceptions: ex };
  },

  async seal_first_visit({ db, test, et }) {
    const { data } = must(await testFilter(db.from('visits').select('id,visit_date,assigned_pro_id,customer_first_name,size_tier').eq('cleaning_first_visit', true).gte('visit_date', et.date).lte('visit_date', addDays(et.date, 7)), 'is_sample', test));
    const ex = (data ?? []).filter((v: any) => !v.assigned_pro_id).map((v: any) => ({ severity: 'normal' as const, title: `First visit ${v.visit_date} has no Pro to carry the window seal`, detail: String(v.size_tier ?? '').includes('estate') ? 'Estate home: 1.5× first-visit pay.' : undefined, action_label: 'Assign Pro', action_url: '/admin/schedule', dedupe_key: `seal:${v.id}` }));
    return { checked: (data ?? []).length, log: [`${(data ?? []).length} first visits in next 7 days`], exceptions: ex };
  },

  async system_health({ db, now }) {
    const ex: Exc[] = []; const log: string[] = [];
    for (const zip of ['33156', '33183', '33186']) {
      try { const r = await fetch(`https://jointidy.co/founding?zip=${zip}`); log.push(`QR ${zip}: ${r.status}`); if (!r.ok) ex.push({ severity: 'urgent', title: `Hanger link ${zip} returns ${r.status}`, dedupe_key: `qr:${zip}` }); }
      catch (e) { ex.push({ severity: 'urgent', title: `Hanger link ${zip} unreachable`, detail: String(e), dedupe_key: `qr:${zip}` }); }
    }
    const { count: noKey } = await db.from('stripe_catalog').select('id', { count: 'exact', head: true }).eq('active', true).is('lookup_key', null);
    log.push(`Active prices missing lookup key: ${noKey ?? 0}`);
    if (noKey) ex.push({ severity: 'urgent', title: `${noKey} active prices missing lookup keys`, dedupe_key: 'stripe:lookup' });
    const since = new Date(now.getTime() - 7 * 864e5).toISOString();
    const { data: ev } = must(await db.from('sms_delivery_events').select('message_status').gte('created_at', since));
    const total = (ev ?? []).length; const failed = (ev ?? []).filter((e: any) => ['failed', 'undelivered'].includes(e.message_status)).length;
    log.push(`Text receipts 7d: ${total}, failed ${failed}`);
    if (total >= 20 && failed / total > 0.05) ex.push({ severity: 'urgent', title: `Text failures ${Math.round(failed / total * 100)}% this week`, dedupe_key: 'sms:fail' });
    const { count: unconf } = await db.from('social_launch_posts').select('id', { count: 'exact', head: true }).eq('status', 'unconfirmed');
    log.push(`Social posts unconfirmed: ${unconf ?? 0}`);
    if (unconf) ex.push({ severity: 'high', title: `${unconf} social posts not confirmed live`, detail: 'Not resent automatically.', action_url: '/admin/social', action_label: 'Review', dedupe_key: `social:unconf:${unconf}` });
    const hr = new Date(now.getTime() - 3.6e6).toISOString();
    const { count: bad } = await db.from('cron_runs').select('id', { count: 'exact', head: true }).gte('scheduled_at', hr).or('timed_out.eq.true,http_status.gte.400');
    log.push(`Failed scheduled jobs last hour: ${bad ?? 0}`);
    if (bad) ex.push({ severity: 'urgent', title: `${bad} scheduled jobs failed in the last hour`, action_url: '/admin/health', action_label: 'Open health', dedupe_key: `cron:${hr.slice(0, 13)}` });
    return { checked: 7, log, exceptions: ex };
  },

  async digests({ db, test, et }) {
    const { data } = must(await db.from('ops_agent_exceptions').select('severity,title,action_url').is('resolved_at', null).eq('is_test', test));
    const order = { urgent: 0, high: 1, normal: 2, info: 3 } as Record<string, number>;
    const list = (data ?? []).sort((a: any, b: any) => order[a.severity] - order[b.severity]);
    if (!test && list.length) {
      await db.from('admin_alerts').insert({ alert_type: 'ops_digest', level: list.some((x: any) => x.severity === 'urgent') ? 'critical' : 'action', category: 'operations', title: `${et.hour < 12 ? '9 AM' : '9 PM'} ops digest: ${list.length} open`, body: list.slice(0, 25).map((x: any) => `• [${x.severity}] ${x.title}`).join('\n'), action_label: 'Open agents', action_url: '/admin/agents', dedupe_key: `ops_digest:${et.date}:${et.hour}` });
    }
    return { checked: list.length, log: [`${list.length} open exceptions in digest`], exceptions: [] };
  },
};

async function runAgent(c: Ctx, key: string) {
  const { data: run } = must(await c.db.from('ops_agent_runs').insert({ agent_key: key, is_test: c.test }).select('id').single());
  let status = 'ok', error: string | null = null, res: Result = { checked: 0, log: [], exceptions: [] };
  try { res = await AGENTS[key](c); } catch (e) { status = 'error'; error = String(e); }
  if (c.test && status === 'ok' && res.exceptions.length === 0) {
    res.exceptions.push({ severity: 'info', title: `Example exception (test run): ${key.replace(/_/g, ' ')}`, detail: 'No test records needed action; this shows how an exception appears.', dedupe_key: `example:${key}:${Date.now()}` });
  }
  let inserted = 0;
  for (const e of res.exceptions) {
    const { error: ie } = await c.db.from('ops_agent_exceptions').insert({ ...e, agent_key: key, run_id: run?.id, is_test: c.test });
    if (!ie) inserted++;
    if (!ie && e.severity === 'urgent' && !c.test) {
      await c.db.from('admin_alerts').insert({ alert_type: `ops_${key}`, level: 'critical', category: 'operations', title: e.title, body: e.detail ?? '', action_label: e.action_label, action_url: e.action_url, dedupe_key: `ops:${e.dedupe_key ?? crypto.randomUUID()}` });
    }
  }
  await c.db.from('ops_agent_runs').update({ finished_at: new Date().toISOString(), status, error, checked: res.checked, exceptions: inserted, log: res.log }).eq('id', run?.id);
  await c.db.from('ops_agents').update({ last_run_at: new Date().toISOString(), last_status: status, last_summary: error ?? res.log[0] ?? '' }).eq('key', key);
  return { key, status, checked: res.checked, exceptions: inserted, error };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = createClient(URL_, KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'test' || body?.mode === 'run' ? body.mode : 'tick';
  let authorized = await isCronAuthorized(req);
  if (!authorized) {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: u } = await db.auth.getUser(jwt);
    if (u?.user) { const { data: ok } = await db.rpc('has_role', { _user_id: u.user.id, _role: 'admin' }); authorized = !!ok; }
  }
  if (!authorized) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
  const now = new Date();
  const ctx: Ctx = { db, test: mode === 'test', now, et: etParts(now) };
  const { data: agents } = must(await db.from('ops_agents').select('key,enabled').order('sort'));
  const only = typeof body?.agent === 'string' ? body.agent : null;
  const results = [];
  for (const a of agents ?? []) {
    if (only && a.key !== only) continue;
    if (!AGENTS[a.key]) continue;
    if (mode === 'tick' && (!a.enabled || !DUE[a.key](ctx.et))) continue;
    results.push(await runAgent(ctx, a.key));
  }
  return new Response(JSON.stringify({ mode, results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
