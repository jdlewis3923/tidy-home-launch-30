// Tidy — Stripe Connect webhook receiver
//
// Listens for Connect platform events. Primary event we care about:
//   account.updated → check details_submitted && charges_enabled &&
//                     payouts_enabled. If all 3 true → set
//                     applicants.stripe_connect_complete = true.
//
// Signature verification: STRIPE_CONNECT_WEBHOOK_SECRET (whsec_...).
// Soft-pass when unset (parity with checkr-webhook) — log + warn so plumbing
// can be tested before the secret is live in Stripe Dashboard.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_CONNECT_WEBHOOK_SECRET = Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? '';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Stripe-Signature header format: t=<ts>,v1=<sig>[,v0=...]
async function verifyStripeSignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!STRIPE_CONNECT_WEBHOOK_SECRET) {
    console.warn('[stripe-connect-webhook] secret unset — soft-pass');
    return true;
  }
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')));
  const ts = parts.t; const v1 = parts.v1;
  if (!ts || !v1) return false;
  // Reject signatures older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const payload = `${ts}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(STRIPE_CONNECT_WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === v1.toLowerCase();
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const rawBody = await req.text();
  const sigHeader = req.headers.get('stripe-signature') ?? req.headers.get('Stripe-Signature');
  const valid = await verifyStripeSignature(rawBody, sigHeader);
  if (!valid) return jsonResponse({ error: 'invalid_signature' }, 401);

  let event: any;
  try { event = JSON.parse(rawBody); }
  catch { return jsonResponse({ error: 'invalid_json' }, 400); }

  const type: string = event?.type ?? '';
  const obj = event?.data?.object ?? {};

  // Locate applicant either by metadata.applicant_id or by stripe_account_id.
  const acctId: string | undefined = obj?.id ?? obj?.account;
  const metaApplicantId: string | undefined = obj?.metadata?.applicant_id;

  let applicantId: string | null = metaApplicantId ?? null;
  if (!applicantId && acctId) {
    const { data } = await admin.from('applicants').select('id').eq('stripe_account_id', acctId).maybeSingle();
    applicantId = data?.id ?? null;
  }

  // Audit log every event we receive (only if matched to applicant).
  if (applicantId) {
    await admin.from('onboarding_events').insert({
      applicant_id: applicantId,
      event: `stripe_connect_webhook:${type}`,
      metadata: {
        stripe_account_id: acctId,
        details_submitted: obj?.details_submitted ?? null,
        charges_enabled:   obj?.charges_enabled ?? null,
        payouts_enabled:   obj?.payouts_enabled ?? null,
        requirements: obj?.requirements ?? null,
      },
    });
  } else {
    console.warn('[stripe-connect-webhook] unmatched event', type, acctId);
  }

  if (type === 'account.updated' && applicantId) {
    const complete = !!(obj?.details_submitted && obj?.charges_enabled && obj?.payouts_enabled);
    const { error } = await admin
      .from('applicants')
      .update({ stripe_connect_complete: complete })
      .eq('id', applicantId);
    if (error) console.error('[stripe-connect-webhook] update failed', error);
    return jsonResponse({ ok: true, applicant_id: applicantId, stripe_connect_complete: complete });
  }

  return jsonResponse({ ok: true, type, matched: !!applicantId });
});
