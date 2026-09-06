// Tidy — Pro push subscription endpoint.
//
// Three actions, all for the calling signed-in user only:
//   key         -> returns the VAPID public key (not a secret; needed to subscribe)
//   subscribe   -> stores/refreshes this device's push subscription
//   unsubscribe -> removes this device's subscription
//
// The private VAPID key never leaves the server; sending is done by send-pwa-push.

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { readEnv, missingEnvError } from '../_shared/handlerEnv.ts';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

const BodySchema = z.object({
  action: z.enum(['key', 'subscribe', 'unsubscribe']),
  endpoint: z.string().url().max(1000).optional(),
  p256dh: z.string().max(500).optional(),
  auth_key: z.string().max(500).optional(),
});

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const env = readEnv(REQUIRED_ENV);
  if (req.method === 'GET') {
    return jsonResponse({ ok: env.missing.length === 0, function: 'pro-push', missing_env: env.missing });
  }
  if (env.missing.length) return jsonResponse({ ok: false, error: missingEnvError(env.missing) });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' });

  try {
    console.log('[pro-push] entry');
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
    const { action, endpoint, p256dh, auth_key } = parsed.data;

    if (action === 'key') {
      const { data, error } = await admin.rpc('admin_get_vapid_public');
      if (error || !data) return jsonResponse({ ok: false, error: 'vapid_key_unavailable' });
      return jsonResponse({ ok: true, vapid_public_key: data });
    }

    if (!endpoint) return jsonResponse({ ok: false, error: 'endpoint_required' });

    if (action === 'unsubscribe') {
      await admin.from('push_subscriptions').delete().eq('user_id', uid).eq('endpoint', endpoint);
      return jsonResponse({ ok: true, action });
    }

    if (!p256dh || !auth_key) return jsonResponse({ ok: false, error: 'keys_required' });
    const { data: existing } = await admin
      .from('push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .maybeSingle();
    const row = {
      user_id: uid,
      endpoint,
      p256dh,
      auth_key,
      last_used_at: new Date().toISOString(),
    };
    if (existing) {
      await admin.from('push_subscriptions').update(row).eq('id', existing.id);
    } else {
      await admin.from('push_subscriptions').insert(row);
    }
    return jsonResponse({ ok: true, action });
  } catch (e) {
    console.error('[pro-push] failed', (e as Error).message);
    return jsonResponse({ ok: false, error: (e as Error).message });
  }
});
