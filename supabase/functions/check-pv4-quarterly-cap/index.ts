// Tidy — Returns whether PV4 review SMS may fire (90-day cap).
// Updates profiles.last_pv4_review_request_at when allow=true and
// commit=true (caller should pass commit=true after SMS actually sent).

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

const BodySchema = z.object({
  user_id: z.string().uuid(),
  commit: z.boolean().optional().default(false),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: 'validation_failed' }, 400);
  }
  const { user_id, commit } = parsed.data;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile } = await admin
    .from('profiles')
    .select('last_pv4_review_request_at')
    .eq('user_id', user_id)
    .maybeSingle();

  let allow = true;
  let reason: string | undefined;
  if (profile?.last_pv4_review_request_at) {
    const last = new Date(profile.last_pv4_review_request_at).getTime();
    if (Date.now() - last < NINETY_DAYS_MS) {
      allow = false;
      reason = 'pv4_within_90_days';
    }
  }

  if (allow && commit) {
    await admin
      .from('profiles')
      .update({ last_pv4_review_request_at: new Date().toISOString() })
      .eq('user_id', user_id);
  }

  return jsonResponse({ ok: true, allow, reason });
});
