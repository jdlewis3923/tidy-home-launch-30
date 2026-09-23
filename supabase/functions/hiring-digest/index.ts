import '../_shared/http.ts';
/**
 * hiring-digest — 7:00 AM and 6:00 PM America/New_York, to hello@jointidy.co.
 *
 * The alerts themselves already exist in the database; this only delivers them.
 * A Brevo failure is logged to email_send_log and integration_logs and returned
 * in the response so /admin/health can show it — it never reads as all-clear
 * and never crashes.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { isCronAuthorized } from '../_shared/cron-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';

const TO = 'hello@jointidy.co';
const LEVEL_ORDER = ['critical', 'action', 'warning'] as const;

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

function easternHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })
      .format(new Date()),
  );
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

  let body: { edition?: string } = {};
  try { body = await req.json(); } catch { /* scheduled call may send nothing */ }
  const edition = body.edition === 'evening' || body.edition === 'morning'
    ? body.edition
    : easternHour() >= 12 ? 'evening' : 'morning';

  const nowIso = new Date().toISOString();
  const { data: alerts } = await admin
    .from('admin_alerts')
    .select('id, level, category, title, body, action_label, action_url, due_date, snoozed_until, created_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false });

  const open = (alerts ?? []).filter(
    (a) => !a.snoozed_until || String(a.snoozed_until) <= nowIso,
  );

  const sections = LEVEL_ORDER.map((level) => {
    const rows = open.filter((a) => a.level === level);
    if (rows.length === 0) return '';
    const items = rows.map((a) => {
      const link = a.action_url
        ? ` — <a href="https://jointidy.co${esc(String(a.action_url))}">${esc(String(a.action_label ?? 'Open'))}</a>`
        : '';
      return `<li><strong>${esc(String(a.title))}</strong>${link}${a.body ? `<br><span style="color:#475569">${esc(String(a.body))}</span>` : ''}</li>`;
    }).join('');
    return `<h3 style="margin:18px 0 6px">${level[0].toUpperCase()}${level.slice(1)} (${rows.length})</h3><ul>${items}</ul>`;
  }).join('');

  // The evening edition also carries tomorrow's calls and any service going live.
  let tomorrowBlock = '';
  if (edition === 'evening') {
    const start = new Date(Date.now() + 86_400_000);
    const from = `${start.toISOString().slice(0, 10)}T00:00:00Z`;
    const to = `${start.toISOString().slice(0, 10)}T23:59:59Z`;
    const [{ data: calls }, { data: gates }] = await Promise.all([
      admin.from('applicants').select('first_name, last_name, service, call_at')
        .gte('call_at', from).lte('call_at', to).order('call_at'),
      admin.from('service_gates').select('service, go_live_scheduled_for').not('go_live_scheduled_for', 'is', null),
    ]);
    const callItems = (calls ?? []).map(
      (c) => `<li>${esc(`${c.first_name ?? ''} ${c.last_name ?? ''}`.trim())} (${esc(String(c.service ?? ''))}) — ${esc(String(c.call_at))}</li>`,
    ).join('');
    const liveItems = (gates ?? [])
      .filter((g) => String(g.go_live_scheduled_for ?? '').slice(0, 10) === start.toISOString().slice(0, 10))
      .map((g) => `<li>${esc(String(g.service))} goes live at 7:00 AM</li>`).join('');
    tomorrowBlock =
      `<h3 style="margin:18px 0 6px">Tomorrow</h3><ul>${callItems || '<li>No calls booked.</li>'}${liveItems}</ul>`;
  }

  const subject = `Tidy ${edition === 'evening' ? 'evening' : 'morning'} digest — ${open.length} open`;
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#0f172a">` +
    `<h2 style="margin:0">${esc(subject)}</h2>` +
    (sections || '<p>Nothing open right now.</p>') +
    tomorrowBlock +
    `<p style="margin-top:20px"><a href="https://jointidy.co/admin/alerts">Open the alerts page</a></p></div>`;

  const result = await sendBrevoEmail({
    to: TO, marketing: false, subject, htmlContent: html,
    sender: { name: 'Tidy Home Concierge', email: 'hello@jointidy.co' },
    tags: ['admin-digest', edition], label: 'hiring-digest',
  });


  await admin.from('integration_logs').insert({
    source: 'brevo',
    event: `hiring_digest_${edition}`,
    status: result.sent ? 'ok' : 'error',
    error_message: result.sent ? null : (result.reason ?? 'unknown'),
    detail: { open: open.length, status: result.status ?? null },
  });

  return new Response(
    JSON.stringify({ ok: true, edition, open: open.length, email_sent: result.sent, email_reason: result.reason ?? null }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
