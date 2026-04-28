// Tidy — Stub Jobber line-item write.
// Wired to existing Jobber client when GraphQL mutation is finalized.
// For now, logs the intent and returns ok. Service-role only.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const BodySchema = z.object({
  jobber_visit_id: z.string(),
  addon_name: z.string(),
  addon_price: z.number(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method not allowed' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.slice(7) !== SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { return jsonResponse({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return jsonResponse({ ok: false, error: 'validation_failed' }, 400);

  // TODO: integrate jobber-client.ts mutation jobLineItemCreate
  console.log('[add-jobber-line-item] STUB — would create line item', parsed.data);
  return jsonResponse({ ok: true, stub: true, ...parsed.data });
});
