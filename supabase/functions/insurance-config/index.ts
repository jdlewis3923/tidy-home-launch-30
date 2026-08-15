// insurance-config — PUBLIC read-only endpoint.
//
// /apply is an anonymous page, so the non-secret insurance configuration is
// exposed through this function.
//
// Returns:
//   requirements            — global default GL limits (app_settings.insurance_requirements)
//   requirements_by_service — per service category rules (public.insurance_requirements)
//   additional_insured      — the Tidy legal entity that must be listed as Additional
//                             Insured (NOT the same thing as Certificate Holder)
//   providers               — PUBLIC subset of public.insurance_providers. Partner ids,
//                             affiliate ids and tokens are never returned to the browser;
//                             only the URLs the browser must open.
//   thimble                 — back-compat convenience view of the preferred provider.
//
// EXTERNAL CONFIGURATION REQUIRED: until the `thimble` row in
// public.insurance_providers has enabled=true and a real embed/referral URL from
// Thimble, the provider is reported disabled and the frontend renders the CTA in
// a "coming soon" state instead of linking to a fabricated URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { handleCors, jsonResponse } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

// Optional environment overrides — used only when the DB row leaves them blank.
const THIMBLE_EMBED_URL = Deno.env.get('THIMBLE_EMBED_URL') ?? '';
const THIMBLE_REFERRAL_URL = Deno.env.get('THIMBLE_REFERRAL_URL') ?? '';

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

  const [settingsRes, reqRes, provRes] = await Promise.all([
    admin
      .from('app_settings')
      .select('key, value')
      .in('key', ['insurance_requirements', 'insurance_additional_insured', 'thimble_config']),
    admin.from('insurance_requirements').select('*').eq('enabled', true),
    admin.from('insurance_providers').select('*').order('display_order', { ascending: true }),
  ]);

  const settings = settingsRes.data ?? [];
  const get = (k: string) => settings.find((r) => r.key === k)?.value as Record<string, unknown> | undefined;

  const requirements_by_service: Record<string, unknown> = {};
  for (const r of reqRes.data ?? []) {
    requirements_by_service[r.service_category] = {
      service_category: r.service_category,
      per_occurrence_cents: Number(r.per_occurrence_limit_cents),
      aggregate_cents: Number(r.aggregate_limit_cents),
      additional_insured_required: Boolean(r.additional_insured_required),
      accepted_policy_types: r.accepted_policy_types ?? ['general_liability'],
      reminder_days: r.reminder_days ?? [30, 14, 7],
      manual_verification_required: Boolean(r.manual_verification_required),
    };
  }

  const providers = (provRes.data ?? []).map((p) => {
    const isThimble = p.provider_key === 'thimble';
    const embed_url = String(p.embed_url ?? '').trim() || (isThimble ? THIMBLE_EMBED_URL : '');
    const referral_url = String(p.referral_url ?? '').trim() || (isThimble ? THIMBLE_REFERRAL_URL : '');
    const hasDestination = embed_url.length > 0 || referral_url.length > 0;
    return {
      provider_key: p.provider_key,
      display_name: p.display_name,
      provider_type: p.provider_type,
      integration_type: p.integration_type,
      // A URL alone is never enough — Tidy must explicitly enable the provider.
      enabled: Boolean(p.enabled) && (p.provider_key === 'other' || hasDestination),
      is_preferred: Boolean(p.is_preferred),
      referral_url,
      embed_url,
      embed_supported: Boolean(p.embed_supported) && embed_url.length > 0,
      supported_service_categories: p.supported_service_categories ?? [],
      display_order: p.display_order ?? 0,
      disclosure_text: p.disclosure_text ?? '',
    };
  });

  const thimbleProvider = providers.find((p) => p.provider_key === 'thimble');
  const legacy = get('thimble_config') ?? {};
  const legacyUrl = String((legacy as any).partner_url ?? '').trim();

  return jsonResponse({
    requirements: get('insurance_requirements') ?? DEFAULT_REQUIREMENTS,
    requirements_by_service,
    additional_insured: get('insurance_additional_insured') ?? { required: false },
    providers,
    thimble: {
      enabled: Boolean(thimbleProvider?.enabled) || (Boolean((legacy as any).enabled) && legacyUrl.length > 0),
      partner_url: thimbleProvider?.embed_url || thimbleProvider?.referral_url || legacyUrl,
      embed_supported: Boolean(thimbleProvider?.embed_supported),
    },
  });
});
