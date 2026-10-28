// Tidy — Pro GPS self-test.
//
// Lets any signed-in Pro (or the owner) run a real phone-location check
// without an assigned visit: the phone's GPS reading is recorded in
// public.pro_gps_tests, optionally measured against a typed address
// (geocoded with the Google key). Per the owner's rule, a missing or
// unverifiable target records "no_target" (GPS unverified) — it never
// blocks. No visit, pay or member data is touched.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

const BodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100000).optional(),
  address: z.string().trim().min(5).max(300).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const env = readEnv(REQUIRED_ENV);
  if (req.method === 'GET') {
    return jsonResponse({ ok: env.missing.length === 0, function: 'pro-gps-test', missing_env: env.missing });
  }
  if (env.missing.length) return jsonResponse({ ok: false, error: missingEnvError(env.missing) });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' });

  try {
    const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return jsonResponse({ ok: false, error: 'unauthorized' });
    const { data: userData } = await admin.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) return jsonResponse({ ok: false, error: 'unauthorized' });

    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonResponse({ ok: false, error: 'invalid_body' });
    const { lat, lng, accuracy_m, address } = parsed.data;

    // Optional target: geocode the address the tester is standing at.
    let targetLat: number | null = null;
    let targetLng: number | null = null;
    let geocodeFailed = false;
    const mapsKey = Deno.env.get('GOOGLE_PLACES_API_KEY') ?? '';
    if (address && mapsKey) {
      try {
        const url = 'https://maps.googleapis.com/maps/api/geocode/json?address='
          + encodeURIComponent(address) + '&key=' + mapsKey;
        const res = await fetch(url);
        const geo = await res.json();
        const loc = geo?.results?.[0]?.geometry?.location;
        if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
          targetLat = loc.lat;
          targetLng = loc.lng;
        } else {
          geocodeFailed = true;
        }
      } catch {
        geocodeFailed = true;
      }
    } else if (address) {
      geocodeFailed = true;
    }

    let distanceM: number | null = null;
    let result: 'within_150m' | 'outside_150m' | 'no_target' = 'no_target';
    if (targetLat !== null && targetLng !== null) {
      const { data: dist, error: distErr } = await admin.rpc('pro_gps_distance', {
        _lat: lat, _lng: lng, _target_lat: targetLat, _target_lng: targetLng,
      });
      if (!distErr && typeof dist === 'number') {
        distanceM = Math.round(dist);
        result = distanceM <= 150 ? 'within_150m' : 'outside_150m';
      }
    }

    const { error: insertErr } = await admin.from('pro_gps_tests').insert({
      pro_user_id: uid,
      lat,
      lng,
      accuracy_m: accuracy_m ?? null,
      target_address: address ?? null,
      target_lat: targetLat,
      target_lng: targetLng,
      distance_m: distanceM,
      result,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    });
    if (insertErr) return jsonResponse({ ok: false, error: 'record_failed' });

    return jsonResponse({
      ok: true,
      result,
      distance_m: distanceM,
      accuracy_m: accuracy_m ?? null,
      geocode_failed: geocodeFailed,
    });
  } catch (e) {
    console.error('[pro-gps-test] error', e);
    return jsonResponse({ ok: false, error: 'unexpected' }, 500);
  }
});
