// Public: create (or update) a founding reservation. No card, no account, no Stripe.
// WRITE FIRST, NOTIFY SECOND: the row is saved and success returned before any
// email/SMS is attempted; a notification failure is logged for admin only.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { writeAlert } from '../_shared/alerts.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { tidyEmailShell, TIDY_OWNER_EMAIL } from '../_shared/email-brand.ts';
import { queueSms, isWindowOpen, nextOpenWindow } from '../_shared/sms-window.ts';
import { toE164 } from '../_shared/member-followups.ts';
import { RESERVATION_ALERTS, RESERVABLE_SERVICES, LAUNCH_DATE_LONG_ES } from '../_shared/launch.ts';
import { esc, logEmail, reservationConfirmEmail, foundingConfirmEmail, reservationConfirmSms, svcLabel } from '../_shared/reservation-emails.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Any day'] as const;

const Line = z.object({
  service: z.enum(RESERVABLE_SERVICES), size: z.union([z.number().int(), z.string().max(20)]).nullable(),
  cadence: z.string().max(20).nullable(), monthly: z.number().min(0).max(5000), visits_per_month: z.number().min(0).max(10),
});
const usPhone = (s: string) => { const d = s.replace(/\D/g, ''); return d.length === 10 || (d.length === 11 && d.startsWith('1')); };
const Body = z.object({
  first_name: z.string().trim().min(1).max(60), last_name: z.string().trim().max(60).default(''),
  email: z.string().trim().email().max(200), phone: z.string().trim().min(7).max(30).refine(usPhone, 'US mobile number required'),
  sms_consent: z.boolean().default(false),
  services: z.array(z.enum(RESERVABLE_SERVICES)).min(1).max(3),
  lines: z.array(Line).max(3), quote: z.record(z.unknown()),
  street: z.string().trim().min(3).max(200), city: z.string().trim().max(80).default(''),
  zip: z.string().trim().regex(/^\d{5}$/),
  preferred_day: z.enum(DAYS), preferred_time: z.enum(['morning', 'afternoon']),
  heard_from: z.enum(['door_hanger', 'nextdoor', 'google', 'referral', 'other']), heard_other: z.string().trim().max(200).optional(),
  lang: z.enum(['en', 'es']).default('en'), is_test: z.boolean().optional(),
  // /founding extras
  src: z.string().trim().max(60).optional(), session_id: z.string().trim().min(8).max(64).optional(),
  gift_addons: z.array(z.string().max(60)).max(2).default([]),
  website: z.string().max(200).optional(), // honeypot
  page: z.enum(['founding', 'builder']).default('builder'),
});

async function serviceCount(svc: string) {
  const { count } = await admin.from('reservations').select('id', { count: 'exact', head: true }).neq('status', 'canceled').contains('services', [svc]);
  return count ?? 0;
}

// deno-lint-ignore no-explicit-any
async function notify(row: any, isUpdate: boolean, page: string) {
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[reservation-submit] ${name} failed`, msg);
      await admin.from('integration_logs').insert({ source: 'reservation-submit', event: `notify.${name}_failed`, status: 'error', error_message: msg, detail: { reservation_id: row.id } }).then(() => {}, () => {});
      await writeAlert(admin, { level: 'warn', category: 'reservations', title: `Reservation ${name} failed`, body: `${row.first_name} (${row.zip}) is saved, but the ${name} did not send: ${msg}`, action_label: 'Open reservations', action_url: '/admin/reservations', dedupe_key: `res_notify_${name}:${row.id}`, context: { reservation_id: row.id } });
    }
  };
  await step('member email', async () => {
    const em = page === 'founding'
      ? foundingConfirmEmail(row, LAUNCH_DATE_LONG_ES)
      : reservationConfirmEmail(row);
    const sent = await sendBrevoEmail({ to: { email: row.email, name: row.first_name }, marketing: false, subject: em.subject, htmlContent: em.html, label: 'reservation-confirm', tags: ['reservation'] });
    await logEmail(admin, page === 'founding' ? 'founding-reservation-confirm' : 'reservation-confirm', row.email, em.subject, sent, 'reservation-submit');
    if (!sent.sent) throw new Error(sent.reason ?? 'send failed');
  });
  await step('member text', async () => {
    const phone = toE164(row.phone);
    if (!phone || !row.sms_consent) return;
    const now = new Date();
    const r = await queueSms(admin, { to_phone_e164: phone, body: reservationConfirmSms(row.first_name), idempotency_key: `reservation_confirm:${row.id}:${row.update_count}`, template_name: 'reservation_confirm', triggered_by: 'reservation-submit' }, 'reservation_confirm', isWindowOpen(now) ? now : nextOpenWindow(now));
    if (!r.queued) throw new Error(String(r.error ?? 'queue failed'));
  });
  const lines = (row.lines ?? []) as Array<{ service: string; size: unknown; cadence: string | null; monthly: number }>;
  const summary = `${row.services.map(svcLabel).join(', ')} · ${row.zip} · ${row.preferred_day} ${row.preferred_time}`;
  await step('owner email', async () => {
    const detail = lines.map((l) => `${esc(svcLabel(l.service))} · size ${esc(String(l.size))}${l.service !== 'detailing' && l.cadence ? ` · ${esc(l.cadence)}` : ''} · ${l.size === 'quote' ? 'CUSTOM QUOTE — price manually' : `$${Math.round(l.monthly)}/mo`}`).join('<br>');
    const subject = `${isUpdate ? 'Updated' : 'New'} reservation — ${row.first_name} · ${summary}`;
    const sent = await sendBrevoEmail({ to: TIDY_OWNER_EMAIL, marketing: false, subject, label: 'reservation-owner',
      htmlContent: tidyEmailShell({ heading: isUpdate ? 'A reservation was updated' : 'A new founding reservation', eyebrow: 'Reservations', bodyHtml: `<p><b>${esc(row.first_name)} ${esc(row.last_name)}</b> · ${esc(row.email)} · ${esc(row.phone)}</p><p>${detail}</p><p>${esc(summary)}<br>${esc(row.street)} ${esc(row.zip)}<br>${row.custom_quote ? 'Includes a custom quote' : `Monthly total $${(row.monthly_cents / 100).toFixed(2)}`} · ${row.founding ? 'FOUNDING' : 'standard terms'} · src ${esc(row.src ?? '—')} · lang ${esc(row.lang)}${row.gift_addons?.length ? `<br>Free add-on(s): ${esc(row.gift_addons.join(', '))}` : ''}</p>`, ctaUrl: 'https://jointidy.co/admin/reservations', ctaLabel: 'Open reservations' }) });
    await logEmail(admin, 'reservation-owner', TIDY_OWNER_EMAIL, subject, sent, 'reservation-submit');
    if (!sent.sent) throw new Error(sent.reason ?? 'send failed');
  });
  await step('workday entry', async () => {
    await admin.from('admin_workday_events').insert({ event_type: 'reservation_new', actor_type: 'customer', title: `${isUpdate ? 'Updated' : 'New'} reservation · ${row.first_name} ${row.last_name?.[0] ?? ''}.`, detail: summary + (row.custom_quote ? ' · custom quote needed' : ''), action_label: 'Open reservations', action_url: '/admin/reservations', metadata: { reservation_id: row.id, is_test: row.is_test_row } });
  });
  if (isUpdate) return;
  await step('hiring trigger', async () => {
    for (const s of row.services as string[]) {
      const total = await serviceCount(s);
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
  });
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  const limited = await enforceRateLimit(req, { bucket: 'reservation-submit', limit: 6, windowSeconds: 3600 });
  if (limited) return limited;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;
  // Honeypot: bots get a convincing success and nothing is written or counted.
  if (b.website && b.website.trim()) return jsonResponse({ ok: true, id: null, updated: false, founding: true });

  const services = Array.from(new Set(b.services));
  const lines = b.lines.filter((l) => services.includes(l.service));
  const customQuote = lines.some((l) => l.size === 'quote');
  const monthlyCents = Math.round(lines.filter((l) => l.size !== 'quote').reduce((n, l) => n + l.monthly, 0) * 100);
  const email = b.email.toLowerCase();

  // Duplicate detection: same email OR same street+ZIP updates the existing reservation.
  const { data: dupes } = await admin.from('reservations').select('id, founding, update_count, street, zip, email')
    .neq('status', 'canceled').or(`email.eq.${email},and(zip.eq.${b.zip},street.ilike.${b.street.replace(/[,()%*]/g, ' ').trim()})`).order('created_at').limit(1);
  const existing = dupes?.[0];

  const record = {
    first_name: b.first_name, last_name: b.last_name, email, phone: b.phone, sms_consent: b.sms_consent,
    services, waitlist_services: [] as string[], quote: b.quote, lines, monthly_cents: monthlyCents,
    street: b.street, city: b.city, zip: b.zip, preferred_day: b.preferred_day, preferred_time: b.preferred_time,
    heard_from: b.heard_from, heard_other: b.heard_from === 'other' ? (b.heard_other || null) : null,
    lang: b.lang, is_test_row: !!b.is_test, src: b.src ?? null, session_id: b.session_id ?? null,
    gift_addons: b.gift_addons, custom_quote: customQuote,
  };
  const q = existing
    ? admin.from('reservations').update({ ...record, update_count: (existing.update_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq('id', existing.id)
    : admin.from('reservations').insert(record);
  const { data: row, error } = await q.select('*').single();
  if (error || !row) { console.error('[reservation-submit] write', error?.message); return jsonResponse({ ok: false, error: 'insert_failed' }, 500); }

  if (b.session_id) {
    await admin.from('founding_events').insert({ session_id: b.session_id, event: 'reserved', src: b.src ?? null, zip: b.zip, lang: b.lang, reservation_id: row.id }).then(() => {}, () => {});
  }

  // Notifications run after the response; they can never fail the reservation.
  const job = notify(row, !!existing, b.page).catch((e) => console.error('[reservation-submit] notify crashed', e));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(job);

  return jsonResponse({ ok: true, id: row.id, updated: !!existing, founding: row.founding, waitlist: [] });
});
