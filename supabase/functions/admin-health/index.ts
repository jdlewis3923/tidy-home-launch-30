// Tidy — Phase 8 admin-health endpoint.
//
// Aggregates the last 24h of integration_logs into a per-source summary so
// the /admin/health page can render a one-glance status table. Admin-only:
// the caller's JWT must resolve to a user with the `admin` role.
//
// Sources are normalized to a fixed allowlist so the response shape is
// stable even when no calls have been logged for a given source.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders, handleCors, jsonResponse } from '../_shared/cors.ts';
import { withLogging } from '../_shared/withLogging.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const TRACKED_SOURCES = [
  'stripe',
  'jobber',
  'resend',
  'twilio',
  'zapier',
  'meta_capi',
  'internal',
] as const;

type Source = typeof TRACKED_SOURCES[number];

interface SourceSummary {
  total_calls: number;
  success_count: number;
  error_count: number;
  warning_count: number;
  success_rate_pct: number | null;
  avg_latency_ms: number | null;
  last_call_at: string | null;
}

function emptySummary(): SourceSummary {
  return {
    total_calls: 0,
    success_count: 0,
    error_count: 0,
    warning_count: 0,
    success_rate_pct: null,
    avg_latency_ms: null,
    last_call_at: null,
  };
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  // ---------- Admin auth (same pattern as setup-stripe-catalog) ----------
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'unauthorized' }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roleCheck } = await supabase.rpc('has_role', {
    _user_id: userData.user.id,
    _role: 'admin',
  });
  if (roleCheck !== true) {
    return jsonResponse({ ok: false, error: 'forbidden — admin role required' }, 403);
  }

  try {
    const result = await withLogging({
      source: 'internal',
      event: 'admin_health',
      payload: { caller: userData.user.id },
      fn: async () => {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Pull all rows in the window. Volume is low (per-source caps at a
        // few thousand/day) so a single query + in-memory aggregation is
        // simpler than per-source SQL.
        const { data: rows, error } = await supabase
          .from('integration_logs')
          .select('source, status, latency_ms, created_at')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(10000);

        if (error) throw new Error(`integration_logs query failed: ${error.message}`);

        const sources: Record<Source, SourceSummary> = {
          stripe: emptySummary(),
          jobber: emptySummary(),
          resend: emptySummary(),
          twilio: emptySummary(),
          zapier: emptySummary(),
          meta_capi: emptySummary(),
          internal: emptySummary(),
        };

        // Track totals to compute averages without a second pass.
        const latencySum: Record<Source, number> = {
          stripe: 0, jobber: 0, resend: 0, twilio: 0, zapier: 0, meta_capi: 0, internal: 0,
        };
        const latencyN: Record<Source, number> = {
          stripe: 0, jobber: 0, resend: 0, twilio: 0, zapier: 0, meta_capi: 0, internal: 0,
        };

        for (const row of rows ?? []) {
          const src = row.source as Source;
          if (!(src in sources)) continue; // ignore unknown sources

          const s = sources[src];
          s.total_calls += 1;
          if (row.status === 'success') s.success_count += 1;
          else if (row.status === 'error') s.error_count += 1;
          else if (row.status === 'warning') s.warning_count += 1;

          if (typeof row.latency_ms === 'number') {
            latencySum[src] += row.latency_ms;
            latencyN[src] += 1;
          }

          // Rows are sorted desc — first one we see per source is the latest.
          if (s.last_call_at === null) s.last_call_at = row.created_at as string;
        }

        for (const src of TRACKED_SOURCES) {
          const s = sources[src];
          if (s.total_calls > 0) {
            s.success_rate_pct = Math.round((s.success_count / s.total_calls) * 1000) / 10;
          }
          if (latencyN[src] > 0) {
            s.avg_latency_ms = Math.round(latencySum[src] / latencyN[src]);
          }
        }

        return {
          ok: true as const,
          period: '24h' as const,
          as_of: new Date().toISOString(),
          total_rows_scanned: rows?.length ?? 0,
          sources,
        };
      },
    });

    return jsonResponse(result, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.error('[admin-health] failed', message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
