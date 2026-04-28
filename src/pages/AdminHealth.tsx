/**
 * /admin/health — Phase 8 integration observability dashboard.
 *
 * Calls admin-health every 60s, renders a per-source status table
 * (calls / success rate / avg latency / last call) with traffic-light
 * coloring. Server-side enforces admin role; client falls back to a
 * polite 403 view if the function rejects.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Source =
  | "stripe"
  | "jobber"
  | "resend"
  | "twilio"
  | "zapier"
  | "meta_capi"
  | "internal";

interface SourceSummary {
  total_calls: number;
  success_count: number;
  error_count: number;
  warning_count: number;
  success_rate_pct: number | null;
  avg_latency_ms: number | null;
  last_call_at: string | null;
}

interface HealthResponse {
  ok: true;
  period: "24h";
  as_of: string;
  total_rows_scanned: number;
  sources: Record<Source, SourceSummary>;
}

const SOURCE_ORDER: Source[] = [
  "stripe",
  "jobber",
  "zapier",
  "meta_capi",
  "resend",
  "twilio",
  "internal",
];

const REFRESH_MS = 60_000;

function rateTone(rate: number | null, total: number): string {
  if (total === 0 || rate === null) return "bg-slate-50 text-slate-500";
  if (rate >= 95) return "bg-emerald-50 text-emerald-800";
  if (rate >= 80) return "bg-amber-50 text-amber-800";
  return "bg-rose-50 text-rose-800";
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

export default function AdminHealth() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [reauthing, setReauthing] = useState(false);
  const [reauthError, setReauthError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [brandingSyncing, setBrandingSyncing] = useState(false);
  const [brandingResult, setBrandingResult] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);

  const handleSyncAddonCatalog = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        "sync-addon-stripe-catalog",
        { body: {} },
      );
      if (invokeErr) throw new Error(invokeErr.message);
      if (!resp?.ok && (resp?.errors?.length ?? 0) > 0) {
        setSyncResult(`Partial: created ${resp.created?.length ?? 0}, skipped ${resp.skipped?.length ?? 0}, errors ${resp.errors.length}`);
        return;
      }
      setSyncResult(`✓ Created ${resp?.created?.length ?? 0}, skipped ${resp?.skipped?.length ?? 0}`);
    } catch (err) {
      setSyncResult(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleSyncBranding = useCallback(async () => {
    setBrandingSyncing(true);
    setBrandingResult(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        "setup-stripe-branding",
        { body: {} },
      );
      if (invokeErr) throw new Error(invokeErr.message);
      if (!resp?.ok) throw new Error(resp?.error ?? 'Branding sync failed');
      const dashItems = (resp.dashboard_only_items as string[] | undefined)?.length ?? 0;
      setBrandingResult(
        `✓ Branding ${resp.branding_set ? 'set' : 'skipped'} · portal config ${resp.portal_config_id ?? '—'} · ${resp.products_in_portal ?? 0} products · ${resp.webhook_events_added?.length ?? 0} events added · ${dashItems} dashboard-only items remaining`,
      );
    } catch (err) {
      setBrandingResult(err instanceof Error ? err.message : 'Branding sync failed');
    } finally {
      setBrandingSyncing(false);
    }
  }, []);

  const handleBackfill = useCallback(async () => {
    setBackfilling(true);
    setBackfillResult(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        "backfill-stripe-customer-metadata",
        { body: {} },
      );
      if (invokeErr) throw new Error(invokeErr.message);
      if (!resp?.ok) throw new Error(resp?.error ?? 'Backfill failed');
      setBackfillResult(
        `✓ Scanned ${resp.scanned} · patched ${resp.patched} · skipped ${resp.skipped} · errors ${resp.errors?.length ?? 0}`,
      );
    } catch (err) {
      setBackfillResult(err instanceof Error ? err.message : 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  }, []);

  const handleJobberReauth = useCallback(async () => {
    setReauthing(true);
    setReauthError(null);
    try {
      const { data: resp, error: invokeErr } = await supabase.functions.invoke(
        "jobber-authorize-url",
        { body: {} },
      );
      if (invokeErr) throw new Error(invokeErr.message);
      if (!resp?.ok || !resp?.authorize_url) {
        throw new Error(resp?.error ?? "No authorize_url returned");
      }
      window.location.href = resp.authorize_url;
    } catch (err) {
      setReauthError(err instanceof Error ? err.message : "Failed to start re-auth");
    } finally {
      setReauthing(false);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setForbidden(true);
      setLoading(false);
      return;
    }

    const { data: resp, error: invokeErr } = await supabase.functions.invoke(
      "admin-health",
      { body: {} },
    );

    if (invokeErr) {
      // Edge function returns 403 for non-admins; supabase-js wraps that
      // in a generic FunctionsHttpError. Inspect the body where possible.
      const msg = invokeErr.message || "Failed to load health data";
      if (msg.toLowerCase().includes("forbidden") || msg.includes("403")) {
        setForbidden(true);
      } else {
        setError(msg);
      }
      setLoading(false);
      return;
    }

    if (!resp?.ok) {
      if (typeof resp?.error === "string" && resp.error.includes("forbidden")) {
        setForbidden(true);
      } else {
        setError(resp?.error ?? "Unknown error");
      }
      setLoading(false);
      return;
    }

    setData(resp as HealthResponse);
    setLastFetch(Date.now());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = window.setInterval(fetchHealth, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [fetchHealth]);

  const rows = useMemo(() => {
    if (!data) return [];
    return SOURCE_ORDER.map((src) => ({ src, ...data.sources[src] }));
  }, [data]);

  if (forbidden) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-md rounded-xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <p className="text-2xl font-black text-rose-700">403</p>
          <p className="mt-2 text-sm font-semibold text-slate-900">Admin only</p>
          <p className="mt-1 text-xs text-slate-600">
            You must be signed in with an admin account to view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Integration health</h1>
            <p className="mt-2 text-sm text-slate-600">
              Last 24 hours of calls into Stripe, Jobber, Zapier, Meta CAPI and friends.
              Aggregated from <code className="rounded bg-slate-200 px-1.5 py-0.5 text-xs">integration_logs</code>.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleSyncAddonCatalog}
              disabled={syncing}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
              title="Creates Stripe Products + Prices for any addon_catalog row missing IDs."
            >
              {syncing ? "Syncing…" : "Sync Stripe catalog"}
            </button>
            <button
              type="button"
              onClick={handleJobberReauth}
              disabled={reauthing}
              className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              title="Opens Jobber OAuth in this tab. The new refresh token is auto-saved to vault."
            >
              {reauthing ? "Opening…" : "Re-authorize Jobber"}
            </button>
            <button
              type="button"
              onClick={fetchHealth}
              disabled={loading}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>

        {syncResult && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <strong>Catalog sync:</strong> {syncResult}
          </div>
        )}

        {reauthError && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
            <strong>Re-auth failed:</strong> {reauthError}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <p className="font-semibold">Error</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {data && (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>
                As of <strong className="text-slate-700">{new Date(data.as_of).toLocaleString()}</strong>
              </span>
              <span>•</span>
              <span>{data.total_rows_scanned.toLocaleString()} rows scanned</span>
              <span>•</span>
              <span>Auto-refresh every 60s</span>
              {lastFetch > 0 && (
                <>
                  <span>•</span>
                  <span>Last refresh {formatRelative(new Date(lastFetch).toISOString())}</span>
                </>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Source</th>
                    <th className="px-4 py-3 text-right">Calls</th>
                    <th className="px-4 py-3 text-right">Success</th>
                    <th className="px-4 py-3 text-right">Errors</th>
                    <th className="px-4 py-3 text-right">Success rate</th>
                    <th className="px-4 py-3 text-right">Avg latency</th>
                    <th className="px-4 py-3 text-right">Last call</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => {
                    const tone = rateTone(r.success_rate_pct, r.total_calls);
                    return (
                      <tr key={r.src} className={tone}>
                        <td className="px-4 py-3 font-mono text-xs font-bold">{r.src}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.total_calls}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.success_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.error_count}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {r.success_rate_pct === null ? "—" : `${r.success_rate_pct}%`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {r.avg_latency_ms === null ? "—" : `${r.avg_latency_ms} ms`}
                        </td>
                        <td className="px-4 py-3 text-right text-xs">
                          {formatRelative(r.last_call_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">Legend</p>
              <div className="mt-2 flex flex-wrap gap-4">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-emerald-200" /> ≥95% success
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-amber-200" /> 80–95%
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-rose-200" /> &lt;80%
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-slate-200" /> No traffic in 24h
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
