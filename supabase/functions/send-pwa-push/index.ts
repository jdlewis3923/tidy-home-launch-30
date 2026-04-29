// Tidy — Web Push helper (Phase A)
//
// Sends a Web Push notification to all of a user's registered subscriptions
// (rows in `push_subscriptions`). Uses VAPID keys from the vault via
// admin_get_vapid_public + PWA_VAPID_PRIVATE_KEY secret.
//
// Body: { user_id, title, body, url? }
// Auth: service-role only (called by other edge functions).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE = Deno.env.get('PWA_VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('PWA_VAPID_SUBJECT') ?? 'mailto:admin@jointidy.co';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function getVapidPublic(): Promise<string> {
  const { data, error } = await admin.rpc('admin_get_vapid_public');
  if (error || !data) throw new Error('vapid public key unavailable');
  return data as string;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (auth !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    const { user_id, title, body, url } = await req.json();
    if (!user_id || !title || !body) {
      return jsonResponse({ error: 'user_id, title, body required' }, 400);
    }

    if (!VAPID_PRIVATE) {
      return jsonResponse({ error: 'PWA_VAPID_PRIVATE_KEY not configured', sent: 0 }, 200);
    }

    const vapidPublic = await getVapidPublic();
    webpush.setVapidDetails(VAPID_SUBJECT, vapidPublic, VAPID_PRIVATE);

    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('user_id', user_id);
    if (error) return jsonResponse({ error: error.message }, 500);
    if (!subs || subs.length === 0) return jsonResponse({ sent: 0, reason: 'no subscriptions' });

    const payload = JSON.stringify({ title, body, url: url ?? '/admin/kpis' });
    let sent = 0; let failed = 0;
    for (const s of subs) {
      try {
        await webpush.sendNotification({
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth_key },
        }, payload);
        sent++;
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id);
      } catch (e: any) {
        failed++;
        // Drop dead subscriptions
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('id', s.id);
        }
      }
    }
    return jsonResponse({ sent, failed });
  } catch (e: any) {
    console.error('[send-pwa-push] error', e);
    return jsonResponse({ error: e?.message ?? 'unknown' }, 500);
  }
});
