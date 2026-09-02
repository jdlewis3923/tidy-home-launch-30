// Tidy — B2/B3. "The Walkaround": a Pro on site requests an add-on the
// customer didn't buy.
//
// Hard rules enforced here, server-side:
//   - The caller must be the Pro assigned to that job.
//   - Before-photos must already be uploaded (B1) and the job must not be
//     marked complete.
//   - A photo is required on every request.
//   - The Pro NEVER supplies a price. Any client-supplied amount is ignored;
//     amount_cents comes from public.addon_catalog.
//   - "Other — needs quote" routes to admin, never to the customer.
//
// On a normal request the customer gets an SMS plus a matching email pointing
// at the public no-auth approval page (/addon/:token), and the request expires
// on its own after 15 minutes. Nothing here blocks the Pro from working.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SITE_URL = Deno.env.get('SITE_BASE_URL') ?? 'https://jointidy.co';
const ALERT_FROM_EMAIL = Deno.env.get('ALERT_FROM_EMAIL') ?? 'alerts@jointidy.co';

export const OTHER_ADDON_KEY = 'other_needs_quote';

const BodySchema = z.object({
  job_id: z.string().min(1).max(120),
  addon_key: z.string().min(1).max(80),
  condition_note: z.string().max(400).optional(),
  photo_path: z.string().min(1).max(400),
  // amount_cents is deliberately absent — a client-supplied price is rejected
  // by .strict() below rather than quietly ignored.
}).strict();

/** Rough on-site time cost per add-on, used only for the customer's copy. */
const MINUTES: Record<string, number> = {
  pet_hair_removal: 30,
  heavy_interior_soil: 35,
  exterior_contamination: 30,
  ozone_odor_treatment: 45,
  clay_bar_ceramic_coat: 45,
  headlight_restoration: 30,
  interior_protect_condition: 25,
  inside_oven_clean: 30,
  inside_fridge_clean: 25,
  interior_windows: 30,
  deep_baseboard_scrub: 30,
  laundry_wdf: 40,
  inside_kitchen_cabinets: 35,
  weed_removal: 30,
  leaf_debris_cleanup: 30,
  bed_edge_reset: 40,
  exterior_windows_screens: 45,
  driveway_pressure_wash: 60,
};

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(auth.slice(7));
  if (userErr || !userData?.user?.id) return jsonResponse({ ok: false, error: 'invalid_jwt' }, 401);
  const proUserId = userData.user.id;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: 'validation_failed', details: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const { job_id, addon_key, condition_note, photo_path } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- the job must be this Pro's, started-eligible, and not complete -----
  const { data: visit } = await admin
    .from('pro_visits')
    .select('id, contractor_id, status, service_type, before_photos_uploaded_at, jobber_visit_id')
    .eq('jobber_visit_id', job_id)
    .maybeSingle();
  if (!visit) return jsonResponse({ ok: false, error: 'job_not_found' }, 404);
  if (visit.contractor_id !== proUserId) return jsonResponse({ ok: false, error: 'not_your_job' }, 403);
  if (!visit.before_photos_uploaded_at) {
    return jsonResponse({ ok: false, error: 'before_photos_required' }, 409);
  }
  if (visit.status === 'complete' || visit.status === 'canceled' || visit.status === 'cancelled') {
    return jsonResponse({ ok: false, error: 'job_already_closed' }, 409);
  }

  const { data: proRow } = await admin
    .from('applicants')
    .select('id, first_name')
    .eq('contractor_id', proUserId)
    .maybeSingle();
  const proFirst = proRow?.first_name ?? 'Your Pro';

  // ---- one pending request at a time per job -----------------------------
  const { data: existing } = await admin
    .from('addon_requests')
    .select('id')
    .eq('job_id', job_id)
    .eq('status', 'pending')
    .limit(1);
  if ((existing?.length ?? 0) > 0) {
    return jsonResponse({ ok: false, error: 'request_already_pending' }, 409);
  }

  // ---- signed photo URL (private bucket) ---------------------------------
  const { data: signed } = await admin.storage
    .from('job-condition-photos')
    .createSignedUrl(photo_path, 60 * 60 * 24 * 7);
  const photoUrl = signed?.signedUrl ?? null;

  // ---- "Other — needs quote" goes to admin, never to the customer --------
  if (addon_key === OTHER_ADDON_KEY) {
    const { data: reqRow, error: insErr } = await admin
      .from('addon_requests')
      .insert({
        job_id,
        pro_visit_id: visit.id,
        pro_id: proUserId,
        addon_name: 'Other — needs quote',
        addon_key: OTHER_ADDON_KEY,
        condition_note: condition_note ?? null,
        photo_url: photo_path,
        status: 'needs_quote',
        amount_cents: 0,
        responded_at: null,
      })
      .select('id')
      .maybeSingle();
    if (insErr) return jsonResponse({ ok: false, error: insErr.message }, 500);

    await admin.from('admin_alerts').insert({
      alert_type: 'addon_needs_quote',
      title: `Quote needed on site — ${proFirst}`,
      body:
        `${proFirst} is on job ${job_id} and found something outside the catalog.\n\n` +
        `${condition_note ?? '(no note)'}\n\nPhoto: ${photoUrl ?? photo_path}`,
      context: { addon_request_id: reqRow?.id, job_id, pro_id: proUserId, photo_path },
    });

    return jsonResponse({ ok: true, status: 'needs_quote', request_id: reqRow?.id });
  }

  // ---- catalog is the only source of price -------------------------------
  const { data: addon } = await admin
    .from('addon_catalog')
    .select('id, addon_key, display_name, price_cents, is_active, services')
    .eq('addon_key', addon_key)
    .maybeSingle();
  if (!addon) return jsonResponse({ ok: false, error: 'addon_not_in_catalog' }, 404);
  if (!addon.is_active || !addon.price_cents) {
    return jsonResponse({ ok: false, error: 'addon_not_bookable' }, 409);
  }

  // ---- who is the customer? ---------------------------------------------
  const { data: visitRow } = await admin
    .from('visits')
    .select('user_id, service')
    .eq('jobber_visit_id', job_id)
    .maybeSingle();
  const customerId = (visitRow as { user_id?: string } | null)?.user_id ?? null;

  const { data: reqRow, error: insErr } = await admin
    .from('addon_requests')
    .insert({
      job_id,
      pro_visit_id: visit.id,
      pro_id: proUserId,
      customer_id: customerId,
      addon_id: addon.id,
      addon_key: addon.addon_key,
      addon_name: addon.display_name,
      condition_note: condition_note ?? null,
      photo_url: photo_path,
      status: 'pending',
      amount_cents: addon.price_cents,
      minutes_estimate: MINUTES[addon.addon_key] ?? 20,
    })
    .select('id, token, amount_cents, minutes_estimate')
    .maybeSingle();
  if (insErr || !reqRow) return jsonResponse({ ok: false, error: insErr?.message ?? 'insert_failed' }, 500);

  const link = `${SITE_URL}/addon/${reqRow.token}`;
  const isCar = (visit.service_type ?? visitRow?.service ?? '').toLowerCase().includes('detail')
    || (visit.service_type ?? '').toLowerCase().includes('car');
  const place = isCar ? 'vehicle' : 'home';
  const dollars = Math.round(reqRow.amount_cents / 100);
  const condition = condition_note?.trim() || addon.display_name.toLowerCase();

  let smsSent = false;
  let emailSent = false;

  if (customerId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('phone, language')
      .eq('user_id', customerId)
      .maybeSingle();
    const lang = (profile as { language?: string } | null)?.language === 'es' ? 'es' : 'en';
    const phone = (profile as { phone?: string } | null)?.phone ?? null;

    const message = lang === 'es'
      ? `Tidy: ${proFirst} está en tu ${isCar ? 'carro' : 'casa'} y encontró ${condition}. ${addon.display_name} cuesta $${dollars} y añade unos ${reqRow.minutes_estimate} minutos. Aprueba o rechaza: ${link}`
      : `Tidy: ${proFirst} is at your ${place} and found ${condition}. ${addon.display_name} is $${dollars} and adds about ${reqRow.minutes_estimate} minutes. Approve or decline: ${link}`;

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
            idempotency_key: `addon-request-${reqRow.id}`,
            template_name: 'addon-request-approval',
            triggered_by: 'request-addon',
          }),
        });
        const json = await res.json().catch(() => ({}));
        smsSent = json?.sent === true;
      } catch (e) {
        console.error('[request-addon] sms failed', (e as Error).message);
      }
    }

    try {
      // deno-lint-ignore no-explicit-any
      const { data: userRes } = await (admin as any).auth.admin.getUserById(customerId);
      const email = userRes?.user?.email as string | undefined;
      if (email) {
        const html = `
          <div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a;">
            <p style="font-size:16px;line-height:1.6;">${message.replace(link, '')}</p>
            ${photoUrl ? `<img src="${photoUrl}" alt="" style="width:100%;border-radius:12px;margin:12px 0;" />` : ''}
            <a href="${link}" style="display:inline-block;margin-top:8px;background:#f5c518;color:#0f172a;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:700;">
              ${lang === 'es' ? 'Aprobar o rechazar' : 'Approve or decline'}
            </a>
            <p style="font-size:13px;color:#64748b;margin-top:16px;">${lang === 'es'
              ? 'Si no respondes en 15 minutos, hacemos solo el servicio que ya reservaste.'
              : 'No response in 15 minutes and we simply do the scope you already booked.'}</p>
          </div>`;
        const res = await sendBrevoEmail({
          to: email,
          subject: lang === 'es'
            ? `${proFirst} encontró algo — ¿añadimos ${addon.display_name}?`
            : `${proFirst} found something — add ${addon.display_name}?`,
          htmlContent: html,
          marketing: false,
          sender: { name: 'Tidy', email: ALERT_FROM_EMAIL },
          label: 'request-addon',
        });
        emailSent = res.sent;
      }
    } catch (e) {
      console.error('[request-addon] email failed', (e as Error).message);
    }
  }

  return jsonResponse({
    ok: true,
    status: 'pending',
    request_id: reqRow.id,
    amount_cents: reqRow.amount_cents,
    minutes_estimate: reqRow.minutes_estimate,
    sms_sent: smsSent,
    email_sent: emailSent,
    approval_url: link,
  });
});
