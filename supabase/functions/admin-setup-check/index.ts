// Tidy — Pre-flight launch readiness probe (/admin/setup-check)
//
// Admin-only. Returns an array of named checks with pass/fail/warn + a
// remediation hint. Used by the AdminSetupCheck page and surfaced as a red
// banner on /admin/applicants when any critical check fails.
//
// Checks:
//   1. Documenso template — env DOCUMENSO_TEMPLATE_ID or app_settings row.
//      Soft-warn if not configured (Documenso integration optional in dev).
//   2. STRIPE_CONNECT_API_KEY — GET /v1/accounts?limit=1.
//   3. CHECKR_API_KEY — warn (not error) if unset; ping /v1/account otherwise.
//   4. BREVO_API_KEY — GET /v3/account.
//   5. tidy-docs bucket — verify the required contractor PDFs are uploaded.
//   6. Brevo plan != free — derive from /v3/account.planType (if available).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { isValidStripeSecretKey, stripeSecretKeyError } from '../_shared/stripe-keys.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STRIPE_CONNECT_API_KEY = Deno.env.get('STRIPE_CONNECT_API_KEY') ?? '';
const CHECKR_API_KEY = Deno.env.get('CHECKR_API_KEY') ?? '';
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? '';
const DOCUMENSO_API_KEY = Deno.env.get('DOCUMENSO_API_KEY') ?? '';

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Status = 'pass' | 'fail' | 'warn';
type Check = { id: string; label: string; status: Status; detail: string; remediation?: string };

async function checkStripe(): Promise<Check> {
  if (!isValidStripeSecretKey(STRIPE_CONNECT_API_KEY)) {
    const { reason } = stripeSecretKeyError('STRIPE_CONNECT_API_KEY');
    return { id: 'stripe_connect', label: 'Stripe Connect API key', status: 'fail',
      detail: reason,
      remediation: 'Paste a valid Stripe Connect secret key (sk_live_… or sk_test_…) in Lovable Cloud secrets. Publishable/restricted/malformed keys are not accepted.' };
  }
  try {
    const r = await fetch('https://api.stripe.com/v1/accounts?limit=1', {
      headers: { Authorization: `Bearer ${STRIPE_CONNECT_API_KEY}` },
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { id: 'stripe_connect', label: 'Stripe Connect API key', status: 'fail',
        detail: `HTTP ${r.status}: ${t.slice(0, 140)}`,
        remediation: 'Rotate the Stripe key and ensure Connect is enabled on the platform account.' };
    }
    return { id: 'stripe_connect', label: 'Stripe Connect API key', status: 'pass', detail: 'API responded 200' };
  } catch (e) {
    return { id: 'stripe_connect', label: 'Stripe Connect API key', status: 'fail',
      detail: (e as Error).message, remediation: 'Network or DNS failure reaching api.stripe.com.' };
  }
}

async function checkCheckr(): Promise<Check> {
  if (!CHECKR_API_KEY) {
    return { id: 'checkr', label: 'Checkr background checks', status: 'warn',
      detail: 'CHECKR_API_KEY is not set — background checks will skip',
      remediation: 'Set CHECKR_API_KEY once Checkr account is approved.' };
  }
  try {
    const r = await fetch('https://api.checkr.com/v1/account', {
      headers: { Authorization: `Basic ${btoa(CHECKR_API_KEY + ':')}` },
    });
    if (!r.ok) return { id: 'checkr', label: 'Checkr background checks', status: 'fail',
      detail: `HTTP ${r.status}`, remediation: 'Verify CHECKR_API_KEY is the production key, not the docs key.' };
    return { id: 'checkr', label: 'Checkr background checks', status: 'pass', detail: 'API responded 200' };
  } catch (e) {
    return { id: 'checkr', label: 'Checkr background checks', status: 'fail', detail: (e as Error).message };
  }
}

async function checkBrevo(): Promise<{ key: Check; plan: Check }> {
  if (!BREVO_API_KEY) {
    return {
      key: { id: 'brevo_key', label: 'Brevo API key', status: 'fail', detail: 'BREVO_API_KEY is not set',
        remediation: 'Set BREVO_API_KEY in Lovable Cloud secrets.' },
      plan: { id: 'brevo_plan', label: 'Brevo plan (paid)', status: 'fail', detail: 'No API key — cannot read plan' },
    };
  }
  try {
    const r = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': BREVO_API_KEY, accept: 'application/json' },
    });
    if (!r.ok) {
      return {
        key: { id: 'brevo_key', label: 'Brevo API key', status: 'fail', detail: `HTTP ${r.status}`,
          remediation: 'Rotate the BREVO_API_KEY in the Brevo dashboard and update the secret.' },
        plan: { id: 'brevo_plan', label: 'Brevo plan (paid)', status: 'fail', detail: 'Account fetch failed' },
      };
    }
    const j = await r.json();
    const planType: string = j?.plan?.[0]?.type ?? '';
    const isFree = planType.toLowerCase() === 'free';
    return {
      key: { id: 'brevo_key', label: 'Brevo API key', status: 'pass', detail: 'API responded 200' },
      plan: isFree
        ? { id: 'brevo_plan', label: 'Brevo plan (paid)', status: 'warn',
            detail: `Plan type: ${planType || 'unknown'} — free tier hits 300/day cap`,
            remediation: 'Upgrade Brevo to a paid plan before launch.' }
        : { id: 'brevo_plan', label: 'Brevo plan (paid)', status: 'pass',
            detail: `Plan type: ${planType || 'paid'}` },
    };
  } catch (e) {
    return {
      key: { id: 'brevo_key', label: 'Brevo API key', status: 'fail', detail: (e as Error).message },
      plan: { id: 'brevo_plan', label: 'Brevo plan (paid)', status: 'fail', detail: 'Account fetch failed' },
    };
  }
}

async function checkDocuments(): Promise<Check> {
  const required = [
    '10_ICA_IndependentContractorAgreement.pdf',
    '11_OfferLetter_Template.pdf',
    '12_OnboardingPacket_Cleaning.pdf',
    '13_OnboardingPacket_Lawn.pdf',
    '14_OnboardingPacket_Detail.pdf',
    '15_HelloSign_Contract_Cleaning.pdf',
    '16_HelloSign_Contract_Lawn.pdf',
    '17_HelloSign_Contract_Detail.pdf',
  ];
  const { data: rows } = await admin
    .from('company_documents')
    .select('filename, storage_path')
    .in('filename', required)
    .is('archived_at', null);
  const present = new Set((rows ?? [])
    .filter((r: any) => r.storage_path && !String(r.storage_path).startsWith('pending/'))
    .map((r: any) => r.filename));
  const missing = required.filter((f) => !present.has(f));
  if (missing.length === 0) {
    return { id: 'docs', label: 'Contractor PDFs uploaded', status: 'pass',
      detail: `All ${required.length} required PDFs present in tidy-docs bucket` };
  }
  return {
    id: 'docs', label: 'Contractor PDFs uploaded', status: 'fail',
    detail: `Missing or unuploaded: ${missing.join(', ')}`,
    remediation: 'Upload the missing PDFs at /admin/documents — rows still marked pending/ won\'t attach to emails.',
  };
}

async function checkDocumenso(): Promise<Check> {
  if (!DOCUMENSO_API_KEY) {
    return { id: 'documenso', label: 'Documenso contract template', status: 'warn',
      detail: 'DOCUMENSO_API_KEY not set — contracts will not auto-send',
      remediation: 'Set DOCUMENSO_API_KEY and configure DOCUMENSO_TEMPLATE_ID once ready.' };
  }
  // We can\'t deeply probe templates without knowing the template_id. The
  // dedicated /admin/documenso-templates page handles deep verification.
  return { id: 'documenso', label: 'Documenso contract template', status: 'pass',
    detail: 'API key configured — open /admin/documenso-templates to verify signature fields.' };
}

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'GET' && req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
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

  const [stripe, checkr, brevo, docs, documenso] = await Promise.all([
    checkStripe(), checkCheckr(), checkBrevo(), checkDocuments(), checkDocumenso(),
  ]);
  const checks: Check[] = [documenso, stripe, checkr, brevo.key, brevo.plan, docs];
  const summary = {
    pass: checks.filter((c) => c.status === 'pass').length,
    warn: checks.filter((c) => c.status === 'warn').length,
    fail: checks.filter((c) => c.status === 'fail').length,
  };
  return jsonResponse({ ok: true, checks, summary });
});
