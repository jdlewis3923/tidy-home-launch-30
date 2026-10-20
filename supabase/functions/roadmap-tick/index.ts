import '../_shared/http.ts';
/**
 * roadmap-tick — hourly. Texts the owner about the growth roadmap.
 *  - 8 AM ET on launch day: switch ON if checklist done + gate passed → "{name} is live."
 *    Otherwise stays OFF and an URGENT alert lists what's missing.
 *  - 8 AM–9 PM ET: kickoff text once per initiative (14 days before first item due);
 *    URGENT alert (once per day) for overdue items or launch < 7 days with checklist < 100%.
 *  mode 'test_kickoff' (admin): sends one [TEST] kickoff text for an initiative; changes nothing.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { vendorFetch } from '../_shared/http.ts';
import { kickoffDue, kickoffText, launchDecision, urgentReasons, type Initiative } from '../_shared/roadmap-rules.ts';

const URL_ = Deno.env.get('SUPABASE_URL') ?? '';
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OWNER_PHONE = Deno.env.get('JUSTIN_ALERT_PHONE') ?? '+17868291141';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function et(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { hour: Number(p.hour) % 24, date: `${p.year}-${p.month}-${p.day}` };
}

async function text(body: string, key: string) {
  const res = await vendorFetch(`${URL_}/functions/v1/send-twilio-sms`, {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_phone_e164: OWNER_PHONE, body: body.slice(0, 600), idempotency_key: key, template_name: 'roadmap_owner', triggered_by: 'roadmap-tick', skip_window: true, admin_channel: 'urgent' }),
  });
  const out = await res.json().catch(() => ({}));
  return out?.sent ? 'sent' : `failed:${out?.error ?? res.status}`;
}

async function load(admin: SupabaseClient): Promise<Initiative[]> {
  const { data, error } = await admin.from('roadmap_initiatives').select('*, items:roadmap_items(id, task, owner, lead_days, done)').order('sort');
  if (error) throw new Error(error.message);
  return (data ?? []) as Initiative[];
}

const log = (admin: SupabaseClient, initiative_id: string, kind: string, detail: string) =>
  admin.from('roadmap_events').insert({ initiative_id, kind, detail });

async function urgent(admin: SupabaseClient, i: Initiative, lines: string[], today: string, tag: string) {
  await admin.from('admin_alerts').insert({
    alert_type: 'roadmap_urgent', level: 'critical', category: 'operations', tier: 'urgent', night_ok: true,
    title: `${i.name}: ${lines.length} problem${lines.length === 1 ? '' : 's'}`,
    what: `${i.name}: ${lines.join('; ')}`.slice(0, 400), why_today: tag,
    if_ignored: 'The initiative slips or launches incomplete', action_label: 'Open roadmap', action_url: '/admin/roadmap',
    dedupe_key: `roadmap:${i.id}:${tag}:${today}`,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const cron = await isCronAuthorized(req);
  const auth = cron ? { ok: true as const } : await requireServiceOrAdmin(req);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const admin = createClient(URL_, KEY, { auth: { persistSession: false } });
  const body = await req.json().catch(() => ({})) as { mode?: string; initiative_id?: string };
  const list = await load(admin);
  const { hour, date: today } = et();

  if (body.mode === 'test_kickoff') {
    const i = list.find((x) => x.id === body.initiative_id) ?? list.find((x) => !x.is_template);
    if (!i) return json({ ok: false, error: 'no_initiative' }, 404);
    const r = await text(`[TEST] ${kickoffText(i)}`, `roadmap-test-kickoff:${i.id}:${Date.now()}`);
    await log(admin, i.id, 'test_kickoff', r);
    return json({ ok: r === 'sent', result: r, initiative: i.name });
  }

  const out: string[] = [];
  if (hour < 8 || hour >= 21) return json({ ok: true, skipped: 'quiet_hours' });
  for (const i of list) {
    if (hour === 8) {
      const d = launchDecision(i, today);
      if (d && (i as unknown as { launch_checked_on: string | null }).launch_checked_on !== today) {
        await admin.from('roadmap_initiatives').update(d.go ? { switch_on: true, launch_checked_on: today } : { launch_checked_on: today }).eq('id', i.id);
        if (d.go) { const r = await text(`${i.name} is live.`, `roadmap-live:${i.id}:${today}`); await log(admin, i.id, 'auto_launch', r); out.push(`${i.name}: live`); }
        else { await urgent(admin, i, d.missing.map((m) => `Missing: ${m}`), today, 'Launch day — switch stayed OFF'); await log(admin, i.id, 'launch_blocked', d.missing.join('; ')); out.push(`${i.name}: blocked`); }
        continue;
      }
    }
    if (kickoffDue(i, today)) {
      const r = await text(kickoffText(i), `roadmap-kickoff:${i.id}`);
      if (r === 'sent') await admin.from('roadmap_initiatives').update({ kickoff_sent_at: new Date().toISOString() }).eq('id', i.id);
      await log(admin, i.id, 'kickoff', r); out.push(`${i.name}: kickoff ${r}`);
    }
    const reasons = urgentReasons(i, today);
    if (reasons.length) { await urgent(admin, i, reasons, today, 'Checklist behind'); out.push(`${i.name}: urgent`); }
  }
  return json({ ok: true, today, actions: out });
});
