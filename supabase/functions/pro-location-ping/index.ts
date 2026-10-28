// Tidy — Pro live location ping.
//
// While a visit is on_the_way or in_progress, the Pro's phone browser sends
// a location reading every few minutes so the owner tracker can show how far
// the Pro is from the job. All rules are enforced server-side in
// public.pro_record_ping: the visit must be assigned to the caller and
// currently active, otherwise the ping is refused. Pings never affect pay,
// check-in, or the 150 m rules — they are visibility only.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

const BodySchema = z.object({
  visit_id: z.string().uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100000).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const env = readEnv(REQUIRED_ENV);
  if (req.method === 'GET') {
    return jsonResponse({ ok: env.missing.length === 0, function: 'pro-location-ping', missing_env: env.missing });
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
    const { visit_id, lat, lng, accuracy_m } = parsed.data;

    const { data, error } = await admin.rpc('pro_record_ping', {
      _visit: visit_id, _pro: uid, _lat: lat, _lng: lng, _accuracy: accuracy_m ?? null,
    });
    if (error) return jsonResponse({ ok: false, error: error.message }, 403);
    return jsonResponse(data ?? { ok: true });
  } catch (e) {
    console.error('[pro-location-ping] error', e);
    return jsonResponse({ ok: false, error: 'unexpected' }, 500);
  }
});
