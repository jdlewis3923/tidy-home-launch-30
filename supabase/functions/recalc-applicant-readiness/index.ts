// recalc-applicant-readiness — admin-only.
// Reads pro_visits + google_reviews + complaints + escalations for a contractor
// and writes the recomputed counters/rates back to applicants. Also flips
// tier_readiness_status to 'eligible' or 'not_eligible' based on Tier 2 gates.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const Body = z.object({ applicant_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401);
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user) return jsonResponse({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await admin.rpc('has_role', { _user_id: u.user.id, _role: 'admin' });
  if (!isAdmin) return jsonResponse({ error: 'forbidden' }, 403);

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonResponse({ error: 'invalid_body' }, 400);

  const { data: app } = await admin.from('applicants').select('id, contractor_id').eq('id', parsed.data.applicant_id).single();
  if (!app?.contractor_id) return jsonResponse({ error: 'no_contractor_id' }, 400);
  const cid = app.contractor_id;

  const [{ data: visits }, { data: reviews }, { count: complaints }, { count: escalations }] = await Promise.all([
    admin.from('pro_visits').select('status, customer_rating, photos_count, photos_expected, completed_at').eq('contractor_id', cid),
    admin.from('google_reviews').select('rating, posted_at').eq('contractor_id', cid),
    admin.from('complaints').select('id', { count: 'exact', head: true }).eq('contractor_id', cid).is('closed_at', null),
    admin.from('escalations').select('id', { count: 'exact', head: true }).eq('contractor_id', cid).is('resolved_at', null),
  ]);

  const completed = (visits ?? []).filter((v) => v.status === 'complete').length;
  const cancelled = (visits ?? []).filter((v) => v.status === 'cancelled').length;
  const photosUp = (visits ?? []).reduce((s, v) => s + (v.photos_count ?? 0), 0);
  const photosEx = (visits ?? []).reduce((s, v) => s + (v.photos_expected ?? 0), 0);
  const lastVisit = (visits ?? []).map((v) => v.completed_at).filter(Boolean).sort().slice(-1)[0] ?? null;

  const ratings = (reviews ?? []).map((r) => Number(r.rating ?? 0)).filter((n) => n > 0);
  const avg = ratings.length ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2)) : null;

  const cancelRate = (completed + cancelled) ? cancelled / (completed + cancelled) : 0;
  const eligible =
    completed >= 30 &&
    (avg ?? 0) >= 4.7 &&
    cancelRate <= 0.05 &&
    (complaints ?? 0) === 0 &&
    (escalations ?? 0) === 0;

  const update = {
    completed_visits: completed,
    contractor_cancel_count: cancelled,
    photos_uploaded_count: photosUp,
    photos_expected_count: photosEx,
    avg_customer_rating: avg,
    total_ratings_count: ratings.length,
    complaint_count: complaints ?? 0,
    open_escalations_count: escalations ?? 0,
    last_visit_at: lastVisit,
    tier_readiness_status: eligible ? 'eligible' : 'not_eligible',
  };

  await admin.from('applicants').update(update).eq('id', app.id);
  await admin.from('onboarding_events').insert({ applicant_id: app.id, event: 'readiness_recalculated', metadata: update });

  return jsonResponse({ ok: true, ...update, eligible });
});
