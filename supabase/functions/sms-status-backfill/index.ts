import '../_shared/http.ts';
// Delivery truth for texts: asks Twilio for the real status of every recent text that has
// no delivery receipt, records it in sms_delivery_events, writes the status back onto the
// onboarding pack rows, and raises URGENT alerts for failed/undelivered texts and for
// "sent" texts with no carrier id. Read-only toward Twilio; never sends a message.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { alertSmsFailure } from '../_shared/sms-failure.ts';

const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
const reply = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const FINAL = new Set(['delivered', 'undelivered', 'failed', 'canceled', 'read']);
const last10 = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await isCronAuthorized(req))) {
    const auth = await requireServiceOrAdmin(req);
    if (!auth.ok) return reply({ error: auth.error }, auth.status);
  }
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
  const tok = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
  if (!sid || !tok) return reply({ ok: false, error: 'twilio_not_configured' }, 500);
  const days = 14;
  const since = new Date(Date.now() - days * 864e5).toISOString();

  // 1. Every text with a carrier id in the window (outbox + direct-send log).
  const { data: ob } = await db.from('sms_outbox').select('id,to_phone_e164,twilio_sid,template_name,status,body,sent_at').gte('created_at', since).not('twilio_sid', 'is', null);
  const { data: lg } = await db.from('sms_log').select('twilio_message_id,context,sent_at').gte('created_at', since).not('twilio_message_id', 'is', null);
  const sids = new Map<string, { phone?: string; template?: string | null }>();
  for (const o of ob ?? []) sids.set(o.twilio_sid, { phone: o.to_phone_e164, template: o.template_name });
  for (const l of lg ?? []) if (!sids.has(l.twilio_message_id)) sids.set(l.twilio_message_id, { phone: (l.context as any)?.to ?? undefined, template: (l.context as any)?.template_name ?? null });
  const { data: known } = await db.from('sms_delivery_events').select('message_sid,message_status').in('message_sid', [...sids.keys()].slice(0, 1000));
  const final = new Set((known ?? []).filter((k: any) => FINAL.has(k.message_status)).map((k: any) => k.message_sid));

  const results: Record<string, number> = {};
  const problems: unknown[] = [];
  for (const [msid, meta] of sids) {
    if (final.has(msid)) continue;
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages/${msid}.json`, { headers: { Authorization: `Basic ${btoa(`${sid}:${tok}`)}` } });
    if (!r.ok) { results[`lookup_${r.status}`] = (results[`lookup_${r.status}`] ?? 0) + 1; continue; }
    const m = await r.json();
    results[m.status] = (results[m.status] ?? 0) + 1;
    await db.from('sms_delivery_events').insert({
      message_sid: msid, message_status: m.status, to_number: m.to, from_number: m.from,
      error_code: m.error_code ? String(m.error_code) : null, error_message: m.error_message ?? null,
      messaging_service_sid: m.messaging_service_sid ?? null, raw: { source: 'backfill', date_sent: m.date_sent, date_updated: m.date_updated },
      received_at: new Date().toISOString(),
    });
    if (m.status === 'failed' || m.status === 'undelivered') {
      problems.push({ sid: msid, status: m.status, error: m.error_code });
      await alertSmsFailure(db, { phone: m.to ?? meta.phone ?? '', template: meta.template ?? null, error: `${m.status}${m.error_code ? ` (carrier code ${m.error_code})` : ''}${m.error_message ? `: ${m.error_message}` : ''}`, key: `carrier:${msid}` });
    }
  }

  // 2. "Sent" with no carrier id older than 10 minutes → we cannot prove it went out.
  const { data: nosid } = await db.from('sms_outbox').select('id,to_phone_e164,template_name,sent_at').eq('status', 'sent').is('twilio_sid', null).gte('created_at', since).lt('updated_at', new Date(Date.now() - 6e5).toISOString());
  for (const o of nosid ?? []) {
    problems.push({ outbox: o.id, status: 'sent_without_sid' });
    await alertSmsFailure(db, { phone: o.to_phone_e164, template: o.template_name, error: 'Marked sent, but the texting service returned no message id, so delivery cannot be confirmed.', key: `nosid:${o.id}` });
  }

  // 3. Write real status back onto onboarding pack rows still showing "queued".
  const { data: packs } = await db.from('onboarding_pack_sends').select('id,applicant_id,body,sms_status,sms_result,created_at').eq('sms_status', 'queued');
  let packsUpdated = 0;
  for (const p of packs ?? []) {
    const { data: a } = await db.from('applicants').select('phone').eq('id', p.applicant_id).maybeSingle();
    const match = (ob ?? []).find((o: any) => last10(o.to_phone_e164) === last10(a?.phone) && o.body === p.body)
      ?? (await db.from('sms_outbox').select('id,to_phone_e164,twilio_sid,status,body,sent_at').eq('body', p.body ?? '').order('created_at', { ascending: false }).limit(5)).data?.find((o: any) => last10(o.to_phone_e164) === last10(a?.phone));
    if (!match || match.status === 'queued') continue;
    const { data: ev } = match.twilio_sid ? await db.from('sms_delivery_events').select('message_status').eq('message_sid', match.twilio_sid).order('received_at', { ascending: false }).limit(1) : { data: [] };
    const status = ev?.[0]?.message_status ?? match.status;
    await db.from('onboarding_pack_sends').update({ sms_status: status === 'delivered' ? 'delivered' : status === 'sent' ? 'accepted' : status, sms_result: { ...(p.sms_result as object ?? {}), outbox_id: match.id, twilio_sid: match.twilio_sid, sent_at: match.sent_at, carrier_status: status, synced_at: new Date().toISOString() } }).eq('id', p.id);
    packsUpdated++;
  }

  await db.from('integration_logs').insert({ source: 'internal', event: 'sms-status-backfill', status: problems.length ? 'error' : 'success', detail: { checked: sids.size, results, problems, packsUpdated } });
  return reply({ ok: true, checked: sids.size, results, problems, packs_updated: packsUpdated });
});
