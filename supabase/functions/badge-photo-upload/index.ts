import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — badge photo upload from the kit confirmation email.
//
// POST { token, filename, content_type, data_base64 }
// The token is pro_kit.badge_photo_token. The file lands in the private
// pro-badge-photos bucket; only the admin ever reads it back.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method not allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === 'string' ? body.token : '';
  const b64 = typeof body?.data_base64 === 'string' ? body.data_base64 : '';
  const contentType = typeof body?.content_type === 'string' && ALLOWED.includes(body.content_type)
    ? body.content_type
    : 'image/jpeg';
  if (token.length < 20 || !b64) return jsonResponse({ error: 'invalid_request' }, 400);

  const { data: kit } = await admin
    .from('pro_kit')
    .select('id, applicant_id, badge_name')
    .eq('badge_photo_token', token)
    .maybeSingle();
  if (!kit) return jsonResponse({ error: 'not_found' }, 404);

  let bytes: Uint8Array;
  try {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  } catch {
    return jsonResponse({ error: 'bad_encoding' }, 400);
  }
  if (bytes.byteLength > MAX_BYTES) return jsonResponse({ error: 'too_large' }, 413);

  const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  const path = `${kit.id}/badge-${Date.now()}.${ext}`;
  const up = await admin.storage.from('pro-badge-photos').upload(path, bytes, { contentType, upsert: false });
  if (up.error) return jsonResponse({ error: 'upload_failed' }, 500);

  await admin.from('pro_kit')
    .update({ badge_photo_path: path, badge_photo_uploaded_at: new Date().toISOString() })
    .eq('id', kit.id);

  if (kit.applicant_id) {
    await admin.from('onboarding_events').insert({
      applicant_id: kit.applicant_id,
      event: 'badge_photo_received',
      metadata: { path },
    });
  }

  return jsonResponse({ ok: true });
});
