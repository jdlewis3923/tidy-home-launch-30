// Admin: Convert a reservation — one email + one text with a personal link to
// a prefilled checkout. action 'preview' renders without sending or writing.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { TIDY_SITE } from '../_shared/email-brand.ts';
import { queueSms, isWindowOpen, nextOpenWindow } from '../_shared/sms-window.ts';
import { toE164 } from '../_shared/member-followups.ts';
import { convertEmail } from '../_shared/reservation-emails.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const Body = z.object({
  action: z.enum(['preview', 'convert']), id: z.string().uuid(),
  day: z.string().trim().min(3).max(30), window: z.string().trim().min(3).max(40), pro_first_name: z.string().trim().min(1).max(40),
});
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (x) => x.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  const b = parsed.data;
  const { data: r } = await admin.from('reservations').select('*').eq('id', b.id).maybeSingle();
  if (!r) return jsonResponse({ ok: false, error: 'not_found' }, 404);
  if (r.status === 'converted' || r.status === 'canceled') return jsonResponse({ ok: false, error: `already_${r.status}` }, 409);

  const t = r.invite_token ?? token();
  const link = `${TIDY_SITE}/reserve/confirm/${t}`;
  const msg = convertEmail({ first_name: r.first_name, assigned_day: b.day, assigned_window: b.window, assigned_pro_first_name: b.pro_first_name }, link);
  if (b.action === 'preview') return jsonResponse({ ok: true, to: r.email, phone: r.phone, subject: msg.subject, html: msg.html, sms: msg.sms });

  await admin.from('reservations').update({ invite_token: t, invited_at: new Date().toISOString(), status: 'invited', assigned_day: b.day, assigned_window: b.window, assigned_pro_first_name: b.pro_first_name }).eq('id', r.id);
  const sent = await sendBrevoEmail({ to: { email: r.email, name: r.first_name }, marketing: false, subject: msg.subject, htmlContent: msg.html, label: 'reservation-convert', tags: ['reservation'] });
  let sms: string = 'no_consent';
  const phone = toE164(r.phone);
  if (phone && r.sms_consent) {
    const now = new Date();
    const q = await queueSms(admin, { to_phone_e164: phone, body: msg.sms, idempotency_key: `reservation_convert:${r.id}:${t.slice(0, 8)}:${b.day}:${b.window}`, template_name: 'reservation_convert', triggered_by: 'reservation-admin' }, 'reservation_convert', isWindowOpen(now) ? now : nextOpenWindow(now));
    sms = q.queued ? 'queued' : (q.error ?? 'failed');
  }
  await admin.from('admin_workday_events').insert({ event_type: 'reservation_invited', actor_type: 'admin', actor_user_id: auth.userId, title: `Convert sent · ${r.first_name}`, detail: `${b.day}, ${b.window} with ${b.pro_first_name} · email ${sent.sent ? 'sent' : sent.reason} · text ${sms}`, action_url: '/admin/reservations', metadata: { reservation_id: r.id } });
  return jsonResponse({ ok: true, email: sent.sent ? 'sent' : sent.reason, sms, link });
});
