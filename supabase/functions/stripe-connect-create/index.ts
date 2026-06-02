// Tidy — Stripe Connect Express onboarding link creator (admin-only)
//
// Body: { applicant_id: uuid, refresh_url?: string, return_url?: string }
//
// Creates a Stripe Connect Express account for the applicant if one doesn't
// exist yet (persisted as applicants.stripe_account_id), then mints an
// Account Link of type 'account_onboarding' and returns the URL.
//
// Requires STRIPE_CONNECT_API_KEY. If missing → 503 with a clear message
// (no silent failure — the admin UI surfaces this).

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STRIPE_CONNECT_API_KEY = Deno.env.get('STRIPE_CONNECT_API_KEY') ?? '';

const DEFAULT_BASE = 'https://miami-home-simplify.lovable.app';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const Body = z.object({
  applicant_id: z.string().uuid(),
  refresh_url: z.string().url().optional(),
  return_url: z.string().url().optional(),
});

function jwtRole(t: string): string | null {
  try {
    const parts = t.split('.');
    if (parts.length !== 3) return null;
    const pad = (s: string) => s + '='.repeat((4 - (s.length % 4)) % 4);
    const p = JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))));
    return p?.role ?? null;
  } catch { return null; }
}

async function stripePost(path: string, form: Record<string, string>): Promise<any> {
  const body = new URLSearchParams(form).toString();
  const r = await fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_CONNECT_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json?.error?.message ?? `stripe ${r.status}`;
    throw new Error(msg);
  }
  return json;
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  if (!STRIPE_CONNECT_API_KEY) {
    return jsonResponse({ error: 'stripe_connect_not_configured', reason: 'STRIPE_CONNECT_API_KEY is not set' }, 503);
  }

  const auth = req.headers.get('Authorization') ?? '';
  const apiKeyHeader = req.headers.get('apikey') ?? '';
  const tokenSource = auth.startsWith('Bearer ') ? auth.replace('Bearer ', '').trim() : apiKeyHeader.trim();
  if (!tokenSource) return jsonResponse({ error: 'unauthorized' }, 401);

  const role = jwtRole(tokenSource);
  if (role !== 'service_role') {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userRes } = await userClient.auth.getUser();
    const userId = userRes?.user?.id;
    if (!userId) return jsonResponse({ error: 'unauthorized' }, 401);
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) return jsonResponse({ error: 'forbidden' }, 403);
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonResponse({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
  }
  const { applicant_id, refresh_url, return_url } = parsed.data;

  const { data: applicant, error: aerr } = await admin
    .from('applicants')
    .select('id, first_name, last_name, email, phone, stripe_account_id')
    .eq('id', applicant_id).single();
  if (aerr || !applicant) return jsonResponse({ error: 'applicant_not_found' }, 404);

  let accountId = applicant.stripe_account_id as string | null;

  try {
    if (!accountId) {
      const acct = await stripePost('/accounts', {
        type: 'express',
        country: 'US',
        email: applicant.email,
        'capabilities[transfers][requested]': 'true',
        'business_type': 'individual',
        'business_profile[mcc]': '7349', // Cleaning & Maintenance Services
        'business_profile[product_description]': 'Independent contractor home services for Tidy Home Concierge.',
        'metadata[applicant_id]': applicant.id,
        'metadata[source]': 'tidy-onboarding',
      });
      accountId = acct.id;
      const { error: uerr } = await admin
        .from('applicants').update({ stripe_account_id: accountId }).eq('id', applicant.id);
      if (uerr) console.error('[stripe-connect-create] persist stripe_account_id failed', uerr);
    }

    const base = (refresh_url ?? '').replace(/\/[^/]*$/, '') || DEFAULT_BASE;
    const link = await stripePost('/account_links', {
      account: accountId!,
      refresh_url: refresh_url ?? `${DEFAULT_BASE}/onboarding/payment-return?refresh=1`,
      return_url:  return_url  ?? `${DEFAULT_BASE}/onboarding/payment-return`,
      type: 'account_onboarding',
    });

    await admin.from('onboarding_events').insert({
      applicant_id: applicant.id,
      event: 'stripe_connect_link_created',
      metadata: { stripe_account_id: accountId, expires_at: link.expires_at },
    });

    return jsonResponse({ ok: true, url: link.url, account_id: accountId, expires_at: link.expires_at });
  } catch (e) {
    console.error('[stripe-connect-create] failed', e);
    return jsonResponse({ error: 'stripe_error', message: (e as Error).message }, 502);
  }
});
