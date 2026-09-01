// Tidy — Public visit rating intake (backs jointidy.co/rate).
//
// The post-visit SMS links every customer to /rate?visit=<id>. Nobody is
// logged in, so this endpoint is anonymous (verify_jwt = false) and does all
// the work with the service role:
//   1. Resolve the identifier (pro_visits.id / jobber_visit_id, visits.id /
//      jobber_visit_id). Unknown or missing → still record the rating.
//   2. Insert public.visit_ratings (the row the admin low-rating flow reads).
//   3. Mirror the score onto pro_visits.customer_rating so the Pro dashboard,
//      tier progression and the $50 five-star bonus keep working.
//   4. 3 stars or lower → open an admin alert (private re-service path).
//      4-5 stars → return the Google review URL so the client can prompt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_PLACE_ID = Deno.env.get('GOOGLE_PLACE_ID') ?? '';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function googleReviewUrl(): string {
  return GOOGLE_PLACE_ID
    ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(GOOGLE_PLACE_ID)}`
    : 'https://www.google.com/search?q=Tidy+Home+Concierge+Miami+reviews';
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const rating = Number(body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonResponse({ ok: false, error: 'invalid_rating' }, 400);
    }
    const comment = typeof body?.comment === 'string' ? body.comment.slice(0, 2000).trim() : '';
    const lang = body?.lang === 'es' ? 'es' : 'en';
    const raw = typeof body?.identifier === 'string' ? body.identifier.slice(0, 120).trim() : '';

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let proVisitId: string | null = null;
    let visitId: string | null = null;
    let contractorId: string | null = null;
    let userId: string | null = null;

    if (raw) {
      // pro_visits — by primary key or Jobber visit id.
      const pvQuery = admin.from('pro_visits').select('id, contractor_id').limit(1);
      const { data: pv } = UUID_RE.test(raw)
        ? await pvQuery.or(`id.eq.${raw},jobber_visit_id.eq.${raw}`)
        : await pvQuery.eq('jobber_visit_id', raw);
      if (pv && pv.length) {
        proVisitId = pv[0].id;
        contractorId = pv[0].contractor_id ?? null;
      }

      const vQuery = admin.from('visits').select('id, user_id').limit(1);
      const { data: v } = UUID_RE.test(raw)
        ? await vQuery.or(`id.eq.${raw},jobber_visit_id.eq.${raw}`)
        : await vQuery.eq('jobber_visit_id', raw);
      if (v && v.length) {
        visitId = v[0].id;
        userId = v[0].user_id ?? null;
      }
    }

    const matched = Boolean(proVisitId || visitId);
    const wantsGoogle = rating >= 4;

    const { data: inserted, error: insErr } = await admin
      .from('visit_ratings')
      .insert({
        rating,
        comment: comment || null,
        visit_id: visitId,
        pro_visit_id: proVisitId,
        contractor_id: contractorId,
        user_id: userId,
        raw_identifier: raw || null,
        source: matched ? 'sms_rate_link' : 'sms_rate_link_generic',
        lang,
        google_prompted: wantsGoogle,
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('[submit-visit-rating] insert failed', insErr.message);
      return jsonResponse({ ok: false, error: 'insert_failed' }, 500);
    }

    // Keep the existing Pro-facing rating surfaces working.
    if (proVisitId) {
      const { error: upErr } = await admin
        .from('pro_visits')
        .update({ customer_rating: rating })
        .eq('id', proVisitId);
      if (upErr) console.warn('[submit-visit-rating] pro_visits update failed', upErr.message);
    }

    // 3 or below never goes to Google — it comes to us.
    if (rating <= 3) {
      const { error: alertErr } = await admin.from('admin_alerts').insert({
        alert_type: 'low_visit_rating',
        title: `Low rating (${rating}★) — re-service review needed`,
        body: comment || null,
        context: {
          visit_rating_id: inserted?.id ?? null,
          rating,
          pro_visit_id: proVisitId,
          visit_id: visitId,
          contractor_id: contractorId,
          identifier: raw || null,
          matched,
          lang,
        },
      });
      if (alertErr) console.warn('[submit-visit-rating] alert insert failed', alertErr.message);
    }

    return jsonResponse({
      ok: true,
      matched,
      rating,
      google_review_url: wantsGoogle ? googleReviewUrl() : null,
    });
  } catch (err) {
    console.error('[submit-visit-rating] unhandled', err);
    return jsonResponse({ ok: false, error: 'unexpected_error' }, 500);
  }
});
