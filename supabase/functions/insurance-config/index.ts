// insurance-config — PUBLIC read-only endpoint.
//
// /apply is an anonymous page and app_settings is admin-only readable, so the
// non-secret insurance configuration is exposed through this function.
//
// Returns:
//   requirements        — GL limits Tidy currently requires (app_settings.insurance_requirements)
//   additional_insured  — the Tidy legal entity that must be listed as Additional
//                         Insured (NOT the same thing as Certificate Holder)
//   thimble             — PUBLIC subset only: { enabled, partner_url }.
//                         partner_id / affiliate_id are never returned to the browser.
//
// THIMBLE PARTNER CONFIGURATION REQUIRED: until app_settings.thimble_config has
// enabled=true and a real partner_url from Thimble, `thimble.enabled` is false
// and the frontend renders the CTA in a "coming soon" state instead of linking
// to a fabricated URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

const DEFAULT_REQUIREMENTS = {
  per_occurrence_cents: 100_000_000,
  aggregate_cents: 200_000_000,
  currency: 'USD',
  policy_type: 'general_liability',
};

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const { data } = await admin
    .from('app_settings')
    .select('key, value')
    .in('key', ['insurance_requirements', 'insurance_additional_insured', 'thimble_config']);

  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value as Record<string, unknown> | undefined;

  const thimble = get('thimble_config') ?? {};
  const partnerUrl = String((thimble as any).partner_url ?? '').trim();

  return jsonResponse({
    requirements: get('insurance_requirements') ?? DEFAULT_REQUIREMENTS,
    additional_insured: get('insurance_additional_insured') ?? { required: false },
    thimble: {
      // A partner URL alone is not enough — Tidy must explicitly enable it.
      enabled: Boolean((thimble as any).enabled) && partnerUrl.length > 0,
      partner_url: partnerUrl,
      embed_supported: Boolean((thimble as any).embed_supported),
    },
  });
});
