// Tidy — public Google reviews feed.
// Serves the live Google Business Profile rating, true review count and the
// review objects verbatim from Places API (New). Cached 24h in
// google_listing_cache; if Google fails, the last cached set is served.
// Never fabricates: with no cache and no API, returns { available: false }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
const PLACE_ID = Deno.env.get('GOOGLE_PLACE_ID') ?? '';
const TTL_MS = 24 * 60 * 60 * 1000;

type Cache = {
  rating: number | null; total_count: number | null; maps_uri: string | null;
  reviews: unknown[]; fetched_at: string; last_error: string | null;
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') ?? '';
const MAPS_CONN_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? '';
const FIELD_MASK = 'rating,userRatingCount,googleMapsUri,reviews';

async function fetchGoogle() {
  const path = `places/v1/places/${encodeURIComponent(PLACE_ID)}`;
  // Prefer the Google Maps connector; fall back to the project's own key.
  const res = LOVABLE_API_KEY && MAPS_CONN_KEY
    ? await fetch(`https://connector-gateway.lovable.dev/google_maps/${path}`, {
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'X-Connection-Api-Key': MAPS_CONN_KEY, 'X-Goog-FieldMask': FIELD_MASK },
        signal: AbortSignal.timeout(10_000),
      })
    : await fetch(`https://places.googleapis.com/v1/${path}`, {
        headers: { 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
        signal: AbortSignal.timeout(10_000),
      });
  if (!res.ok) throw new Error(`places ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json();
  const reviews = (j.reviews ?? []).map((r: any) => ({
    id: r.name ?? null,
    author: r.authorAttribution?.displayName ?? null,
    author_photo: r.authorAttribution?.photoUri ?? null,
    author_uri: r.authorAttribution?.uri ?? null,
    rating: r.rating ?? null,
    relative_time: r.relativePublishTimeDescription ?? null,
    publish_time: r.publishTime ?? null,
    // Verbatim original text first, never a translation.
    text: r.originalText?.text ?? r.text?.text ?? '',
    review_uri: r.googleMapsUri ?? null,
  }));
  return {
    rating: typeof j.rating === 'number' ? j.rating : null,
    total_count: typeof j.userRatingCount === 'number' ? j.userRatingCount : null,
    maps_uri: j.googleMapsUri ?? null,
    reviews,
  };
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const url = new URL(req.url);
  const force = url.searchParams.get('refresh') === '1';

  const { data: cached } = await admin.from('google_listing_cache').select('*').eq('id', 'tidy').maybeSingle<Cache>();
  const fresh = cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS;

  let row: Cache | null = cached ?? null;
  let source = 'cache';
  if ((!fresh || force) && (API_KEY || MAPS_CONN_KEY) && PLACE_ID) {
    try {
      const g = await fetchGoogle();
      const up = { id: 'tidy', ...g, fetched_at: new Date().toISOString(), last_error: null, last_error_at: null };
      await admin.from('google_listing_cache').upsert(up);
      row = up as Cache; source = 'google';
    } catch (e) {
      console.error('google-reviews-public', String(e));
      await admin.from('google_listing_cache').upsert({
        id: 'tidy', ...(cached ?? {}), last_error: String(e).slice(0, 500), last_error_at: new Date().toISOString(),
        ...(cached ? {} : { fetched_at: new Date(0).toISOString() }),
      });
    }
  }

  if (!row || row.total_count == null || !row.reviews?.length) return jsonResponse({ available: false });

  const { data: hoods } = await admin.from('google_reviewer_neighborhoods').select('author_name, neighborhood');
  const map = new Map((hoods ?? []).map((h) => [h.author_name.toLowerCase(), h.neighborhood]));
  const reviews = (row.reviews as any[]).map((r) => ({ ...r, neighborhood: map.get(String(r.author ?? '').toLowerCase()) ?? null }));

  return jsonResponse(
    { available: true, source, rating: row.rating, total_count: row.total_count, maps_uri: row.maps_uri, fetched_at: row.fetched_at, reviews },
    200,
    { 'Cache-Control': 'public, max-age=3600' },
  );
});
