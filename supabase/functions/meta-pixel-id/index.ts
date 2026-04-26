// Tiny public endpoint that returns the captured Meta Pixel ID so the
// client-side Pixel snippet can self-configure. Vault is server-only,
// so the SPA cannot read it directly — this exposes only the pixel id
// (already public on every page once Pixel fires) and never the CAPI token.
//
// Cached at the edge for 5 minutes to keep page loads fast.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ENV_FALLBACK = Deno.env.get('META_PIXEL_ID') ?? '';

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await sb.rpc('admin_get_meta_secret', {
      _name: 'meta_pixel_id',
    });
    let pixelId = (data as string | null) || ENV_FALLBACK;
    if (pixelId && /^BLOCKED/i.test(pixelId)) pixelId = '';
    return jsonResponse(
      { pixel_id: pixelId || null },
      200,
      { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return jsonResponse({ pixel_id: null, error: msg }, 200);
  }
});
