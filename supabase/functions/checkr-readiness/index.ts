import '../_shared/http.ts'; // bounds every outbound call in this invocation (timeouts)
// Tidy — Checkr readiness probe for /admin/health.
//
// Reports whether each of the three Checkr secrets is SET (boolean only — the
// values are never read into the response, logged, or returned in any form),
// whether the most recent Checkr API call succeeded, and when the last verified
// webhook arrived. Admin-only.

import { handleCors, jsonResponse } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { requireServiceOrAdmin } from '../_shared/admin-auth.ts';
import { readEnv, readOptionalEnv } from '../_shared/handlerEnv.ts';

Deno.serve(async (req) => {
  const pre = handleCors(req); if (pre) return pre;

  const auth = await requireServiceOrAdmin(req);
  if (!auth.ok) return jsonResponse({ error: auth.error }, auth.status);

  const env = readEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const);
  if (env.missing.length) return jsonResponse({ error: `MISSING_ENV: ${env.missing.join(', ')}` }, 500);
  const admin = createClient(env.values.SUPABASE_URL, env.values.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Presence only. Never the value.
  const secrets = {
    CHECKR_API_KEY: !!readOptionalEnv('CHECKR_API_KEY'),
    CHECKR_PACKAGE: !!readOptionalEnv('CHECKR_PACKAGE'),
    CHECKR_WEBHOOK_SECRET: !!readOptionalEnv('CHECKR_WEBHOOK_SECRET'),
  };

  const { data: rows } = await admin
    .from('integration_logs')
    .select('event, status, created_at, error_message')
    .eq('source', 'checkr')
    .order('created_at', { ascending: false })
    .limit(200);

  const all = rows ?? [];
  const lastApi = all.find((r) => !String(r.event ?? '').startsWith('webhook')) ?? null;
  const lastWebhook = all.find((r) => String(r.event ?? '').startsWith('webhook:')) ?? null;
  const lastRejected = all.find((r) => r.event === 'webhook_rejected') ?? null;

  const { count: pendingCount } = await admin
    .from('applicants')
    .select('id', { count: 'exact', head: true })
    .eq('bg_check_provider', 'checkr')
    .eq('bg_check_status', 'pending');

  const { count: reviewCount } = await admin
    .from('applicants')
    .select('id', { count: 'exact', head: true })
    .eq('bg_check_manual_review', true);

  const allSecretsSet = Object.values(secrets).every(Boolean);
  const state = !allSecretsSet
    ? 'not_configured'
    : lastApi?.status === 'error'
      ? 'failing'
      : 'ready';

  return jsonResponse({
    ok: true,
    state,
    secrets,
    last_api_call: lastApi
      ? { event: lastApi.event, status: lastApi.status, at: lastApi.created_at, error: lastApi.error_message ?? null }
      : null,
    last_webhook_at: lastWebhook?.created_at ?? null,
    last_webhook_event: lastWebhook?.event ?? null,
    last_rejected_webhook_at: lastRejected?.created_at ?? null,
    pending_checks: pendingCount ?? 0,
    awaiting_manual_review: reviewCount ?? 0,
  });
});
