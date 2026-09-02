// Tidy — A3. A booked job was reassigned away from the customer's preferred Pro.
//
// Fired by the public.on_pro_visit_reassigned trigger (pg_net) whenever
// pro_visits.contractor_id changes on a still-scheduled visit. This only works
// when the reassignment happens in the Tidy app — a swap made directly in
// Jobber never reaches this path, which is why the admin reassignment control
// says so out loud.
//
// Behaviour:
//   - The outgoing Pro must actually be the customer's preferred Pro; other
//     routing churn is invisible to the customer.
//   - More than 2 hours before the arrival window: SMS + matching email.
//   - Less than 2 hours out: no SMS. An urgent admin alert is created so a
//     human calls. A text nobody reads is not notice.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ALERT_FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@jointidy.co';

const URGENT_WINDOW_MS = 2 * 60 * 60 * 1000;

function dayLabel(iso: string | null, lang: string): string {
  if (!iso) return lang === 'es' ? 'tu próxima visita' : 'your next visit';
  try {
    return new Intl.DateTimeFormat(lang === 'es' ? 'es-US' : 'en-US', {
      weekday: 'long',
      timeZone: 'America/New_York',
    }).format(new Date(iso));
  } catch {
    return lang === 'es' ? 'tu próxima visita' : 'your next visit';
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: {
    pro_visit_id?: string;
    jobber_visit_id?: string;
    old_contractor_id?: string;
    new_contractor_id?: string;
    scheduled_at?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }

  const { pro_visit_id, jobber_visit_id, old_contractor_id, new_contractor_id } = body;
  if (!old_contractor_id || !new_contractor_id) {
    return jsonResponse({ ok: false, error: 'contractor ids required' }, 400);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Who is the customer on this visit?
  let userId: string | null = null;
  let scheduledAt: string | null = body.scheduled_at ?? null;
  if (jobber_visit_id) {
    const { data: visit } = await admin
      .from('visits')
      .select('user_id, visit_date, time_window')
      .eq('jobber_visit_id', jobber_visit_id)
      .maybeSingle();
    userId = (visit as { user_id?: string } | null)?.user_id ?? null;
  }
  if (!scheduledAt && pro_visit_id) {
    const { data: pv } = await admin
      .from('pro_visits')
      .select('scheduled_at')
      .eq('id', pro_visit_id)
      .maybeSingle();
    scheduledAt = (pv as { scheduled_at?: string } | null)?.scheduled_at ?? null;
  }
  if (!userId) {
    return jsonResponse({ ok: true, sent: false, reason: 'no_customer_on_visit' });
  }

  // Was the outgoing Pro the customer's preferred Pro?
  const { data: sub } = await admin
    .from('subscriptions')
    .select('preferred_pro_id')
    .eq('user_id', userId)
    .maybeSingle();
  const preferredProId = (sub as { preferred_pro_id?: string } | null)?.preferred_pro_id ?? null;
  if (!preferredProId) {
    return jsonResponse({ ok: true, sent: false, reason: 'no_preferred_pro' });
  }

  const { data: pros } = await admin
    .from('applicants')
    .select('id, first_name, contractor_id')
    .in('contractor_id', [old_contractor_id, new_contractor_id]);
  const oldPro = (pros ?? []).find((p) => p.contractor_id === old_contractor_id);
  const newPro = (pros ?? []).find((p) => p.contractor_id === new_contractor_id);

  if (!oldPro || oldPro.id !== preferredProId) {
    return jsonResponse({ ok: true, sent: false, reason: 'outgoing_pro_not_preferred' });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('first_name, phone, language')
    .eq('user_id', userId)
    .maybeSingle();
  const lang = (profile as { language?: string } | null)?.language === 'es' ? 'es' : 'en';
  const phone = (profile as { phone?: string } | null)?.phone ?? null;

  const oldFirst = oldPro.first_name ?? 'Your Pro';
  const newFirst = newPro?.first_name ?? 'another Tidy Pro';
  const day = dayLabel(scheduledAt, lang);

  const message = lang === 'es'
    ? `Tidy: aviso — ${oldFirst} no está disponible para tu visita del ${day}. ${newFirst} la cubre, misma hora, mismo alcance. Responde STOP para no recibir mensajes.`
    : `Tidy: heads up — ${oldFirst} isn't available for your visit on ${day}. ${newFirst} is covering it, same time, same scope. Reply STOP to opt out.`;

  const msUntil = scheduledAt ? new Date(scheduledAt).getTime() - Date.now() : Number.POSITIVE_INFINITY;
  const urgent = Number.isFinite(msUntil) && msUntil < URGENT_WINDOW_MS;

  if (urgent) {
    // Inside 2 hours a text is not notice. A human calls.
    await admin.from('admin_alerts').insert({
      alert_type: 'preferred_pro_substitution_urgent',
      title: `Call customer — Pro swap inside 2h (${oldFirst} → ${newFirst})`,
      body:
        `A booked visit was reassigned away from the customer's preferred Pro less than 2 hours before ` +
        `the arrival window, so no SMS was sent. Call the customer.\n\n` +
        `Visit: ${jobber_visit_id ?? pro_visit_id}\nArrival: ${scheduledAt ?? 'unknown'}\n` +
        `Was: ${oldFirst}\nNow: ${newFirst}\nPhone: ${phone ?? 'not on file'}`,
      context: {
        pro_visit_id, jobber_visit_id, customer_id: userId,
        old_contractor_id, new_contractor_id, scheduled_at: scheduledAt,
        suppressed_sms: message,
      },
    });
    return jsonResponse({ ok: true, sent: false, urgent_alert: true, reason: 'inside_2h_window' });
  }

  let smsSent = false;
  if (phone) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-twilio-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          to_phone_e164: phone,
          body: message,
          idempotency_key: `pro-substitution-${pro_visit_id ?? jobber_visit_id}-${new_contractor_id}`,
          template_name: 'preferred-pro-substitution',
          triggered_by: 'notify-pro-substitution',
        }),
      });
      const json = await res.json().catch(() => ({}));
      smsSent = json?.sent === true;
    } catch (e) {
      console.error('[notify-pro-substitution] sms failed', (e as Error).message);
    }
  }

  // Matching email — same facts, same tone, no upsell.
  let emailSent = false;
  try {
    // deno-lint-ignore no-explicit-any
    const { data: userRes } = await (admin as any).auth.admin.getUserById(userId);
    const email = userRes?.user?.email as string | undefined;
    if (email) {
      const html = `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
          <p style="font-size:16px;line-height:1.6;">${message.replace(' Reply STOP to opt out.', '').replace(' Responde STOP para no recibir mensajes.', '')}</p>
          <p style="font-size:14px;color:#475569;">${lang === 'es'
            ? 'Nada más cambia: misma hora, mismo alcance, mismo precio.'
            : 'Nothing else changes: same time, same scope, same price.'}</p>
        </div>`;
      const res = await sendBrevoEmail({
        to: email,
        subject: lang === 'es'
          ? `Cambio de Pro para tu visita del ${day}`
          : `A different Pro is covering your ${day} visit`,
        htmlContent: html,
        marketing: false,
        sender: { name: 'Tidy', email: ALERT_FROM_EMAIL },
        label: 'notify-pro-substitution',
      });
      emailSent = res.sent;
    }
  } catch (e) {
    console.error('[notify-pro-substitution] email failed', (e as Error).message);
  }

  return jsonResponse({ ok: true, sent: smsSent, email_sent: emailSent, message });
});
