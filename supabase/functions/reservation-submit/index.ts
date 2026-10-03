// Public: create a founding reservation. No card, no account, no Stripe.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell, TIDY_OWNER_EMAIL } from '../_shared/email-brand.ts';
import { queueSms, isWindowOpen, nextOpenWindow } from '../_shared/sms-window.ts';
import { toE164 } from '../_shared/member-followups.ts';
import { FOUNDING_CAP, RESERVATION_ALERTS, RESERVABLE_SERVICES } from '../_shared/launch.ts';
import { esc, reservationConfirmEmail, reservationConfirmSms, svcLabel } from '../_shared/reservation-emails.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Any day'] as const;

const Line = z.object({
  service: z.enum(RESERVABLE_SERVICES), size: z.union([z.number().int(), z.string().max(20)]).nullable(),
  cadence: z.string().max(20).nullable(), monthly: z.number().min(0).max(5000), visits_per_month: z.number().min(0).max(10),
});
const Body = z.object({
  first_name: z.string().trim().min(1).max(60), last_name: z.string().trim().max(60).default(''),
  email: z.string().trim().email().max(200), phone: z.string().trim().min(7).max(30),
  sms_consent: z.boolean().default(false),
  services: z.array(z.enum(RESERVABLE_SERVICES)).min(1).max(3),
  lines: z.array(Line).max(3), quote: z.record(z.unknown()),
  street: z.string().trim().min(3).max(200), city: z.string().trim().max(80).default(''),
  zip: z.string().trim().regex(/^\d{5}$/),
  preferred_day: z.enum(DAYS), preferred_time: z.enum(['morning', 'afternoon']),
  heard_from: z.enum(['door_hanger', 'nextdoor', 'google', 'referral', 'other']), heard_other: z.string().trim().max(200).optional(),
  lang: z.enum(['en', 'es']).default('en'), is_test: z.boolean().optional(),
});

async function serviceCount(svc: string, includeWaitlist: boolean) {
  let q = admin.from('reservations').select('id', { count: 'exact', head: true }).neq('status', 'canceled').contains('services', [svc]);
  if (!includeWaitlist) q = q.not('waitlist_services', 'cs', `{${svc}}`);
  const { count } = await q;
  return count ?? 0;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  const limited = await enforceRateLimit(req, { bucket: 'reservation-submit', limit: 6, windowSeconds: 3600 });
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;
  const services = Array.from(new Set(b.services));
  const lines = b.lines.filter((l) => services.includes(l.service));

  const waitlist: string[] = [];
  for (const s of services) if ((await serviceCount(s, false)) >= FOUNDING_CAP) waitlist.push(s);
  const monthlyCents = Math.round(lines.filter((l) => !waitlist.includes(l.service)).reduce((n, l) => n + l.monthly, 0) * 100);

  const { data: row, error } = await admin.from('reservations').insert({
    first_name: b.first_name, last_name: b.last_name, email: b.email.toLowerCase(), phone: b.phone, sms_consent: b.sms_consent,
    services, waitlist_services: waitlist, quote: b.quote, lines, monthly_cents: monthlyCents,
    street: b.street, city: b.city, zip: b.zip, preferred_day: b.preferred_day, preferred_time: b.preferred_time,
    heard_from: b.heard_from, heard_other: b.heard_from === 'other' ? (b.heard_other || null) : null,
    lang: b.lang, is_test_row: !!b.is_test,
  }).select('*').single();
  if (error || !row) { console.error('[reservation-submit] insert', error?.message); return jsonResponse({ ok: false, error: 'insert_failed' }, 500); }

  const out: Record<string, unknown> = {};
  // Member confirmation email.
  const em = reservationConfirmEmail(row);
  const sent = await sendBrevoEmail({ to: { email: row.email, name: row.first_name }, marketing: false, subject: em.subject, htmlContent: em.html, label: 'reservation-confirm', tags: ['reservation'] });
  out.email = sent.sent ? 'sent' : sent.reason;
  // Member confirmation text (only with consent; parked in the outbox like every text).
  const phone = toE164(row.phone);
  if (phone && row.sms_consent) {
    const now = new Date();
    const r = await queueSms(admin, { to_phone_e164: phone, body: reservationConfirmSms(row.first_name), idempotency_key: `reservation_confirm:${row.id}`, template_name: 'reservation_confirm', triggered_by: 'reservation-submit' }, 'reservation_confirm', isWindowOpen(now) ? now : nextOpenWindow(now));
    out.sms = r.queued ? 'queued' : r.error;
  } else out.sms = phone ? 'no_consent' : 'bad_phone';

  // Owner notice + Workday line.
  const summary = `${services.map(svcLabel).join(', ')} · ${row.zip} · ${row.preferred_day} ${row.preferred_time}`;
  await admin.from('admin_workday_events').insert({ event_type: 'reservation_new', actor_type: 'customer', title: `New reservation · ${row.first_name} ${row.last_name?.[0] ?? ''}.`, detail: summary + (waitlist.length ? ` · waitlist: ${waitlist.map(svcLabel).join(', ')}` : ''), action_label: 'Open reservations', action_url: '/admin/reservations', metadata: { reservation_id: row.id, is_test: row.is_test_row } });
  await sendBrevoEmail({ to: TIDY_OWNER_EMAIL, marketing: false, subject: `New reservation — ${row.first_name} · ${summary}`, label: 'reservation-owner',
    htmlContent: tidyEmailShell({ heading: 'A new founding reservation', eyebrow: 'Reservations', bodyHtml: `<p><b>${esc(row.first_name)} ${esc(row.last_name)}</b> · ${esc(row.email)} · ${esc(row.phone)}</p><p>${esc(summary)}<br>${esc(row.street)} ${esc(row.zip)}<br>Est. $${(monthlyCents / 100).toFixed(2)}/mo · heard via ${esc(row.heard_from)}</p>`, ctaUrl: 'https://jointidy.co/admin/reservations', ctaLabel: 'Open reservations' }) });

  // Hiring triggers (count every reservation for the service, waitlist included).
  for (const s of services) {
    const total = await serviceCount(s, true);
    for (const a of RESERVATION_ALERTS) {
      if (total < a.at) continue;
      const key = `reservations_${a.key}:${s}`;
      const { count: exists } = await admin.from('admin_workday_events').select('id', { count: 'exact', head: true }).eq('event_type', 'reservation_threshold').eq('metadata->>key', key);
      if (exists) continue;
      const title = a.title(svcLabel(s).toLowerCase());
      await admin.from('admin_workday_events').insert({ event_type: 'reservation_threshold', actor_type: 'system', title, detail: `${total} ${svcLabel(s)} reservations.`, status: 'open', waiting_on_admin: true, action_label: 'Open Call Queue', action_url: '/admin/applicants', metadata: { key, service: s, count: total } });
      await writeAlert(admin, { level: 'action', category: 'hiring', title, body: `${total} ${svcLabel(s)} reservations. Ten reservations is roughly five paid homes after conversion.`, action_label: 'Open Call Queue', action_url: '/admin/applicants', dedupe_key: key, context: { service: s, count: total } });
    }
  }

  return jsonResponse({ ok: true, id: row.id, waitlist, ...out });
});
