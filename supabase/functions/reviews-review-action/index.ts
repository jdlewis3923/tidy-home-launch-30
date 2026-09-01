// Tidy — Admin-only review bonus actions: approve / reject / reassign / bulk_approve.
// Server enforces qualification (5 stars, reviewer not excluded) and the
// monthly per-Pro cap (no rollover) from app_settings.review_bonus. Never
// trust client-computed eligibility.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface Policy {
  amount_cents: number;
  cap_per_month: number;
  hold_days: number;
  excluded_reviewer_names: string[];
}
const DEFAULT_POLICY: Policy = { amount_cents: 2500, cap_per_month: 4, hold_days: 7, excluded_reviewer_names: ['A Google User'] };

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: roleCheck } = await admin.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' });
  if (roleCheck !== true) return jsonResponse({ ok: false, error: 'forbidden — admin role required' }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  const { data: settingsRow } = await admin.from('app_settings').select('value').eq('key', 'review_bonus').maybeSingle();
  const policy: Policy = { ...DEFAULT_POLICY, ...(settingsRow?.value as Partial<Policy> | undefined) };

  if (action === 'reject') {
    const reviewId = body?.review_id as string;
    if (!reviewId) return jsonResponse({ ok: false, error: 'missing review_id' }, 400);
    const { error } = await admin.from('reviews').update({ status: 'rejected', approved_by: userData.user.id, notes: body?.notes ?? null }).eq('id', reviewId);
    if (error) return jsonResponse({ ok: false, error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  if (action === 'reassign') {
    const reviewId = body?.review_id as string;
    const proId = body?.pro_id as string | null;
    if (!reviewId) return jsonResponse({ ok: false, error: 'missing review_id' }, 400);
    const { error } = await admin.from('reviews').update({
      matched_pro_id: proId, status: proId ? 'matched' : 'new', match_confidence: 'none', match_score: null,
      match_debug: { manual_reassign_by: userData.user.id, at: new Date().toISOString() },
    }).eq('id', reviewId);
    if (error) return jsonResponse({ ok: false, error: error.message }, 500);
    return jsonResponse({ ok: true });
  }

  if (action === 'approve' || action === 'bulk_approve') {
    const reviewIds: string[] = action === 'approve' ? [body?.review_id].filter(Boolean) : (Array.isArray(body?.review_ids) ? body.review_ids : []);
    if (reviewIds.length === 0) return jsonResponse({ ok: false, error: 'no_review_ids' }, 400);

    const { data: reviews, error: revErr } = await admin.from('reviews').select('*').in('id', reviewIds);
    if (revErr) return jsonResponse({ ok: false, error: revErr.message }, 500);

    const outcomes: Array<{ review_id: string; ok: boolean; reason?: string }> = [];
    const now = Date.now();

    // Running per-pro-per-period counts so a batch can't blow past the cap.
    const periodCountCache = new Map<string, number>();

    for (const review of reviews ?? []) {
      const reason = (r: string) => outcomes.push({ review_id: review.id, ok: false, reason: r });

      if (!review.matched_pro_id) { reason('no_matched_pro'); continue; }
      if (review.status === 'approved' || review.status === 'paid') { reason('already_approved'); continue; }
      if (review.status === 'rejected') { reason('already_rejected'); continue; }
      if (review.stars !== 5) { reason('not_5_stars'); continue; }
      if (policy.excluded_reviewer_names.map((n) => n.toLowerCase()).includes((review.reviewer_name ?? '').trim().toLowerCase())) {
        reason('excluded_reviewer_name'); continue;
      }
      const postedMs = new Date(review.posted_at).getTime();
      const holdOk = now >= postedMs + policy.hold_days * 86_400_000;
      if (!holdOk) { reason('within_hold_period'); continue; }
      if (action === 'bulk_approve' && review.match_confidence !== 'high') { reason('not_high_confidence'); continue; }

      const period = review.posted_at.slice(0, 7); // YYYY-MM
      const cacheKey = `${review.matched_pro_id}:${period}`;
      let count = periodCountCache.get(cacheKey);
      if (count === undefined) {
        const { count: dbCount } = await admin
          .from('pro_bonuses')
          .select('id', { count: 'exact', head: true })
          .eq('pro_id', review.matched_pro_id)
          .eq('period', period)
          .in('status', ['pending', 'paid']);
        count = dbCount ?? 0;
      }
      if (count >= policy.cap_per_month) { reason('monthly_cap_reached'); continue; }

      const { error: bonusErr } = await admin.from('pro_bonuses').insert({
        pro_id: review.matched_pro_id,
        amount_cents: policy.amount_cents,
        currency: 'usd',
        reason: 'review_bonus',
        review_id: review.id,
        period,
        status: 'pending',
        created_by: userData.user.id,
      });
      if (bonusErr) { reason(`bonus_insert_failed:${bonusErr.message}`); continue; }

      periodCountCache.set(cacheKey, count + 1);

      await admin.from('reviews').update({ status: 'approved', approved_by: userData.user.id, approved_at: new Date().toISOString() }).eq('id', review.id);
      outcomes.push({ review_id: review.id, ok: true });
    }

    return jsonResponse({ ok: true, outcomes });
  }

  return jsonResponse({ ok: false, error: 'unknown_action' }, 400);
});
