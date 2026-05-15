// Tidy — Google Reviews Poller
//
// Pulls latest reviews from Google Places Details API for the configured
// place, upserts each into public.google_reviews (dedup by review_id),
// and tries to match the reviewer/text to an applicant via
// google_review_match_name. When matched, increments
// applicants.total_ratings_count and rolls avg_customer_rating.
//
// Triggers:
//   - Manual: POST /functions/v1/google-reviews-poller
//   - Cron:   pg_cron entry calling this URL every 6 hours
//
// Required secrets: GOOGLE_PLACES_API_KEY, GOOGLE_PLACE_ID
// Returns 503 if either is missing so the cron job is harmless.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GOOGLE_PLACES_API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const GOOGLE_PLACE_ID = Deno.env.get('GOOGLE_PLACE_ID') ?? '';

interface PlaceReview {
  author_name?: string;
  rating?: number;
  text?: string;
  time?: number; // seconds since epoch
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  if (!GOOGLE_PLACES_API_KEY || !GOOGLE_PLACE_ID) {
    return jsonResponse({ ok: false, skipped: 'missing GOOGLE_PLACES_API_KEY or GOOGLE_PLACE_ID' }, 503);
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const url =
    `https://maps.googleapis.com/maps/api/place/details/json?` +
    `place_id=${encodeURIComponent(GOOGLE_PLACE_ID)}` +
    `&fields=reviews,rating,user_ratings_total` +
    `&reviews_sort=newest&reviews_no_translations=true` +
    `&key=${GOOGLE_PLACES_API_KEY}`;

  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    return jsonResponse({ ok: false, error: `places api ${res.status}`, body: txt.slice(0, 400) }, 502);
  }
  const json = await res.json();
  const reviews: PlaceReview[] = json?.result?.reviews ?? [];

  // Pull applicants for name matching
  const { data: applicants } = await admin
    .from('applicants')
    .select('id, contractor_id, google_review_match_name, first_name, last_name, total_ratings_count, avg_customer_rating');

  let inserted = 0;
  let matched = 0;

  for (const r of reviews) {
    const reviewId = `${r.time ?? 0}:${(r.author_name ?? '').toLowerCase()}`;
    const postedAt = r.time ? new Date(r.time * 1000).toISOString() : null;

    // Try to match by name appearing in review text or author name
    const haystack = `${r.author_name ?? ''} ${r.text ?? ''}`.toLowerCase();
    const match = (applicants ?? []).find((a) => {
      const needle = (a.google_review_match_name || `${a.first_name ?? ''}`).trim().toLowerCase();
      return needle.length >= 3 && haystack.includes(needle);
    });

    const { error: insErr } = await admin.from('google_reviews').upsert(
      {
        review_id: reviewId,
        reviewer_name: r.author_name ?? null,
        rating: r.rating ?? 0,
        review_text: r.text ?? null,
        posted_at: postedAt,
        contractor_id: match?.contractor_id ?? null,
        contractor_name_matched: match?.google_review_match_name ?? null,
        raw_payload: r as Record<string, unknown>,
      },
      { onConflict: 'review_id' },
    );
    if (!insErr) inserted++;

    // Bump applicant counters when we matched a new review
    if (match) {
      matched++;
      const prevCount = match.total_ratings_count ?? 0;
      const prevAvg = Number(match.avg_customer_rating ?? 0);
      const newCount = prevCount + 1;
      const newAvg = prevCount > 0
        ? ((prevAvg * prevCount) + (r.rating ?? 0)) / newCount
        : (r.rating ?? 0);

      await admin
        .from('applicants')
        .update({
          total_ratings_count: newCount,
          avg_customer_rating: Number(newAvg.toFixed(2)),
          last_review_match_at: new Date().toISOString(),
        })
        .eq('id', match.id);
    }
  }

  await admin.from('integration_logs').insert({
    source: 'google_places',
    event: 'poll_reviews',
    status: 'success',
    payload_hash: `inserted=${inserted} matched=${matched} fetched=${reviews.length}`,
  });

  return new Response(
    JSON.stringify({ ok: true, fetched: reviews.length, inserted, matched }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
