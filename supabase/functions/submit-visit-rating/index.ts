// Tidy — Public visit rating intake (backs jointidy.co/rate).
//
// Anonymous (verify_jwt = false). Screen 2 on the client is IDENTICAL for
// every star value — the Google review button always renders. This function
// no longer gates google_review_url by rating; it always returns it. For
// ratings <= 3 it additionally fires an ops Brevo alert and flags
// needs_followup so the "make it right" panel + admin alert queue work.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_REVIEW_URL = 'https://g.page/r/Cd7-Iz6HobqzEBI/review';
const OPS_ALERT_EMAIL = 'hello@jointidy.co';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));

    // ---- Follow-up append mode -------------------------------------------
    // The "Let us make it right" panel on screen 2 posts back with the
    // rating_id returned by the initial submit, so a customer who only
    // decides to explain AFTER rating still lands in the ops queue.
    const followupId = typeof body?.rating_id === 'string' ? body.rating_id.trim() : '';
    if (followupId && UUID_RE.test(followupId)) {
      const note = typeof body?.comment === 'string' ? body.comment.slice(0, 2000).trim() : '';
      if (!note) return jsonResponse({ ok: false, error: 'empty_followup' }, 400);

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: existing } = await admin
        .from('visit_ratings')
        .select('id, stars, rating, comment, job_id, customer_id')
        .eq('id', followupId)
        .maybeSingle();
      if (!existing) return jsonResponse({ ok: false, error: 'rating_not_found' }, 404);

      const merged = existing.comment ? `${existing.comment}\n\n--- follow-up ---\n${note}` : note;
      const { error: updErr } = await admin
        .from('visit_ratings')
        .update({ comment: merged, needs_followup: true })
        .eq('id', followupId);
      if (updErr) {
        console.error('[submit-visit-rating] followup update failed', updErr.message);
        return jsonResponse({ ok: false, error: 'followup_failed' }, 500);
      }

      const fStars = Number(existing.stars ?? existing.rating ?? 0);
      await admin.from('admin_alerts').insert({
        alert_type: 'low_visit_rating',
        title: `Make-it-right request (${fStars}★)`,
        body: note,
        context: {
          visit_rating_id: followupId,
          stars: fStars,
          job_id: existing.job_id ?? null,
          customer_id: existing.customer_id ?? null,
          followup: true,
        },
      }).then(({ error }) => {
        if (error) console.warn('[submit-visit-rating] followup alert failed', error.message);
      });

      sendBrevoEmail({
        to: OPS_ALERT_EMAIL,
        marketing: false,
        subject: `Make-it-right request (${fStars}★) — customer explained`,
        htmlContent: `<p>A customer who rated ${fStars}★ has told us what happened.</p>
          <p><b>What they said:</b> ${note.replace(/</g, '&lt;')}</p>
          <p><b>Rating row:</b> ${followupId}</p>`,
        tags: ['visit-rating-alert'],
        label: 'submit-visit-rating-followup',
      }).catch((e) => console.warn('[submit-visit-rating] brevo followup failed', (e as Error).message));

      return jsonResponse({ ok: true, followup: true, rating_id: followupId });
    }

    const stars = Number(body?.stars ?? body?.rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return jsonResponse({ ok: false, error: 'invalid_rating' }, 400);
    }
    const comment = typeof body?.comment === 'string' ? body.comment.slice(0, 2000).trim() : '';
    const lang = body?.lang === 'es' ? 'es' : 'en';
    const jobId = typeof body?.job_id === 'string' ? body.job_id.slice(0, 120).trim() : '';
    const customerId = typeof body?.customer_id === 'string' ? body.customer_id.slice(0, 120).trim() : '';
    const raw = jobId || (typeof body?.identifier === 'string' ? body.identifier.slice(0, 120).trim() : '');
    const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null;
    const needsFollowup = stars <= 3;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let proVisitId: string | null = null;
    let visitId: string | null = null;
    let contractorId: string | null = null;
    let userId: string | null = null;

    if (raw) {
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

    // visit_ratings — write both the legacy `rating` column and the new
    // job_id/customer_id/stars/user_agent/needs_followup columns where the
    // schema has them; fall back gracefully if a column doesn't exist yet.
    const insertPayload: Record<string, unknown> = {
      rating: stars,
      stars,
      comment: comment || null,
      visit_id: visitId,
      pro_visit_id: proVisitId,
      contractor_id: contractorId,
      user_id: userId,
      raw_identifier: raw || null,
      job_id: jobId || raw || null,
      customer_id: customerId || null,
      user_agent: userAgent,
      needs_followup: needsFollowup,
      source: matched ? 'sms_rate_link' : 'sms_rate_link_generic',
      lang,
      google_prompted: true,
    };

    let { data: inserted, error: insErr } = await admin
      .from('visit_ratings')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insErr) {
      // Schema without the newer columns yet — retry with the legacy shape
      // so the page never breaks on a missing migration.
      console.warn('[submit-visit-rating] full insert failed, retrying legacy shape', insErr.message);
      const legacy = await admin
        .from('visit_ratings')
        .insert({
          rating: stars,
          comment: comment || null,
          visit_id: visitId,
          pro_visit_id: proVisitId,
          contractor_id: contractorId,
          user_id: userId,
          raw_identifier: jobId || customerId ? `job:${jobId || ''} customer:${customerId || ''} raw:${raw || ''}`.trim() : raw || null,
          source: matched ? 'sms_rate_link' : 'sms_rate_link_generic',
          lang,
          google_prompted: true,
        })
        .select('id')
        .single();
      inserted = legacy.data;
      insErr = legacy.error;
    }

    if (insErr) {
      console.error('[submit-visit-rating] insert failed', insErr.message);
      return jsonResponse({ ok: false, error: 'insert_failed' }, 500);
    }

    if (proVisitId) {
      const { error: upErr } = await admin
        .from('pro_visits')
        .update({ customer_rating: stars })
        .eq('id', proVisitId);
      if (upErr) console.warn('[submit-visit-rating] pro_visits update failed', upErr.message);
    }

    if (needsFollowup) {
      const { error: alertErr } = await admin.from('admin_alerts').insert({
        alert_type: 'low_visit_rating',
        title: `Low rating (${stars}★) — re-service review needed`,
        body: comment || null,
        context: {
          visit_rating_id: inserted?.id ?? null,
          stars,
          job_id: jobId || null,
          customer_id: customerId || null,
          pro_visit_id: proVisitId,
          visit_id: visitId,
          contractor_id: contractorId,
          identifier: raw || null,
          matched,
          lang,
        },
      });
      if (alertErr) console.warn('[submit-visit-rating] alert insert failed', alertErr.message);

      sendBrevoEmail({
        to: OPS_ALERT_EMAIL,
        marketing: false,
        subject: `Low visit rating (${stars}★) — needs follow-up`,
        htmlContent: `<p>A customer left a ${stars}-star rating and needs follow-up.</p>
          <p><b>Comment:</b> ${comment ? comment.replace(/</g, '&lt;') : '(none)'}</p>
          <p><b>Job ID:</b> ${jobId || raw || '(none)'}<br/><b>Customer ID:</b> ${customerId || '(none)'}</p>
          <p><b>Rating row:</b> ${inserted?.id ?? '(unknown)'}</p>`,
        tags: ['visit-rating-alert'],
        label: 'submit-visit-rating',
      }).catch((e) => console.warn('[submit-visit-rating] brevo alert failed', (e as Error).message));
    }

    return jsonResponse({
      ok: true,
      matched,
      stars,
      rating_id: inserted?.id ?? null,
      needs_followup: needsFollowup,
      google_review_url: GOOGLE_REVIEW_URL,
    });
  } catch (err) {
    console.error('[submit-visit-rating] unhandled', err);
    return jsonResponse({ ok: false, error: 'unexpected_error' }, 500);
  }
});
