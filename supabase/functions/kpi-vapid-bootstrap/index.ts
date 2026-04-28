/**
 * kpi-vapid-bootstrap — One-time generator for VAPID push keys.
 *
 * Generates a P-256 ECDSA key pair (the format Web Push requires) using
 * the Deno standard `crypto.subtle` API — no npm install needed. Encodes
 * keys as URL-safe base64 (RFC 7515) and stores them in vault via
 * `admin_set_vapid_secret`. Idempotent: if PWA_VAPID_PUBLIC_KEY already
 * exists, returns it without regenerating.
 *
 * Admin-only. Returns the public key so the UI can use it immediately.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generateVapidKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const pubJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  // VAPID public key is uncompressed P-256: 0x04 || X (32) || Y (32)
  const x = Uint8Array.from(atob(pubJwk.x!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const y = Uint8Array.from(atob(pubJwk.y!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const pub = new Uint8Array(65);
  pub[0] = 0x04;
  pub.set(x, 1);
  pub.set(y, 33);
  // Private key: raw 32-byte d
  const d = Uint8Array.from(atob(privJwk.d!.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return { publicKey: b64urlEncode(pub), privateKey: b64urlEncode(d) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  // Verify caller is an admin
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { data: roles } = await userClient.from('user_roles').select('role').eq('user_id', userData.user.id);
  if (!(roles ?? []).some((r) => r.role === 'admin')) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Idempotency — if public key already in vault, just return it
  const { data: existing } = await admin.rpc('admin_get_vapid_public');
  if (typeof existing === 'string' && existing.length > 0) {
    return new Response(
      JSON.stringify({ ok: true, public_key: existing, generated: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { publicKey, privateKey } = await generateVapidKeyPair();
    const subject = 'mailto:admin@jointidy.co';

    const setSecret = async (name: string, value: string) => {
      const { error } = await admin.rpc('admin_set_vapid_secret', { _name: name, _value: value });
      if (error) throw new Error(`vault set ${name} failed: ${error.message}`);
    };
    await setSecret('PWA_VAPID_PUBLIC_KEY', publicKey);
    await setSecret('PWA_VAPID_PRIVATE_KEY', privateKey);
    await setSecret('PWA_VAPID_SUBJECT', subject);

    return new Response(
      JSON.stringify({ ok: true, public_key: publicKey, generated: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
