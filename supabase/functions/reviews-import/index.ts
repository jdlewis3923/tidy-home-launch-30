// Tidy — Admin-only review import (Adapter A: paste/CSV).
//
// Accepts POST { rows: RawReviewInput[] } from /admin/reviews/import.
// Dedupes on external_review_id (or a hash fallback of reviewer_name +
// posted_at + first 60 chars of comment), runs the attribution engine
// against completed jobs, and inserts into public.reviews. Never
// auto-approves a bonus — high confidence only sets matched_pro_id +
// status 'matched'.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { manualPasteAdapter } from '../_shared/review-ingestion.ts';
import { attribute, type AttributionCandidate } from '../_shared/review-attribution.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CANDIDATE_WINDOW_DAYS = 14;

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

  let body: { rows?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
  }
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  if (rawRows.length === 0) return jsonResponse({ ok: false, error: 'no_rows' }, 400);
  if (rawRows.length > 500) return jsonResponse({ ok: false, error: 'too_many_rows (max 500)' }, 400);

  const normalized = manualPasteAdapter.normalize(rawRows);
  const skippedInvalid = rawRows.length - normalized.length;

  // Dedupe against existing rows by external_review_id.
  const ids = normalized.map((r) => r.external_review_id);
  const { data: existing } = await admin.from('reviews').select('external_review_id').in('external_review_id', ids);
  const existingSet = new Set((existing ?? []).map((r) => r.external_review_id));

  const toInsert = normalized.filter((r) => !existingSet.has(r.external_review_id));
  const skippedDupes = normalized.length - toInsert.length;

  // Pull candidate pool: completed pro_visits joined to applicants, once.
  const { data: applicants } = await admin
    .from('applicants')
    .select('id, contractor_id, first_name, last_name, out_of_service_area')
    .not('contractor_id', 'is', null);
  const applicantByContractor = new Map((applicants ?? []).map((a) => [a.contractor_id as string, a]));

  const inserted: string[] = [];
  const results: Array<{ external_review_id: string; status: string; match_confidence: string }> = [];

  for (const row of toInsert) {
    const windowStart = new Date(new Date(row.posted_at).getTime() - CANDIDATE_WINDOW_DAYS * 86_400_000).toISOString();
    const { data: visits } = await admin
      .from('pro_visits')
      .select('id, contractor_id, customer_name, completed_at, customer_rating')
      .eq('status', 'complete')
      .not('completed_at', 'is', null)
      .gte('completed_at', windowStart)
      .lte('completed_at', row.posted_at);

    const candidates: AttributionCandidate[] = (visits ?? [])
      .map((v) => {
        const a = applicantByContractor.get(v.contractor_id as string);
        if (!a || a.out_of_service_area) return null;
        return {
          pro_id: a.id as string,
          contractor_id: v.contractor_id as string,
          pro_first_name: a.first_name as string,
          pro_last_name: a.last_name as string,
          visit_id: v.id as string,
          customer_name: v.customer_name as string | null,
          completed_at: v.completed_at as string,
          customer_rating: v.customer_rating as number | null,
        } as AttributionCandidate;
      })
      .filter((c): c is AttributionCandidate => c !== null);

    const result = attribute(row.reviewer_name, row.comment, row.posted_at, candidates);

    const status = result.match_confidence === 'high' ? 'matched' : 'new';

    const { data: insertedRow, error: insErr } = await admin
      .from('reviews')
      .insert({
        source: row.source,
        external_review_id: row.external_review_id,
        reviewer_name: row.reviewer_name,
        stars: row.stars,
        comment: row.comment,
        posted_at: row.posted_at,
        matched_job_id: result.matched_job_id,
        matched_pro_id: result.matched_pro_id,
        match_confidence: result.match_confidence,
        match_score: result.match_score,
        match_debug: result.match_debug,
        status,
      })
      .select('id')
      .single();

    if (!insErr && insertedRow) {
      inserted.push(insertedRow.id as string);
      results.push({ external_review_id: row.external_review_id, status, match_confidence: result.match_confidence });
    }
  }

  // Fraud heuristic: flag any Pro with 3+ matched/new reviews within a 48h window,
  // or clustered identical reviewer names for the same Pro. Never auto-reject.
  await flagFraud(admin);

  return jsonResponse({
    ok: true,
    received: rawRows.length,
    skipped_invalid: skippedInvalid,
    skipped_duplicate: skippedDupes,
    inserted: inserted.length,
    results,
  });
});

async function flagFraud(admin: ReturnType<typeof createClient>) {
  const { data: recent } = await admin
    .from('reviews')
    .select('id, matched_pro_id, reviewer_name, posted_at')
    .not('matched_pro_id', 'is', null)
    .gte('posted_at', new Date(Date.now() - 30 * 86_400_000).toISOString());
  if (!recent) return;

  const byPro = new Map<string, typeof recent>();
  for (const r of recent) {
    const key = r.matched_pro_id as string;
    if (!byPro.has(key)) byPro.set(key, []);
    byPro.get(key)!.push(r);
  }

  for (const [proId, rows] of byPro) {
    rows.sort((a, b) => new Date(a.posted_at as string).getTime() - new Date(b.posted_at as string).getTime());
    let flagReason: string | null = null;
    for (let i = 0; i + 2 < rows.length; i++) {
      const spanHrs = (new Date(rows[i + 2].posted_at as string).getTime() - new Date(rows[i].posted_at as string).getTime()) / 3_600_000;
      if (spanHrs <= 48) { flagReason = '3+ reviews within 48h'; break; }
    }
    if (!flagReason) {
      const names = rows.map((r) => (r.reviewer_name ?? '').trim().toLowerCase()).filter(Boolean);
      const nameCounts = new Map<string, number>();
      for (const n of names) nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
      if ([...nameCounts.values()].some((c) => c >= 2 && names.length >= 3)) {
        flagReason = 'clustered reviewer names';
      }
    }
    if (flagReason) {
      const ids = rows.map((r) => r.id);
      await admin.from('reviews').update({ fraud_flag: flagReason }).in('id', ids).is('fraud_flag', null);
    }
  }
}
