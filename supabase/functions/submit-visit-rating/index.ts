import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Public visit rating intake (backs jointidy.co/rate).
//
// SECURITY MODEL (audit item 1)
// -----------------------------------------------------------------------------
// This function runs with the service role, so it bypasses RLS. 0035 revoked
// the direct table INSERT; this endpoint was the second path and it used to
// accept any stars for any visit UUID, unauthenticated, unlimited. A pro could
// read their own visit UUIDs out of pro_get_visits and rate themselves.
//
// A rating now only ATTACHES to a visit (and therefore only reaches
// avg_customer_rating, badge status, tier promotion and the review-bonus
// ledger) when the caller proves they are that visit's customer, by one of:
//   * rate_token — the per-visit capability token carried in the SMS link
//     (visits.rate_token, revoked from anon/authenticated so no pro can read it)
//   * a signed-in session whose uid equals visits.user_id
// Anything else is stored UNVERIFIED with visit_id/contractor_id NULL: the
// walk-up "jointidy.co/rate" case still works and still reaches ops, but it can
// never move a pro's numbers.
//
// Idempotent: a unique index on visit_ratings(visit_id) plus an explicit
// pre-check means one rating per visit — a replay returns the original row and
// changes nothing.
//
// Follow-up branch: requires the per-rating followup_token that is returned
// only to the original submitter (or the signed-in owner of the rating), so
// attacker text can no longer be appended to somebody else's rating.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { sendBrevoEmail } from '../_shared/brevo-send.ts';
import { enforceRateLimit } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GOOGLE_REVIEW_URL = 'https://g.page/r/Cd7-Iz6HobqzEBI/review';
const OPS_ALERT_EMAIL = 'hello@jointidy.co';

// Unverified submissions are throttled per client fingerprint so the open
// endpoint cannot be used to flood ops alerts.
const UNVERIFIED_WINDOW_MIN = 10;
const UNVERIFIED_MAX_PER_WINDOW = 5;

function randomToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

function safeEquals(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let m = 0;
  for (let i = 0; i < a.length; i++) m |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return m === 0;
}

function bearer(req: Request): string {
  const h = req.headers.get('Authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

/** Signed-in user id, or null. The anon publishable key is also sent as a
 *  bearer token by supabase-js; getUser rejects it, which is what we want. */
async function callerUserId(
  admin: ReturnType<typeof createClient>,
  req: Request,
): Promise<string | null> {
  const token = bearer(req);
  if (!token) return null;
  try {
    const { data } = await admin.auth.getUser(token);
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // Per-IP rate limit — this endpoint is reachable without a session.
  const limited = await enforceRateLimit(req, { bucket: 'submit-visit-rating', limit: 10, windowSeconds: 300 });
  if (limited) return limited;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const uid = await callerUserId(admin, req);
    const rateToken = typeof body?.rate_token === 'string' ? body.rate_token.trim().slice(0, 64) : '';

    // ---- Follow-up append mode -------------------------------------------
    const followupId = typeof body?.rating_id === 'string' ? body.rating_id.trim() : '';
    if (followupId && UUID_RE.test(followupId)) {
      const note = typeof body?.comment === 'string' ? body.comment.slice(0, 2000).trim() : '';
      if (!note) return jsonResponse({ ok: false, error: 'empty_followup' }, 400);

      const { data: existing } = await admin
        .from('visit_ratings')
        .select('id, stars, rating, comment, job_id, customer_id, user_id, followup_token')
        .eq('id', followupId)
        .maybeSingle();
      if (!existing) return jsonResponse({ ok: false, error: 'rating_not_found' }, 404);

      // Ownership proof: the token we handed the original submitter, or the
      // signed-in customer the rating belongs to.
      const presented = typeof body?.followup_token === 'string' ? body.followup_token.trim() : '';
      const tokenOk =
        typeof existing.followup_token === 'string' &&
        existing.followup_token.length > 0 &&
        safeEquals(presented, existing.followup_token);
      const ownerOk = !!uid && !!existing.user_id && uid === existing.user_id;
      if (!tokenOk && !ownerOk) return jsonResponse({ ok: false, error: 'forbidden' }, 403);

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
      const { error: alertErr } = await admin.from('admin_alerts').insert({
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
      });
      if (alertErr) console.warn('[submit-visit-rating] followup alert failed', alertErr.message);

      // Awaited on purpose: a detached promise dies when the response returns.
      await sendBrevoEmail({
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

    // ---- resolve the visit, then PROVE the caller is its customer ---------
    let visitId: string | null = null;
    let contractorId: string | null = null;
    let userId: string | null = null;
    let verified = false;

    if (raw || rateToken) {
      const q = admin.from('visits').select('id, user_id, assigned_pro_id, rate_token').limit(1);
      const { data: v } = rateToken
        ? await q.eq('rate_token', rateToken)
        : UUID_RE.test(raw)
          ? await q.or(`id.eq.${raw},jobber_visit_id.eq.${raw}`)
          : await q.eq('jobber_visit_id', raw);

      const row = v && v.length ? v[0] : null;
      if (row) {
        const tokenOk = !!rateToken && safeEquals(rateToken, String(row.rate_token ?? ''));
        const ownerOk = !!uid && !!row.user_id && uid === row.user_id;
        if (tokenOk || ownerOk) {
          verified = true;
          visitId = row.id;
          userId = row.user_id ?? null;
          contractorId = row.assigned_pro_id ?? null;
        }
      }
    }

    // Anonymous, unproven submissions cannot move a pro's numbers, and they are
    // throttled so the open endpoint can't be used to flood ops.
    if (!verified) {
      const since = new Date(Date.now() - UNVERIFIED_WINDOW_MIN * 60_000).toISOString();
      const { count } = await admin
        .from('visit_ratings')
        .select('id', { count: 'exact', head: true })
        .eq('verified', false)
        .gte('created_at', since);
      if ((count ?? 0) >= UNVERIFIED_MAX_PER_WINDOW) {
        return jsonResponse({ ok: false, error: 'rate_limited' }, 429);
      }
    }

    // ---- idempotency: one rating per visit -------------------------------
    if (verified && visitId) {
      const { data: prior } = await admin
        .from('visit_ratings')
        .select('id')
        .eq('visit_id', visitId)
        .maybeSingle();
      if (prior?.id) {
        return jsonResponse({
          ok: true,
          matched: true,
          already_rated: true,
          stars,
          rating_id: prior.id,
          google_review_url: GOOGLE_REVIEW_URL,
        });
      }
    }

    const followupToken = randomToken();
    const insertPayload: Record<string, unknown> = {
      rating: stars,
      stars,
      comment: comment || null,
      visit_id: visitId,
      pro_visit_id: null,
      contractor_id: contractorId,
      user_id: userId,
      raw_identifier: raw || null,
      job_id: verified ? (jobId || raw || null) : null,
      customer_id: verified ? (customerId || null) : null,
      user_agent: userAgent,
      needs_followup: needsFollowup,
      verified,
      followup_token: followupToken,
      source: verified ? 'sms_rate_link' : 'sms_rate_link_unverified',
      lang,
      google_prompted: true,
    };

    const { data: inserted, error: insErr } = await admin
      .from('visit_ratings')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insErr) {
      // Unique index race on visit_id — treat as the idempotent replay it is.
      if (visitId) {
        const { data: prior } = await admin
          .from('visit_ratings').select('id').eq('visit_id', visitId).maybeSingle();
        if (prior?.id) {
          return jsonResponse({
            ok: true, matched: true, already_rated: true, stars,
            rating_id: prior.id, google_review_url: GOOGLE_REVIEW_URL,
          });
        }
      }
      console.error('[submit-visit-rating] insert failed', insErr.message);
      return jsonResponse({ ok: false, error: 'insert_failed' }, 500);
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
          visit_id: visitId,
          contractor_id: contractorId,
          identifier: raw || null,
          verified,
          lang,
        },
      });
      if (alertErr) console.warn('[submit-visit-rating] alert insert failed', alertErr.message);

      await sendBrevoEmail({
        to: OPS_ALERT_EMAIL,
        marketing: false,
        subject: `Low visit rating (${stars}★) — needs follow-up`,
        htmlContent: `<p>A customer left a ${stars}-star rating and needs follow-up.</p>
          <p><b>Comment:</b> ${comment ? comment.replace(/</g, '&lt;') : '(none)'}</p>
          <p><b>Verified customer:</b> ${verified ? 'yes' : 'no — not attached to a visit'}</p>
          <p><b>Rating row:</b> ${inserted?.id ?? '(unknown)'}</p>`,
        tags: ['visit-rating-alert'],
        label: 'submit-visit-rating',
      }).catch((e) => console.warn('[submit-visit-rating] brevo alert failed', (e as Error).message));
    }

    return jsonResponse({
      ok: true,
      matched: verified,
      stars,
      rating_id: inserted?.id ?? null,
      followup_token: followupToken,
      needs_followup: needsFollowup,
      google_review_url: GOOGLE_REVIEW_URL,
    });
  } catch (err) {
    console.error('[submit-visit-rating] unhandled', err);
    return jsonResponse({ ok: false, error: 'unexpected_error' }, 500);
  }
});
